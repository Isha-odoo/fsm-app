/**
 * Inventory (mounted at /api/inventory). Products, services and parts all live in catalog_items.
 *   GET   /items?type=&q=&inactive=1   list with on-hand stock (ADMIN, DISPATCHER)
 *   POST  /items                       create, optional openingStock (ADMIN)
 *   PATCH /items/:id                   edit price, GST, warranty cover, visibility, reorder level, active (ADMIN)
 *   POST  /items/:id/stock             receive or adjust stock { qtyDelta, reason: PURCHASE | ADJUSTMENT, note? } (ADMIN)
 *
 * Stock is a ledger (stock_moves). Parts logged by technicians when they solve a ticket deduct stock automatically.
 * Services have no stock. "requestable" decides whether a product or service is offered on the public request form.
 */
import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../db';
import { requireAuth, requireRole } from '../../auth';
import { HttpError, handle, uuidParam } from '../../http';

export const inventoryRouter = Router();
inventoryRouter.use(requireAuth);
const staff = requireRole('ADMIN', 'DISPATCHER');
const admin = requireRole('ADMIN');

const TYPES = ['PRODUCT', 'PART', 'CONSUMABLE', 'SERVICE'] as const;

const SELECT = `
  SELECT ci.id, ci.type, ci.sku, ci.name, ci.hsn_sac AS "hsnSac", ci.unit_price_paise AS "unitPricePaise", ci.gst_rate_bp AS "gstRateBp",
         ci.warranty_covers AS "warrantyCovers", ci.requestable, ci.is_active AS "isActive", ci.reorder_level AS "reorderLevel",
         CASE WHEN ci.type = 'SERVICE' THEN NULL
              ELSE COALESCE((SELECT sum(m.qty_delta) FROM stock_moves m WHERE m.item_id = ci.id), 0)::int END AS "onHand"
    FROM catalog_items ci`;

const mapItem = (r: any) => ({ ...r, unitPricePaise: Number(r.unitPricePaise) });

inventoryRouter.get('/items', staff, handle(async (req, res) => {
  const f = z.object({
    type: z.enum(TYPES).optional(),
    q: z.string().trim().max(100).default(''),
    inactive: z.enum(['0', '1']).default('0'),
  }).parse(req.query);
  const { rows } = await pool.query(
    `${SELECT}
      WHERE ($1::item_type IS NULL OR ci.type = $1::item_type)
        AND ($2::text = '' OR ci.name ILIKE '%' || $2::text || '%' OR ci.sku ILIKE '%' || $2::text || '%')
        AND ($3::boolean OR ci.is_active)
      ORDER BY ci.type, ci.name`,
    [f.type ?? null, f.q, f.inactive === '1'],
  );
  res.json(rows.map(mapItem));
}));

const fields = {
  name: z.string().trim().min(2).max(160),
  unitPricePaise: z.number().int().min(0).max(100_000_000_00),
  gstRateBp: z.number().int().min(0).max(2800),
  hsnSac: z.string().trim().max(12).nullable().optional(),
  warrantyCovers: z.boolean(),
  requestable: z.boolean(),
  reorderLevel: z.number().int().min(0).max(100_000),
};

const createSchema = z.object({
  type: z.enum(TYPES),
  sku: z.string().trim().min(2).max(40).regex(/^[A-Za-z0-9._-]+$/, 'SKU may only contain letters, digits, dot, dash and underscore'),
  ...fields,
  gstRateBp: fields.gstRateBp.default(1800),
  warrantyCovers: fields.warrantyCovers.default(false),
  requestable: fields.requestable.default(false),
  reorderLevel: fields.reorderLevel.default(0),
  openingStock: z.number().int().min(0).max(100_000).optional(),
});

