/**
 * Admin dispatch endpoints (mounted at /api/tickets). ADMIN and DISPATCHER only.
 *
 *   GET  /               ?status=NEW,ASSIGNED&q=&uninvoiced=1   ticket queue / board data
 *   GET  /:id            one ticket with the parts the technician logged (with prices, admin only)
 *   POST /:id/assign     { technicianId, priority?, scheduledFor? }  NEW -> ASSIGNED (also re-assigns before check-in)
 *   POST /:id/cancel     { reason }  NEW/ASSIGNED -> CANCELLED (duplicates, spam)
 *
 * A ticket is a service_jobs row; assigning creates (or re-targets) the technician's visit.
 */
import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../db';
import { requireAuth, requireRole } from '../../auth';
import { HttpError, handle, uuidParam } from '../../http';

export const ticketsRouter = Router();
ticketsRouter.use(requireAuth, requireRole('ADMIN', 'DISPATCHER'));

export const TICKET_SELECT = `
  SELECT j.id, j.job_no::int AS "ticketNo", j.status, j.priority, j.source,
         j.created_at AS "createdAt", j.solved_at AS "solvedAt",
         c.id AS "customerId", c.name AS "customerName",
         COALESCE(j.requester_name, s.contact_name) AS "contactName",
         COALESCE(j.requester_phone, s.contact_phone, c.phone) AS phone,
         COALESCE(j.service_address, s.address) AS address, s.city,
         COALESCE(a.serial_number, j.serial_reported) AS "serialNumber", (j.asset_id IS NOT NULL) AS "serialRecognised",
         COALESCE(m.name, pr.name) AS model, j.product_id AS "productId", sv.name AS service, j.service_id AS "serviceId",
         ic.name AS issue, j.description,
         lv.id AS "visitId", lv.technician_id AS "technicianId", t.full_name AS "technicianName",
         ab.full_name AS "assignedByName", lv.assigned_at AS "assignedAt",
         lv.status AS "visitStatus", lv.warranty_status AS "warrantyStatus", lv.work_done AS "workDone",
         lv.checked_in_at AS "checkedInAt", lv.completed_at AS "completedAt", to_char(lv.warranty_end_snapshot, 'YYYY-MM-DD') AS "warrantyEnd",
         qt.id AS "quotationId", qt.quotation_no AS "quotationNo", qt.status AS "quotationStatus", qt.total_paise AS "quotationTotalPaise",
         i.id AS "invoiceId", i.invoice_no AS "invoiceNo", i.total_paise AS "invoiceTotalPaise"
    FROM service_jobs j
    JOIN customers c ON c.id = j.customer_id
    JOIN customer_sites s ON s.id = j.site_id
    LEFT JOIN assets a ON a.id = j.asset_id
    LEFT JOIN catalog_items m ON m.id = a.model_id
    LEFT JOIN catalog_items pr ON pr.id = j.product_id
    LEFT JOIN catalog_items sv ON sv.id = j.service_id
    LEFT JOIN issue_categories ic ON ic.id = j.issue_category_id
    LEFT JOIN LATERAL (
      SELECT v.id, v.technician_id, v.status, v.warranty_status, v.work_done, v.assigned_by, v.assigned_at, v.checked_in_at, v.completed_at, v.warranty_end_snapshot
        FROM visits v
       WHERE v.job_id = j.id AND v.status <> 'CANCELLED'
       ORDER BY (v.status = 'COMPLETED'), v.completed_at DESC NULLS LAST, v.scheduled_for DESC
       LIMIT 1) lv ON true
    LEFT JOIN users t ON t.id = lv.technician_id
    LEFT JOIN users ab ON ab.id = lv.assigned_by
    LEFT JOIN quotations qt ON qt.visit_id = lv.id
    LEFT JOIN invoices i ON i.visit_id = lv.id`;

export function mapTicket(r: any) {
  const { invoiceId, invoiceNo, invoiceTotalPaise, visitId, quotationId, quotationNo, quotationStatus, quotationTotalPaise, ...rest } = r;
  return {
    ...rest,
    quotation: quotationId ? { id: quotationId, quotationNo, status: quotationStatus, totalPaise: Number(quotationTotalPaise) } : null,
    invoice: invoiceId ? { id: invoiceId, invoiceNo, totalPaise: Number(invoiceTotalPaise) } : null,
  };
}

const STATUSES = ['NEW', 'ASSIGNED', 'IN_PROGRESS', 'SOLVED', 'CANCELLED'] as const;
const listQuery = z.object({
  status: z.string().optional().transform((s) => (s ? s.split(',') : [])).pipe(z.array(z.enum(STATUSES))),
  q: z.string().trim().max(100).default(''),
  uninvoiced: z.enum(['0', '1']).default('0'),
});

ticketsRouter.get('/', handle(async (req, res) => {
  const f = listQuery.parse(req.query);
  const { rows } = await pool.query(
    `${TICKET_SELECT}
      WHERE (cardinality($1::job_status[]) = 0 OR j.status = ANY($1::job_status[]))
        AND ($2::text = '' OR c.name ILIKE '%' || $2::text || '%'
             OR COALESCE(a.serial_number, j.serial_reported) ILIKE '%' || $2::text || '%' OR j.job_no::text = $2::text)
        AND ($3::boolean = false OR j.status <> 'SOLVED' OR i.id IS NULL)
      ORDER BY j.created_at DESC LIMIT 300`,
    [f.status, f.q, f.uninvoiced === '1'],
  );
  res.json(rows.map(mapTicket));
}));

