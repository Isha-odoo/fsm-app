/**
 * Quotations (mounted at /api/quotations). A technician creates one when solving a ticket (see visits module).
 *   GET  /?status=&q=&from=&to=   list all quotations (ADMIN, DISPATCHER)
 *   GET  /:id                     printable document (staff, or the technician who made it)
 *   POST /:id/share-link          a fresh customer link { url } (staff, or the technician who made it)
 *   POST /:id/decision            record the customer's answer { decision: APPROVED | REJECTED, note? } (staff)
 * Customers open the link at /q/<token> (public module) and can approve or reject there.
 */
import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../db';
import { requireAuth, requireRole } from '../../auth';
import { HttpError, handle, uuidParam } from '../../http';
import { loadQuotation } from '../documents/documents';
import { createShareLink } from './quote';

export const quotationsRouter = Router();
quotationsRouter.use(requireAuth);
const staff = requireRole('ADMIN', 'DISPATCHER');

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional();

quotationsRouter.get('/', staff, handle(async (req, res) => {
  const f = z.object({ status: z.enum(['DRAFT', 'SHARED', 'APPROVED', 'REJECTED']).optional(), q: z.string().trim().max(100).default(''), from: day, to: day }).parse(req.query);
  const { rows } = await pool.query(
    `SELECT q.id, q.quotation_no AS "quotationNo", q.status, q.created_at AS "createdAt", q.total_paise AS "totalPaise",
            j.id AS "ticketId", j.job_no::int AS "ticketNo", c.name AS "customerName", t.full_name AS "technicianName",
            COALESCE(m.name, pr.name) AS product, i.id AS "invoiceId", i.invoice_no AS "invoiceNo"
       FROM quotations q
       JOIN visits v ON v.id = q.visit_id
       JOIN service_jobs j ON j.id = v.job_id
       JOIN customers c ON c.id = j.customer_id
       LEFT JOIN users t ON t.id = v.technician_id
       LEFT JOIN assets a ON a.id = j.asset_id
       LEFT JOIN catalog_items m ON m.id = a.model_id
       LEFT JOIN catalog_items pr ON pr.id = j.product_id
       LEFT JOIN invoices i ON i.quotation_id = q.id AND i.status <> 'VOID'
      WHERE ($1::quotation_status IS NULL OR q.status = $1::quotation_status)
        AND ($2::text = '' OR c.name ILIKE '%' || $2::text || '%' OR q.quotation_no ILIKE '%' || $2::text || '%' OR j.job_no::text = $2::text)
        AND ($3::date IS NULL OR (q.created_at AT TIME ZONE 'Asia/Kolkata')::date >= $3::date)
        AND ($4::date IS NULL OR (q.created_at AT TIME ZONE 'Asia/Kolkata')::date <= $4::date)
      ORDER BY q.created_at DESC LIMIT 300`,
    [f.status ?? null, f.q, f.from ?? null, f.to ?? null],
  );
  res.json(rows.map((r) => ({ ...r, totalPaise: Number(r.totalPaise) })));
}));

async function loadForUser(id: string, user: { id: string; role: string }) {
  const found = await loadQuotation(pool, { id });
  // 404 rather than 403 so technicians cannot probe for other people's quotations
  if (!found || (user.role === 'TECHNICIAN' && found.createdBy !== user.id)) throw new HttpError(404, 'Quotation not found');
  return found;
}

quotationsRouter.get('/:id', handle(async (req, res) => {
  res.json((await loadForUser(uuidParam.parse(req.params.id), req.user!)).doc);
}));

quotationsRouter.post('/:id/share-link', handle(async (req, res) => {
  const id = uuidParam.parse(req.params.id);
  await loadForUser(id, req.user!);
  res.json({ url: await createShareLink(pool, id) });
}));

quotationsRouter.post('/:id/decision', staff, handle(async (req, res) => {
  const id = uuidParam.parse(req.params.id);
  const b = z.object({ decision: z.enum(['APPROVED', 'REJECTED']), note: z.string().trim().max(300).optional() }).parse(req.body);
  const r = await pool.query(
    `UPDATE quotations SET status = $2::quotation_status, decided_at = now(), decided_by = $3, decision_note = $4 WHERE id = $1 AND status <> 'DRAFT'`,
    [id, b.decision, req.user!.id, b.note || null]);
  if (r.rowCount === 0) throw new HttpError(404, 'Quotation not found');
  await pool.query(`INSERT INTO audit_log (actor_id, action, entity, entity_id, detail) VALUES ($1, 'quotation.decision', 'quotation', $2, $3)`,
    [req.user!.id, id, JSON.stringify({ decision: b.decision, note: b.note ?? null, by: 'staff' })]);
  res.json({ ok: true });
}));
