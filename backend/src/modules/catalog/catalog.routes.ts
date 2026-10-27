/**
 * Catalog endpoints (mounted at /api/catalog).
 *   GET /                    ?type=PART,CONSUMABLE,SERVICE  active catalog items
 *   GET /issue-categories    controlled list of fault types
 *
 * Technicians can list spare parts, consumables and services (what they may quote on site), with prices.
 * Admins and dispatchers can list every type.
 */
import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../db';
import { requireAuth, requireRole } from '../../auth';

export const catalogRouter = Router();
catalogRouter.use(requireAuth, requireRole('TECHNICIAN', 'DISPATCHER', 'ADMIN'));

const TYPES = ['PRODUCT', 'PART', 'CONSUMABLE', 'SERVICE'] as const;

catalogRouter.get('/', async (req, res, next) => {
  try {
    const isTech = req.user!.role === 'TECHNICIAN';
    const requested = z.array(z.enum(TYPES)).parse(String(req.query.type ?? 'PART,CONSUMABLE,SERVICE').split(','));
    const types = isTech ? requested.filter((t) => t !== 'PRODUCT') : requested;
    const { rows } = await pool.query(
      `SELECT id, sku, name, type, unit_price_paise, warranty_covers
         FROM catalog_items WHERE is_active AND type = ANY($1::item_type[]) ORDER BY name`,
      [types],
    );
    res.json(rows.map((r) => ({
      id: r.id, sku: r.sku, name: r.name, type: r.type, warrantyCovers: r.warranty_covers, unitPricePaise: Number(r.unit_price_paise),
    })));
  } catch (err) { next(err); }
});

catalogRouter.get('/issue-categories', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT id, name FROM issue_categories ORDER BY name`);
    res.json(rows);
  } catch (err) { next(err); }
});