inventoryRouter.post('/items', admin, handle(async (req, res) => {
  const b = createSchema.parse(req.body);
  if (b.type === 'SERVICE' && b.openingStock) throw new HttpError(422, 'Services have no stock');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const id = (await client.query(
      `INSERT INTO catalog_items (type, sku, name, hsn_sac, unit_price_paise, gst_rate_bp, warranty_covers, requestable, reorder_level)
       VALUES ($1::item_type, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [b.type, b.sku, b.name, b.hsnSac || null, b.unitPricePaise, b.gstRateBp, b.warrantyCovers, b.requestable, b.reorderLevel],
    )).rows[0].id as string;
    if (b.openingStock) {
      await client.query(`INSERT INTO stock_moves (item_id, qty_delta, reason, created_by) VALUES ($1, $2, 'OPENING', $3)`, [id, b.openingStock, req.user!.id]);
    }
    await client.query(`INSERT INTO audit_log (actor_id, action, entity, entity_id, detail) VALUES ($1, 'item.create', 'item', $2, $3)`,
      [req.user!.id, id, JSON.stringify({ sku: b.sku, type: b.type })]);
    await client.query('COMMIT');
    res.status(201).json(mapItem((await pool.query(`${SELECT} WHERE ci.id = $1`, [id])).rows[0]));
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    if ((err as { code?: string }).code === '23505') throw new HttpError(409, 'An item with this SKU already exists');
    throw err;
  } finally {
    client.release();
  }
}));

const patchSchema = z.object({ ...fields, isActive: z.boolean() }).partial();

inventoryRouter.patch('/items/:id', admin, handle(async (req, res) => {
  const id = uuidParam.parse(req.params.id);
  const b = patchSchema.parse(req.body);
  const cols: Record<string, string> = {
    name: 'name', unitPricePaise: 'unit_price_paise', gstRateBp: 'gst_rate_bp', hsnSac: 'hsn_sac',
    warrantyCovers: 'warranty_covers', requestable: 'requestable', reorderLevel: 'reorder_level', isActive: 'is_active',
  };
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [k, col] of Object.entries(cols)) {
    const v = (b as Record<string, unknown>)[k];
    if (v !== undefined) { vals.push(k === 'hsnSac' ? v || null : v); sets.push(`${col} = $${vals.length}`); }
  }
  if (sets.length === 0) throw new HttpError(400, 'Nothing to update');
  vals.push(id);
  const r = await pool.query(`UPDATE catalog_items SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals);
  if (r.rowCount === 0) throw new HttpError(404, 'Item not found');
  await pool.query(`INSERT INTO audit_log (actor_id, action, entity, entity_id, detail) VALUES ($1, 'item.update', 'item', $2, $3)`,
    [req.user!.id, id, JSON.stringify({ fields: Object.keys(b) })]);
  res.json(mapItem((await pool.query(`${SELECT} WHERE ci.id = $1`, [id])).rows[0]));
}));

const stockSchema = z.object({
  qtyDelta: z.number().int().refine((n) => n !== 0, 'Quantity cannot be zero').refine((n) => Math.abs(n) <= 100_000, 'Quantity is too large'),
  reason: z.enum(['PURCHASE', 'ADJUSTMENT']),
  note: z.string().trim().max(300).optional(),
});

inventoryRouter.post('/items/:id/stock', admin, handle(async (req, res) => {
  const id = uuidParam.parse(req.params.id);
  const b = stockSchema.parse(req.body);
  if (b.reason === 'PURCHASE' && b.qtyDelta < 0) throw new HttpError(422, 'A purchase must add stock; use an adjustment to remove it');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const item = await client.query(`SELECT type FROM catalog_items WHERE id = $1 FOR UPDATE`, [id]); // serialises concurrent adjustments
    if (!item.rows[0]) throw new HttpError(404, 'Item not found');
    if (item.rows[0].type === 'SERVICE') throw new HttpError(422, 'Services have no stock');
    const onHand = (await client.query(`SELECT COALESCE(sum(qty_delta), 0)::int AS n FROM stock_moves WHERE item_id = $1`, [id])).rows[0].n as number;
    if (onHand + b.qtyDelta < 0) throw new HttpError(409, `Only ${onHand} in stock, cannot remove ${-b.qtyDelta}`);
    await client.query(`INSERT INTO stock_moves (item_id, qty_delta, reason, note, created_by) VALUES ($1, $2, $3, $4, $5)`,
      [id, b.qtyDelta, b.reason, b.note || null, req.user!.id]);
    await client.query('COMMIT');
    res.json(mapItem((await pool.query(`${SELECT} WHERE ci.id = $1`, [id])).rows[0]));
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}));
