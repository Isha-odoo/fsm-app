/**
 * Technician endpoints (mounted at /api/visits). A "visit" is one assigned ticket on a technician's phone.
 *
 *   GET  /me?date=YYYY-MM-DD   my open tickets + tickets I solved on that date (default today, IST)
 *   GET  /:id                  ticket detail (customer, site, machine; lines and quotation once solved)
 *   GET  /:id/warranty         warranty decision for the machine, evaluated now (IST)
 *   POST /:id/check-in         arrive on site (optional GPS)
 *   POST /:id/solve/preview    price the items (warranty-aware, with GST) before saving
 *   POST /:id/solve            mark the ticket SOLVED: solution + items used. Creates the customer's QUOTATION and a share link.
 *
 * Billing: technicians quote (prices come from the catalog, warranty decides what is free). Only admins issue invoices.
 *
 * Security notes:
 *  - Auth: JWT -> req.user { id, role }. Technicians can only see and act on their OWN visits.
 *  - zod validation on every input; all SQL is parameterised.
 *  - Warranty coverage and prices come from catalog_items / assets on the server, never from the client.
 *  - Idempotency-Key header: a retry after a dropped connection returns the same result instead of an error.
 */
import { Router } from 'express';
import { z } from 'zod';
import type { Pool, PoolClient } from 'pg';
import { pool } from '../../db';
import { requireAuth, requireRole } from '../../auth';
import { HttpError, handle, uuidParam } from '../../http';
import { getAssetWarranty, todayIST, type WarrantyResult } from '../warranty/warranty.service';
import { createShareLink, priceLines, quoteTotals } from '../quotations/quote';

type AuthUser = { id: string; role: 'ADMIN' | 'DISPATCHER' | 'TECHNICIAN' };

export const visitsRouter = Router();
visitsRouter.use(requireAuth, requireRole('TECHNICIAN', 'DISPATCHER', 'ADMIN'));

// ───────────────────────── shared query ─────────────────────────
const VISIT_SELECT = `
  SELECT v.id, v.technician_id AS "technicianId", j.job_no::int AS "jobNo", v.status,
         v.scheduled_for AS "scheduledFor", v.work_done AS "workDone",
         c.name AS "customerName", COALESCE(j.requester_phone, c.phone) AS "customerPhone",
         s.label AS "siteLabel", COALESCE(j.service_address, s.address) AS address, s.city,
         CASE WHEN j.service_address IS NULL THEN s.latitude END AS latitude,
         CASE WHEN j.service_address IS NULL THEN s.longitude END AS longitude,
         COALESCE(j.requester_name, s.contact_name) AS "contactName",
         COALESCE(j.requester_phone, s.contact_phone) AS "contactPhone",
         j.description, j.priority, ic.name AS issue,
         j.asset_id AS "assetId", COALESCE(m.name, pr.name) AS "assetModel", sv.name AS service,
         COALESCE(a.serial_number, j.serial_reported) AS "serialNumber"
    FROM visits v
    JOIN service_jobs j      ON j.id = v.job_id
    JOIN customers c         ON c.id = j.customer_id
    JOIN customer_sites s    ON s.id = j.site_id
    LEFT JOIN assets a       ON a.id = j.asset_id
    LEFT JOIN catalog_items m ON m.id = a.model_id
    LEFT JOIN catalog_items pr ON pr.id = j.product_id
    LEFT JOIN catalog_items sv ON sv.id = j.service_id
    LEFT JOIN issue_categories ic ON ic.id = j.issue_category_id`;

function mapVisit(r: any) {
  const { technicianId, latitude, longitude, ...rest } = r;
  return {
    ...rest,
    serialRecognised: !!rest.assetId,
    latitude: latitude == null ? null : Number(latitude),   // pg returns numeric as string
    longitude: longitude == null ? null : Number(longitude),
  };
}

async function loadVisitRow(db: Pool | PoolClient, visitId: string, user: AuthUser) {
  const { rows } = await db.query(`${VISIT_SELECT} WHERE v.id = $1`, [visitId]);
  if (rows.length === 0) throw new HttpError(404, 'Visit not found');
  // 404 (not 403) so technicians cannot probe for other people's visit ids
  if (user.role === 'TECHNICIAN' && rows[0].technicianId !== user.id) throw new HttpError(404, 'Visit not found');
  return rows[0];
}

// ───────────────────────── reads ─────────────────────────
visitsRouter.get('/me', handle(async (req, res) => {
  const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default(todayIST()).parse(req.query.date ?? undefined);
  const { rows } = await pool.query(
    `${VISIT_SELECT}
      WHERE v.technician_id = $1
        AND (v.status IN ('SCHEDULED', 'CHECKED_IN') OR (v.status = 'COMPLETED' AND v.service_date = $2::date))
      ORDER BY (v.status = 'COMPLETED'), j.priority, v.scheduled_for NULLS LAST`,
    [req.user!.id, date],
  );
  res.json(rows.map(mapVisit).map(({ workDone, ...v }) => v));
}));

