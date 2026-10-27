/**
 * Admin reports (mounted at /api/reports). ADMIN and DISPATCHER only. Every report takes an optional date range
 * (from / to, inclusive, YYYY-MM-DD in IST).
 *
 *   GET /tickets       filtered ticket list + totals + day-wise summary
 *                      ?from&to&customerId&technicianId&productId&serviceId&status=NEW,SOLVED&q=
 *   GET /technicians   per technician: assigned, active (now), visits (check-ins), solved
 *   GET /customers     per customer: tickets raised / solved / open in the range
 *
 * A ticket's date is the day it was raised. "Assigned to" is its current technician, "Assigned by" whoever dispatched it.
 */
import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../db';
import { requireAuth, requireRole } from '../../auth';
import { handle } from '../../http';
import { TICKET_SELECT, mapTicket } from '../tickets/tickets.routes';

export const reportsRouter = Router();
reportsRouter.use(requireAuth, requireRole('ADMIN', 'DISPATCHER'));

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional();
const uuid = z.string().uuid().optional();
const STATUSES = ['NEW', 'ASSIGNED', 'IN_PROGRESS', 'SOLVED', 'CANCELLED'] as const;
const ROW_LIMIT = 2000;

/** SQL: `col` (timestamptz) falls on or between $from and $to, as IST calendar days. Params are given by position. */
const inRange = (col: string, from: number, to: number) =>
  `(($${from}::date IS NULL OR (${col} AT TIME ZONE 'Asia/Kolkata')::date >= $${from}::date)
    AND ($${to}::date IS NULL OR (${col} AT TIME ZONE 'Asia/Kolkata')::date <= $${to}::date))`;

const rangeQuery = z.object({ from: day, to: day });

reportsRouter.get('/tickets', handle(async (req, res) => {
  const f = z.object({
    from: day, to: day, customerId: uuid, technicianId: uuid, productId: uuid, serviceId: uuid,
    status: z.string().optional().transform((s) => (s ? s.split(',') : [])).pipe(z.array(z.enum(STATUSES))),
    q: z.string().trim().max(100).default(''),
  }).parse(req.query);

  const params = [f.from ?? null, f.to ?? null, f.customerId ?? null, f.technicianId ?? null, f.productId ?? null, f.serviceId ?? null, f.status, f.q];
  const filtered = `${TICKET_SELECT}
    WHERE ${inRange('j.created_at', 1, 2)}
      AND ($3::uuid IS NULL OR j.customer_id = $3::uuid)
      AND ($4::uuid IS NULL OR lv.technician_id = $4::uuid)
      AND ($5::uuid IS NULL OR COALESCE(j.product_id, a.model_id) = $5::uuid)
      AND ($6::uuid IS NULL OR j.service_id = $6::uuid)
      AND (cardinality($7::job_status[]) = 0 OR j.status = ANY($7::job_status[]))
      AND ($8::text = '' OR c.name ILIKE '%' || $8::text || '%'
           OR COALESCE(a.serial_number, j.serial_reported) ILIKE '%' || $8::text || '%' OR j.job_no::text = $8::text)`;

  const [rows, daily] = await Promise.all([
    pool.query(`${filtered} ORDER BY j.created_at DESC LIMIT ${ROW_LIMIT + 1}`, params),
    pool.query(
      `SELECT to_char((t."createdAt" AT TIME ZONE 'Asia/Kolkata')::date, 'YYYY-MM-DD') AS day,
              count(*)::int AS raised,
              (count(*) FILTER (WHERE t.status = 'SOLVED'))::int AS solved,
              (count(*) FILTER (WHERE t.status IN ('NEW', 'ASSIGNED', 'IN_PROGRESS')))::int AS open,
              (count(*) FILTER (WHERE t.status = 'CANCELLED'))::int AS cancelled
         FROM (${filtered}) t GROUP BY 1 ORDER BY 1 DESC`, params),
  ]);

  const sum = (k: 'raised' | 'solved' | 'open' | 'cancelled') => daily.rows.reduce((s, d) => s + d[k], 0);
  res.json({
    rows: rows.rows.slice(0, ROW_LIMIT).map(mapTicket),
    truncated: rows.rows.length > ROW_LIMIT,
    summary: { raised: sum('raised'), solved: sum('solved'), open: sum('open'), cancelled: sum('cancelled') },
    daily: daily.rows,
  });
}));

reportsRouter.get('/technicians', handle(async (req, res) => {
  const r = rangeQuery.parse(req.query);
  const { rows } = await pool.query(
    `SELECT u.id, u.full_name AS name,
            (count(v.id) FILTER (WHERE v.status IN ('SCHEDULED', 'CHECKED_IN')))::int AS "activeTickets",
            (count(v.id) FILTER (WHERE ${inRange('v.assigned_at', 1, 2)}))::int AS assigned,
            (count(v.id) FILTER (WHERE v.checked_in_at IS NOT NULL AND ${inRange('v.checked_in_at', 1, 2)}))::int AS "totalVisits",
            (count(v.id) FILTER (WHERE v.status = 'COMPLETED' AND ${inRange('v.completed_at', 1, 2)}))::int AS "solvedTickets",
            max(v.completed_at) AS "lastSolvedAt"
       FROM users u LEFT JOIN visits v ON v.technician_id = u.id
      WHERE u.role = 'TECHNICIAN' AND u.is_active
      GROUP BY u.id, u.full_name ORDER BY u.full_name`,
    [r.from ?? null, r.to ?? null],
  );
  res.json(rows);
}));

reportsRouter.get('/customers', handle(async (req, res) => {
  const r = rangeQuery.extend({ q: z.string().trim().max(100).default('') }).parse(req.query);
  const { rows } = await pool.query(
    `SELECT c.id, c.name, c.phone,
            count(j.id)::int AS "ticketsRaised",
            (count(j.id) FILTER (WHERE j.status = 'SOLVED'))::int AS "ticketsSolved",
            (count(j.id) FILTER (WHERE j.status IN ('NEW', 'ASSIGNED', 'IN_PROGRESS')))::int AS "ticketsOpen",
            max(j.created_at) AS "lastTicketAt"
       FROM customers c JOIN service_jobs j ON j.customer_id = c.id AND ${inRange('j.created_at', 1, 2)}
      WHERE ($3::text = '' OR c.name ILIKE '%' || $3::text || '%')
      GROUP BY c.id, c.name, c.phone ORDER BY count(j.id) DESC, c.name LIMIT 300`,
    [r.from ?? null, r.to ?? null, r.q],
  );
  res.json(rows);
}));
