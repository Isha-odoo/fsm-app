/** Pricing of the lines a technician adds on site. Shared by the live preview and the real "solve" so they always agree. */
import { createHash, randomBytes } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { config } from '../../config';
import { HttpError } from '../../http';
import type { WarrantyResult } from '../warranty/warranty.service';
import { computeTax } from '../invoices/invoice.calc';

export type Db = Pool | PoolClient;
export interface QuoteItemInput { catalogItemId: string; quantity: number }

export interface QuoteLine {
  catalogItemId: string;
  type: 'PART' | 'CONSUMABLE' | 'SERVICE';
  description: string;
  hsnSac: string | null;
  quantity: number;
  unitPricePaise: number;
  gstRateBp: number;
  warrantyWaived: boolean;
  lineTotalPaise: number;
}

/**
 * Prices the items from the catalog (never from the client). A line is free (waived) when the machine is in warranty and
 * the catalog says that item is covered. Only parts, consumables and services can be quoted.
 */
export async function priceLines(db: Db, items: QuoteItemInput[], warranty: WarrantyResult | null): Promise<QuoteLine[]> {
  const qty = new Map<string, number>();
  for (const it of items) qty.set(it.catalogItemId, (qty.get(it.catalogItemId) ?? 0) + it.quantity);
  if (qty.size === 0) return [];
  const { rows } = await db.query(
    `SELECT id, type, name, hsn_sac, unit_price_paise, gst_rate_bp, warranty_covers FROM catalog_items
      WHERE id = ANY($1::uuid[]) AND is_active AND type IN ('PART', 'CONSUMABLE', 'SERVICE')`,
    [[...qty.keys()]],
  );
  if (rows.length !== qty.size) throw new HttpError(422, 'One or more items are unknown, inactive or cannot be quoted');
  const byId = new Map(rows.map((r) => [r.id as string, r]));
  return [...qty.entries()].map(([id, quantity]) => {
    const c = byId.get(id)!;
    const unit = Number(c.unit_price_paise);
    const waived = !!warranty && !warranty.billable && c.warranty_covers === true;
    return {
      catalogItemId: id, type: c.type, description: c.name, hsnSac: c.hsn_sac, quantity, unitPricePaise: unit,
      gstRateBp: c.gst_rate_bp, warrantyWaived: waived, lineTotalPaise: waived ? 0 : unit * quantity,
    };
  });
}

export function quoteTotals(lines: QuoteLine[], siteStateCode: string) {
  const subtotalPaise = lines.reduce((s, l) => s + l.lineTotalPaise, 0);
  const tax = computeTax(lines.map((l) => ({ lineTotalPaise: l.lineTotalPaise, gstRateBp: l.gstRateBp })), siteStateCode.trim() === config.SELLER_STATE_CODE);
  return { subtotalPaise, cgstPaise: tax.cgstPaise, sgstPaise: tax.sgstPaise, igstPaise: tax.igstPaise, totalPaise: subtotalPaise + tax.taxPaise };
}

const sha256 = (s: string) => createHash('sha256').update(s).digest();
export const hashToken = sha256;

/** A new customer-facing link. Only the hash is stored; the link itself is returned once. */
export async function createShareLink(db: Db, quotationId: string): Promise<string> {
  const token = randomBytes(24).toString('base64url');
  await db.query(
    `INSERT INTO quotation_share_links (quotation_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '60 days')`,
    [quotationId, sha256(token)],
  );
  return `${config.PUBLIC_URL.replace(/\/$/, '')}/q/${token}`;
}