visitsRouter.get('/:id', handle(async (req, res) => {
  const id = uuidParam.parse(req.params.id);
  const row = await loadVisitRow(pool, id, req.user!);
  const lines = row.status === 'COMPLETED'
    ? (await pool.query(
        `SELECT description, quantity, warranty_waived AS "warrantyWaived", unit_price_paise, gst_rate_bp AS "gstRateBp" FROM visit_parts WHERE visit_id = $1 ORDER BY description`, [id])).rows
        .map((p) => ({ description: p.description, quantity: p.quantity, warrantyWaived: p.warrantyWaived, gstRateBp: p.gstRateBp, unitPricePaise: Number(p.unit_price_paise), lineTotalPaise: p.warrantyWaived ? 0 : Number(p.unit_price_paise) * p.quantity }))
    : [];
  const q = row.status === 'COMPLETED'
    ? (await pool.query(`SELECT id, quotation_no AS "quotationNo", status, total_paise AS "totalPaise" FROM quotations WHERE visit_id = $1`, [id])).rows[0]
    : undefined;
  res.json({ ...mapVisit(row), parts: lines, quotation: q ? { ...q, totalPaise: Number(q.totalPaise) } : null });
}));

visitsRouter.get('/:id/warranty', handle(async (req, res) => {
  const id = uuidParam.parse(req.params.id);
  const visit = await loadVisitRow(pool, id, req.user!);
  if (!visit.assetId) return res.json(null); // serial not matched to a machine on file: nothing to evaluate
  res.json(await getAssetWarranty(pool, visit.assetId, todayIST()));
}));

// ───────────────────────── check-in ─────────────────────────
const checkInSchema = z.object({ lat: z.number().min(-90).max(90).optional(), lng: z.number().min(-180).max(180).optional() });

visitsRouter.post('/:id/check-in', handle(async (req, res) => {
  const id = uuidParam.parse(req.params.id);
  const body = checkInSchema.parse(req.body ?? {});
  await loadVisitRow(pool, id, req.user!); // ownership check
  const { rowCount } = await pool.query(
    `UPDATE visits SET status = 'CHECKED_IN', checked_in_at = now(), checkin_lat = $2, checkin_lng = $3
      WHERE id = $1 AND status = 'SCHEDULED'`,
    [id, body.lat ?? null, body.lng ?? null],
  );
  if (rowCount === 0) throw new HttpError(409, 'Visit is not in SCHEDULED state');
  await pool.query(`UPDATE service_jobs SET status = 'IN_PROGRESS' WHERE id = (SELECT job_id FROM visits WHERE id = $1)`, [id]);
  res.json({ ok: true });
}));

// ───────────────────────── solve + quotation ─────────────────────────
const itemsSchema = z.array(z.object({ catalogItemId: z.string().uuid(), quantity: z.number().int().min(1).max(1000) })).max(50);
const solveSchema = z.object({
  workDone: z.string().trim().min(3).max(4000),     // the solution
  issueCategoryId: z.number().int().positive().optional(),
  items: itemsSchema,                               // parts, consumables and services used; may be empty (free fix)
});

/** Live price check while the technician builds the quotation. Nothing is saved. */
visitsRouter.post('/:id/solve/preview', handle(async (req, res) => {
  const id = uuidParam.parse(req.params.id);
  const { items } = z.object({ items: itemsSchema }).parse(req.body);
  const visit = await loadVisitRow(pool, id, req.user!);
  const ctx = (await pool.query(`SELECT s.state_code FROM visits v JOIN service_jobs j ON j.id = v.job_id JOIN customer_sites s ON s.id = j.site_id WHERE v.id = $1`, [id])).rows[0];
  const warranty = visit.assetId ? await getAssetWarranty(pool, visit.assetId, todayIST()) : null;
  const lines = await priceLines(pool, items, warranty);
  res.json({ warranty, lines, ...quoteTotals(lines, ctx.state_code) });
}));

visitsRouter.post('/:id/solve', handle(async (req, res) => {
  const visitId = uuidParam.safeParse(req.params.id);
  if (!visitId.success) throw new HttpError(400, 'Invalid visit id');
  const parsed = solveSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });

  const idemKey = req.header('Idempotency-Key');
  if (!idemKey || idemKey.length < 8 || idemKey.length > 100) throw new HttpError(400, 'Idempotency-Key header (8–100 chars) is required');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await solveVisit(client, { visitId: visitId.data, user: req.user!, body: parsed.data, idemKey });
    await client.query('COMMIT');
    res.status(result.replayed ? 200 : 201).json(result.payload);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}));

