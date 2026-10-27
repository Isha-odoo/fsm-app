/**
 * Admin invoicing (mounted at /api/invoices). ADMIN only.
 *
 *   GET  /?q=&from=&to=   invoices list
 *   GET  /:id             printable invoice document
 *   POST /preview   { ticketId, extraItems? }   totals for a SOLVED ticket, nothing is stored
 *   POST /          { ticketId, extraItems? }   issue the GST invoice (strict gapless numbering per financial year)
 *
 * Lines = the parts the technician logged (price snapshot, warranty-waived lines at 0) + optional extra items the admin
 * picks from the catalog (e.g. "Service visit charge"). Extra items are waived when the visit's warranty snapshot was
 * IN_WARRANTY and the item is covered by warranty. One invoice per visit (invoices.visit_id is unique).
 */
import { Router } from 'express';
import { z } from 'zod';
import type { Pool, PoolClient } from 'pg';
import { config } from '../../config';
import { pool } from '../../db';
import { requireAuth, requireRole } from '../../auth';
import { HttpError, handle, uuidParam } from '../../http';
import { loadInvoice } from '../documents/documents';
import { todayIST } from '../warranty/warranty.service';
import { computeTax, financialYear } from './invoice.calc';

export const invoicesRouter = Router();
invoicesRouter.use(requireAuth, requireRole('ADMIN'));

const bodySchema = z.object({
  ticketId: z.string().uuid(),
  extraItems: z.array(z.object({ catalogItemId: z.string().uuid(), quantity: z.number().int().min(1).max(100) })).max(20).default([]),
});
type Body = z.infer<typeof bodySchema>;

async function buildInvoice(db: Pool | PoolClient, body: Body, lock: boolean) {
  const t = await db.query(
    `SELECT j.status, j.customer_id, s.state_code, lv.id AS visit_id, lv.warranty_status
       FROM service_jobs j
       JOIN customer_sites s ON s.id = j.site_id
       LEFT JOIN LATERAL (
         SELECT v.id, v.warranty_status FROM visits v WHERE v.job_id = j.id AND v.status = 'COMPLETED' ORDER BY v.completed_at DESC LIMIT 1) lv ON true
      WHERE j.id = $1${lock ? ' FOR UPDATE OF j' : ''}`,
    [body.ticketId],
  );
  const ticket = t.rows[0];
  if (!ticket) throw new HttpError(404, 'Ticket not found');
  if (ticket.status !== 'SOLVED' || !ticket.visit_id) throw new HttpError(409, 'Only solved tickets can be invoiced');
  const prior = await db.query(`SELECT invoice_no FROM invoices WHERE visit_id = $1`, [ticket.visit_id]);
  if (prior.rows[0]) throw new HttpError(409, `Already invoiced as ${prior.rows[0].invoice_no}`);

  const inWarranty = ticket.warranty_status === 'IN_WARRANTY';
  const lines: { catalogItemId: string; description: string; hsn: string | null; quantity: number; unit: number; gstRateBp: number; waived: boolean; lineTotal: number }[] = [];

  const parts = await db.query(
    `SELECT vp.catalog_item_id, vp.description, vp.quantity, vp.unit_price_paise, vp.warranty_waived, vp.hsn_sac, vp.gst_rate_bp
       FROM visit_parts vp WHERE vp.visit_id = $1 ORDER BY vp.description`,
    [ticket.visit_id],
  );
  for (const p of parts.rows) {
    const unit = Number(p.unit_price_paise);
    lines.push({ catalogItemId: p.catalog_item_id, description: p.description, hsn: p.hsn_sac, quantity: p.quantity, unit, gstRateBp: p.gst_rate_bp, waived: p.warranty_waived, lineTotal: p.warranty_waived ? 0 : unit * p.quantity });
  }

  const qtyById = new Map<string, number>();
  for (const it of body.extraItems) qtyById.set(it.catalogItemId, (qtyById.get(it.catalogItemId) ?? 0) + it.quantity);
  if (qtyById.size) {
    const extra = await db.query(
      `SELECT id, name, unit_price_paise, warranty_covers, hsn_sac, gst_rate_bp FROM catalog_items WHERE id = ANY($1::uuid[]) AND is_active`, [[...qtyById.keys()]]);
    if (extra.rows.length !== qtyById.size) throw new HttpError(422, 'One or more extra items are unknown or inactive');
    for (const c of extra.rows) {
      const qty = qtyById.get(c.id)!;
      const unit = Number(c.unit_price_paise);
      const waived = inWarranty && c.warranty_covers === true;
      lines.push({ catalogItemId: c.id, description: c.name, hsn: c.hsn_sac, quantity: qty, unit, gstRateBp: c.gst_rate_bp, waived, lineTotal: waived ? 0 : unit * qty });
    }
  }

  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  const tax = computeTax(lines.map((l) => ({ lineTotalPaise: l.lineTotal, gstRateBp: l.gstRateBp })), String(ticket.state_code).trim() === config.SELLER_STATE_CODE);
  return { ticket, lines, subtotal, ...tax, total: subtotal + tax.taxPaise };
}

