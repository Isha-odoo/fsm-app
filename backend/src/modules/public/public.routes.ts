/**
 * PUBLIC endpoints (no login) used by the customer request form (mounted at /api/public).
 *
 *   GET  /catalog            products and services the customer can pick (inventory items flagged "requestable")
 *   GET  /issue-categories   fault types
 *   POST /tickets            create a ticket with status NEW
 *
 * Abuse protection: strict rate limit, zod validation, hidden honeypot field, Idempotency-Key for double submits.
 * The response only contains the new ticket number: it never reveals whether the serial number or phone matched
 * an existing machine or customer.
 *
 * Matching rules:
 *  - Serial number matches exactly one machine  => ticket is linked to that machine, its customer and site
 *    (so the technician and the warranty check see the real record).
 *  - Otherwise (unknown or ambiguous serial)     => customer is found by phone number or created, a site is found/created
 *    from the typed address, and the ticket keeps the typed serial for the admin to verify.
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../../config';
import { pool } from '../../db';
import { handle } from '../../http';
import { queue } from '../../queue';
import { loadQuotation } from '../documents/documents';
import { hashToken } from '../quotations/quote';

export const publicRouter = Router();

const submitLimiter = rateLimit({
  windowMs: 60 * 60_000, limit: 10, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many requests from this network. Please call us instead.' },
});

const phone = z.string().trim().transform((s) => s.replace(/[\s()-]/g, '')).pipe(z.string().regex(/^\+?\d{10,15}$/, 'Enter a valid phone number'));

const ticketSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(120),
  company: z.string().trim().max(160).optional(),
  phone,
  email: z.union([z.string().trim().email('Enter a valid email').max(200), z.literal('')]).optional(),
  serialNumber: z.string().trim().min(3, 'Enter the machine serial number').max(60),
  address: z.string().trim().min(5, 'Enter the address where the machine is').max(300),
  city: z.string().trim().max(80).optional(),
  productId: z.string().uuid().optional(),   // product / model the problem is about
  serviceId: z.string().uuid().optional(),   // service wanted: repair, installation, maintenance ...
  issueCategoryId: z.number().int().positive().optional(),
  description: z.string().trim().min(10, 'Please describe the problem (at least 10 characters)').max(2000),
  website: z.string().max(200).optional(), // honeypot: people never see this field, bots fill it
});

publicRouter.get('/catalog', handle(async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT id, name, type FROM catalog_items WHERE is_active AND requestable AND type IN ('PRODUCT', 'SERVICE') ORDER BY name`);
  res.json({
    products: rows.filter((r) => r.type === 'PRODUCT').map(({ id, name }) => ({ id, name })),
    services: rows.filter((r) => r.type === 'SERVICE').map(({ id, name }) => ({ id, name })),
  });
}));

publicRouter.get('/issue-categories', handle(async (_req, res) => {
  const { rows } = await pool.query(`SELECT id, name FROM issue_categories ORDER BY name`);
  res.json(rows);
}));

publicRouter.post('/tickets', submitLimiter, handle(async (req, res) => {
  const parsed = ticketSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Please check the form', details: parsed.error.flatten().fieldErrors });
  const b = parsed.data;
  if (b.website) return res.status(201).json({ ticketNo: 10_000 + Math.floor(Math.random() * 90_000) }); // honeypot: fake success, nothing stored

  const idem = req.header('Idempotency-Key');
  if (idem !== undefined && (idem.length < 8 || idem.length > 100)) return res.status(400).json({ error: 'Invalid Idempotency-Key' });

  const existing = async () =>
    idem ? (await pool.query(`SELECT job_no::int AS "ticketNo" FROM service_jobs WHERE idempotency_key = $1`, [idem])).rows[0] : undefined;
  const prior = await existing();
  if (prior) return res.status(200).json(prior);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let customerId: string;
    let siteId: string;
    let assetId: string | null = null;
    let productId: string | null = null;
    let serviceAddress: string | null = null;

    const assets = await client.query(`SELECT id, customer_id, site_id, model_id FROM assets WHERE upper(serial_number) = upper($1) LIMIT 2`, [b.serialNumber]);
    if (assets.rows.length === 1) {
      assetId = assets.rows[0].id; productId = assets.rows[0].model_id; customerId = assets.rows[0].customer_id; siteId = assets.rows[0].site_id;
      const site = await client.query(`SELECT address FROM customer_sites WHERE id = $1`, [siteId]);
      if (String(site.rows[0].address).trim().toLowerCase() !== b.address.toLowerCase()) serviceAddress = b.address;
    } else {
      const digits = b.phone.replace(/\D/g, '').slice(-10);
      const found = await client.query(
        `SELECT id FROM customers WHERE right(regexp_replace(coalesce(phone, ''), '\\D', '', 'g'), 10) = $1 ORDER BY created_at LIMIT 1`, [digits]);
      customerId = found.rows[0]?.id ?? (await client.query(
        `INSERT INTO customers (name, email, phone) VALUES ($1, $2, $3) RETURNING id`,
        [b.company || b.name, b.email || null, b.phone])).rows[0].id;
      const site = await client.query(`SELECT id FROM customer_sites WHERE customer_id = $1 AND lower(address) = lower($2) LIMIT 1`, [customerId, b.address]);
      // New sites default to the seller's state; an admin can correct the GST state code before invoicing.
      siteId = site.rows[0]?.id ?? (await client.query(
        `INSERT INTO customer_sites (customer_id, label, address, city, state_code, contact_name, contact_phone)
         VALUES ($1, 'Web request', $2, $3, $4, $5, $6) RETURNING id`,
        [customerId, b.address, b.city || null, config.SELLER_STATE_CODE, b.name, b.phone])).rows[0].id;
    }

    // A matched machine decides the product; otherwise use what the customer picked (only if it is a listed product / service).
    if (!productId && b.productId) {
      productId = (await client.query(`SELECT id FROM catalog_items WHERE id = $1 AND type = 'PRODUCT' AND is_active AND requestable`, [b.productId])).rows[0]?.id ?? null;
    }
    const serviceId = b.serviceId
      ? (await client.query(`SELECT id FROM catalog_items WHERE id = $1 AND type = 'SERVICE' AND is_active AND requestable`, [b.serviceId])).rows[0]?.id ?? null
      : null;

    const t = await client.query(
      `INSERT INTO service_jobs (customer_id, site_id, asset_id, issue_category_id, description, status, priority, source,
                                 requester_name, requester_phone, requester_email, serial_reported, service_address, idempotency_key,
                                 product_id, service_id)
       VALUES ($1, $2, $3, (SELECT id FROM issue_categories WHERE id = $4::int), $5, 'NEW', 2, 'CUSTOMER', $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id, job_no::int AS "ticketNo"`,
      [customerId, siteId, assetId, b.issueCategoryId ?? null, b.description, b.name, b.phone, b.email || null, b.serialNumber, serviceAddress, idem ?? null, productId, serviceId],
    );
    await client.query(
      `INSERT INTO audit_log (action, entity, entity_id, detail) VALUES ('ticket.create_public', 'ticket', $1, $2)`,
      [t.rows[0].id, JSON.stringify({ ticketNo: t.rows[0].ticketNo, serialMatched: !!assetId })],
    );
    await client.query('COMMIT');

    await queue.add('ticket.created', { ticketNo: t.rows[0].ticketNo }); // hook for an "new ticket" email/WhatsApp to the office
    res.status(201).json({ ticketNo: t.rows[0].ticketNo });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    if ((err as { code?: string }).code === '23505') { // same Idempotency-Key raced in parallel
      const again = await existing();
      if (again) return res.status(200).json(again);
    }
    throw err;
  } finally {
    client.release();
  }
}));

// ───────── customer's copy of a quotation (link shared by the technician) ─────────
// The link holds a random token; only its hash is stored. It expires after 60 days.
const viewLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 120, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests.' } });
const decideLimiter = rateLimit({ windowMs: 60 * 60_000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests.' } });
const tokenParam = z.string().regex(/^[A-Za-z0-9_-]{20,64}$/);

publicRouter.get('/quotations/:token', viewLimiter, handle(async (req, res) => {
  const found = await loadQuotation(pool, { tokenHash: hashToken(tokenParam.parse(req.params.token)) });
  if (!found) return res.status(404).json({ error: 'This link is not valid or has expired. Please ask us for a new one.' });
  const { id, ...doc } = found.doc; // internal ids are not for customers
  res.json({ ...doc, ticket: { ...doc.ticket, id: undefined }, canDecide: doc.status === 'SHARED' });
}));

publicRouter.post('/quotations/:token/decision', decideLimiter, handle(async (req, res) => {
  const hash = hashToken(tokenParam.parse(req.params.token));
  const b = z.object({ decision: z.enum(['APPROVED', 'REJECTED']), name: z.string().trim().min(2).max(120), note: z.string().trim().max(300).optional() }).parse(req.body);
  const r = await pool.query(
    `UPDATE quotations SET status = $2::quotation_status, decided_at = now(), decision_note = $3
      WHERE status = 'SHARED' AND valid_until >= (now() AT TIME ZONE 'Asia/Kolkata')::date
        AND id = (SELECT quotation_id FROM quotation_share_links WHERE token_hash = $1 AND expires_at > now())
      RETURNING id`,
    [hash, b.decision, `${b.name}${b.note ? `: ${b.note}` : ''}`],
  );
  if (r.rowCount === 0) return res.status(409).json({ error: 'This quotation can no longer be answered online (already answered, expired or the link is invalid). Please contact us.' });
  await pool.query(`INSERT INTO audit_log (action, entity, entity_id, detail) VALUES ('quotation.decision', 'quotation', $1, $2)`,
    [r.rows[0].id, JSON.stringify({ decision: b.decision, by: `customer: ${b.name}` })]);
  res.json({ ok: true });
}));