async function solveVisit(
  db: PoolClient,
  p: { visitId: string; user: AuthUser; body: z.infer<typeof solveSchema>; idemKey: string },
) {
  const { visitId, user, body, idemKey } = p;

  const quotationOf = async (ticketNo: number, warranty: WarrantyResult | null) => {
    const q = (await db.query(`SELECT id, quotation_no, total_paise FROM quotations WHERE visit_id = $1`, [visitId])).rows[0];
    return {
      ticketNo, warranty,
      quotation: { id: q.id as string, quotationNo: q.quotation_no as string, totalPaise: Number(q.total_paise) },
      shareUrl: await createShareLink(db, q.id),
    };
  };

  // 1. Idempotent replay: same key => same outcome (with a fresh share link), nothing written twice.
  const prior = await db.query(
    `SELECT v.id, j.job_no::int AS ticket_no FROM visits v JOIN service_jobs j ON j.id = v.job_id WHERE v.solve_idempotency_key = $1`, [idemKey]);
  if (prior.rows.length > 0) {
    if (prior.rows[0].id !== visitId) throw new HttpError(409, 'Idempotency key already used for a different visit');
    return { replayed: true as const, payload: await quotationOf(prior.rows[0].ticket_no, null) };
  }

  // 2. Lock the visit row so two devices cannot solve the same ticket at once.
  const v = await db.query(
    `SELECT v.status, v.technician_id, v.job_id, j.job_no::int AS ticket_no, j.asset_id, j.customer_id, s.state_code
       FROM visits v JOIN service_jobs j ON j.id = v.job_id JOIN customer_sites s ON s.id = j.site_id
      WHERE v.id = $1 FOR UPDATE OF v`,
    [visitId],
  );
  if (v.rows.length === 0) throw new HttpError(404, 'Visit not found');
  const visit = v.rows[0];
  if (user.role === 'TECHNICIAN' && visit.technician_id !== user.id) throw new HttpError(404, 'Visit not found');
  if (visit.status !== 'CHECKED_IN') throw new HttpError(409, `Check in at the site first (current status: ${visit.status})`);

  // 3. Warranty as of today (IST), decided on the server, then price every line from the catalog.
  const serviceDate = todayIST();
  const warranty = visit.asset_id ? await getAssetWarranty(db, visit.asset_id, serviceDate) : null;
  const lines = await priceLines(db, body.items, warranty);
  const totals = quoteTotals(lines, visit.state_code);

  for (const l of lines) {
    await db.query(
      `INSERT INTO visit_parts (visit_id, catalog_item_id, description, quantity, unit_price_paise, warranty_waived, gst_rate_bp, hsn_sac) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [visitId, l.catalogItemId, l.description, l.quantity, l.unitPricePaise, l.warrantyWaived, l.gstRateBp, l.hsnSac],
    );
    if (l.type !== 'SERVICE') {
      // Stock goes down by what was used (it may go below zero: a technician in the field is never blocked; the admin sees it in red).
      await db.query(`INSERT INTO stock_moves (item_id, qty_delta, reason, visit_id, created_by) VALUES ($1, $2, 'USED_ON_TICKET', $3, $4)`, [l.catalogItemId, -l.quantity, visitId, user.id]);
    }
  }

  // 4. Close the visit, mark the ticket SOLVED and create the quotation the customer receives.
  await db.query(
    `UPDATE visits
        SET status='COMPLETED', completed_at=now(), service_date=$2, work_done=$3,
            warranty_status=$4, warranty_end_snapshot=$5, solve_idempotency_key=$6
      WHERE id=$1`,
    [visitId, serviceDate, body.workDone, warranty?.status ?? 'NOT_APPLICABLE', warranty?.endDate ?? null, idemKey],
  );
  await db.query(
    `UPDATE service_jobs SET status='SOLVED', solved_at=now(), issue_category_id = COALESCE($2, issue_category_id) WHERE id=$1`,
    [visit.job_id, body.issueCategoryId ?? null],
  );
  const q = (await db.query(
    `INSERT INTO quotations (visit_id, customer_id, created_by, status, shared_at, subtotal_paise, place_of_supply, cgst_paise, sgst_paise, igst_paise, total_paise)
     VALUES ($1, $2, $3, 'SHARED', now(), $4, $5, $6, $7, $8, $9) RETURNING id`,
    [visitId, visit.customer_id, user.id, totals.subtotalPaise, visit.state_code, totals.cgstPaise, totals.sgstPaise, totals.igstPaise, totals.totalPaise],
  )).rows[0];
  await db.query(`INSERT INTO audit_log (actor_id, action, entity, entity_id, detail) VALUES ($1,'ticket.solve','ticket',$2,$3)`,
    [user.id, visit.job_id, JSON.stringify({ ticketNo: visit.ticket_no, items: lines.length, warranty: warranty?.status ?? null })]);
  await db.query(`INSERT INTO audit_log (actor_id, action, entity, entity_id, detail) VALUES ($1,'quotation.create','quotation',$2,$3)`,
    [user.id, q.id, JSON.stringify({ totalPaise: totals.totalPaise })]);

  return { replayed: false as const, payload: await quotationOf(visit.ticket_no, warranty) };
}