ticketsRouter.get('/:id', handle(async (req, res) => {
  const id = uuidParam.parse(req.params.id);
  const { rows } = await pool.query(`${TICKET_SELECT} WHERE j.id = $1`, [id]);
  if (!rows[0]) throw new HttpError(404, 'Ticket not found');
  const parts = rows[0].visitId
    ? (await pool.query(
        `SELECT description, quantity, unit_price_paise, warranty_waived FROM visit_parts WHERE visit_id = $1 ORDER BY description`, [rows[0].visitId])).rows
    : [];
  // Odoo-style history: everything that happened to this ticket, its quotation and its invoice.
  const activity = (await pool.query(
    `SELECT a.at, a.action, u.full_name AS actor, a.detail
       FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
      WHERE (a.entity = 'ticket' AND a.entity_id = $1)
         OR (a.entity = 'quotation' AND a.entity_id IN (SELECT q.id FROM quotations q JOIN visits v ON v.id = q.visit_id WHERE v.job_id = $1))
         OR (a.entity = 'invoice' AND a.entity_id IN (SELECT i.id FROM invoices i JOIN visits v ON v.id = i.visit_id WHERE v.job_id = $1))
      ORDER BY a.at, a.id`, [id])).rows;
  res.json({
    ...mapTicket(rows[0]),
    parts: parts.map((p) => ({ description: p.description, quantity: p.quantity, unitPricePaise: Number(p.unit_price_paise), warrantyWaived: p.warranty_waived })),
    activity,
  });
}));

const assignSchema = z.object({
  technicianId: z.string().uuid(),
  priority: z.number().int().min(1).max(3).optional(),
  scheduledFor: z.string().datetime({ offset: true }).optional(),
});

ticketsRouter.post('/:id/assign', handle(async (req, res) => {
  const id = uuidParam.parse(req.params.id);
  const body = assignSchema.parse(req.body);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const t = await client.query(`SELECT status FROM service_jobs WHERE id = $1 FOR UPDATE`, [id]);
    if (!t.rows[0]) throw new HttpError(404, 'Ticket not found');
    if (t.rows[0].status !== 'NEW' && t.rows[0].status !== 'ASSIGNED') throw new HttpError(409, `Ticket is ${t.rows[0].status}; it can no longer be (re)assigned`);
    const tech = await client.query(`SELECT 1 FROM users WHERE id = $1 AND role = 'TECHNICIAN' AND is_active`, [body.technicianId]);
    if (!tech.rows[0]) throw new HttpError(422, 'Choose an active technician');

    const moved = await client.query(
      `UPDATE visits SET technician_id = $2, scheduled_for = COALESCE($3::timestamptz, scheduled_for), assigned_by = $4, assigned_at = now()
        WHERE job_id = $1 AND status = 'SCHEDULED'`,
      [id, body.technicianId, body.scheduledFor ?? null, req.user!.id],
    );
    if (moved.rowCount === 0) {
      await client.query(
        `INSERT INTO visits (job_id, technician_id, scheduled_for, status, assigned_by) VALUES ($1, $2, COALESCE($3::timestamptz, now()), 'SCHEDULED', $4)`,
        [id, body.technicianId, body.scheduledFor ?? null, req.user!.id],
      );
    }
    await client.query(`UPDATE service_jobs SET status = 'ASSIGNED', priority = COALESCE($2, priority) WHERE id = $1`, [id, body.priority ?? null]);
    await client.query(
      `INSERT INTO audit_log (actor_id, action, entity, entity_id, detail) VALUES ($1, 'ticket.assign', 'ticket', $2, $3)`,
      [req.user!.id, id, JSON.stringify({ technicianId: body.technicianId, priority: body.priority ?? null })],
    );
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}));

ticketsRouter.post('/:id/cancel', handle(async (req, res) => {
  const id = uuidParam.parse(req.params.id);
  const { reason } = z.object({ reason: z.string().trim().min(3).max(300) }).parse(req.body);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const t = await client.query(`SELECT status FROM service_jobs WHERE id = $1 FOR UPDATE`, [id]);
    if (!t.rows[0]) throw new HttpError(404, 'Ticket not found');
    if (t.rows[0].status !== 'NEW' && t.rows[0].status !== 'ASSIGNED') throw new HttpError(409, `Ticket is ${t.rows[0].status}; it cannot be cancelled`);
    await client.query(`UPDATE visits SET status = 'CANCELLED' WHERE job_id = $1 AND status = 'SCHEDULED'`, [id]);
    await client.query(`UPDATE service_jobs SET status = 'CANCELLED' WHERE id = $1`, [id]);
    await client.query(
      `INSERT INTO audit_log (actor_id, action, entity, entity_id, detail) VALUES ($1, 'ticket.cancel', 'ticket', $2, $3)`,
      [req.user!.id, id, JSON.stringify({ reason })],
    );
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}));