const toPreview = (inv: Awaited<ReturnType<typeof buildInvoice>>) => ({
  lines: inv.lines.map((l) => ({ description: l.description, quantity: l.quantity, unitPricePaise: l.unit, gstRateBp: l.gstRateBp, warrantyWaived: l.waived, lineTotalPaise: l.lineTotal })),
  subtotalPaise: inv.subtotal, cgstPaise: inv.cgstPaise, sgstPaise: inv.sgstPaise, igstPaise: inv.igstPaise, totalPaise: inv.total,
});

invoicesRouter.post('/preview', handle(async (req, res) => {
  res.json(toPreview(await buildInvoice(pool, bodySchema.parse(req.body), false)));
}));

invoicesRouter.post('/', handle(async (req, res) => {
  const body = bodySchema.parse(req.body);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const inv = await buildInvoice(client, body, true);

    // Gapless numbering: the counter row is locked until COMMIT, and a rollback also rolls the counter back.
    const fy = financialYear(todayIST());
    const n = (await client.query(
      `INSERT INTO invoice_counters (fy, last_no) VALUES ($1, 1) ON CONFLICT (fy) DO UPDATE SET last_no = invoice_counters.last_no + 1 RETURNING last_no`, [fy])).rows[0].last_no;
    const invoiceNo = `BPP/${fy}/${String(n).padStart(6, '0')}`;

    const row = (await client.query(
      `INSERT INTO invoices (invoice_no, visit_id, customer_id, issued_by, place_of_supply, subtotal_paise, cgst_paise, sgst_paise, igst_paise, total_paise, quotation_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, (SELECT id FROM quotations WHERE visit_id = $2)) RETURNING id`,
      [invoiceNo, inv.ticket.visit_id, inv.ticket.customer_id, req.user!.id, inv.ticket.state_code, inv.subtotal, inv.cgstPaise, inv.sgstPaise, inv.igstPaise, inv.total],
    )).rows[0];
    for (const l of inv.lines) {
      await client.query(
        `INSERT INTO invoice_items (invoice_id, catalog_item_id, description, hsn_sac, quantity, unit_price_paise, gst_rate_bp, warranty_waived, line_total_paise)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [row.id, l.catalogItemId, l.description, l.hsn, l.quantity, l.unit, l.gstRateBp, l.waived, l.lineTotal],
      );
    }
    await client.query(
      `INSERT INTO audit_log (actor_id, action, entity, entity_id, detail) VALUES ($1, 'invoice.create', 'invoice', $2, $3)`,
      [req.user!.id, row.id, JSON.stringify({ invoiceNo, ticketId: body.ticketId, totalPaise: inv.total })],
    );
    await client.query('COMMIT');
    res.status(201).json({ invoice: { id: row.id, invoiceNo, totalPaise: inv.total }, ...toPreview(inv) });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    if ((err as { code?: string }).code === '23505') throw new HttpError(409, 'This ticket already has an invoice');
    throw err;
  } finally {
    client.release();
  }
}));

invoicesRouter.get('/', handle(async (req, res) => {
  const f = z.object({ q: z.string().trim().max(100).default(''), from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).parse(req.query);
  const { rows } = await pool.query(
    `SELECT i.id, i.invoice_no AS "invoiceNo", i.issued_at AS "issuedAt", i.status, i.total_paise AS "totalPaise",
            c.name AS "customerName", j.job_no::int AS "ticketNo", j.id AS "ticketId", qt.quotation_no AS "quotationNo", u.full_name AS "issuedBy"
       FROM invoices i
       JOIN customers c ON c.id = i.customer_id
       JOIN visits v ON v.id = i.visit_id
       JOIN service_jobs j ON j.id = v.job_id
       LEFT JOIN quotations qt ON qt.id = i.quotation_id
       LEFT JOIN users u ON u.id = i.issued_by
      WHERE ($1::text = '' OR c.name ILIKE '%' || $1::text || '%' OR i.invoice_no ILIKE '%' || $1::text || '%' OR j.job_no::text = $1::text)
        AND ($2::date IS NULL OR (i.issued_at AT TIME ZONE 'Asia/Kolkata')::date >= $2::date)
        AND ($3::date IS NULL OR (i.issued_at AT TIME ZONE 'Asia/Kolkata')::date <= $3::date)
      ORDER BY i.issued_at DESC LIMIT 300`,
    [f.q, f.from ?? null, f.to ?? null],
  );
  res.json(rows.map((r) => ({ ...r, totalPaise: Number(r.totalPaise) })));
}));

invoicesRouter.get('/:id', handle(async (req, res) => {
  const doc = await loadInvoice(pool, uuidParam.parse(req.params.id));
  if (!doc) throw new HttpError(404, 'Invoice not found');
  res.json(doc);
}));
