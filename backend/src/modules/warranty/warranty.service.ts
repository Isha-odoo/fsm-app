/**
 * Warranty calculation — pure functions (no DB, no clock) so they are trivial to unit-test,
 * plus one DB loader. All dates are plain 'YYYY-MM-DD' strings in Indian Standard Time,
 * which avoids the classic off-by-one-day bugs from UTC conversion.
 *
 * Rules:
 *  - Warranty runs from warranty_start (purchase/installation date) for `warranty_months`
 *    plus any approved extensions. The end date is INCLUSIVE:
 *    12 months from 2026-01-01 ends on 2026-12-31.
 *  - A service on the end date itself is still in warranty.
 *  - warranty_void (e.g. unauthorised repair, physical damage) beats everything else.
 *  - No start date on file => NO_RECORD: treated as billable, but an admin may override
 *    after verifying the original invoice.
 *  - Consumables (toner, ink) and anything with catalog_items.warranty_covers = false
 *    are billable even when the machine is in warranty (handled in the billing module).
 */
import { addDays, addMonths, differenceInCalendarDays, format, isValid, parseISO } from 'date-fns';
import type { Pool, PoolClient } from 'pg';

export type WarrantyStatus = 'IN_WARRANTY' | 'EXPIRED' | 'VOID' | 'NO_RECORD';

export interface AssetWarrantyInput {
  warrantyStart: string | null; // 'YYYY-MM-DD'
  warrantyMonths: number;       // base term, 0-60
  extensionMonths: number;      // sum of warranty_extensions.extra_months
  isVoid: boolean;
  voidReason?: string | null;
}

export interface WarrantyResult {
  status: WarrantyStatus;
  startDate: string | null;
  endDate: string | null;
  daysRemaining: number | null; // negative once expired
  billable: boolean;            // true => service labour must be charged
  reason: string;               // human-readable, shown on the technician's screen
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDateOnly(value: string, label: string) {
  if (!DATE_RE.test(value)) throw new Error(`${label} must be YYYY-MM-DD`);
  const d = parseISO(value);
  if (!isValid(d)) throw new Error(`${label} is not a valid date`);
  return d;
}

/** Today's date in IST as 'YYYY-MM-DD' (server timezone independent). */
export function todayIST(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
}

/** Inclusive end date: start + months, minus one day. addMonths clamps month-ends (31 Jan + 1m = 28/29 Feb). */
export function computeWarrantyEnd(start: string, totalMonths: number): string {
  if (!Number.isInteger(totalMonths) || totalMonths < 0 || totalMonths > 120) {
    throw new Error('totalMonths must be an integer between 0 and 120');
  }
  const s = parseDateOnly(start, 'start');
  return format(addDays(addMonths(s, totalMonths), -1), 'yyyy-MM-dd');
}

export function evaluateWarranty(asset: AssetWarrantyInput, serviceDate: string): WarrantyResult {
  const svc = parseDateOnly(serviceDate, 'serviceDate');

  if (asset.isVoid) {
    return {
      status: 'VOID', startDate: asset.warrantyStart, endDate: null, daysRemaining: null,
      billable: true, reason: `Warranty void: ${asset.voidReason ?? 'reason not recorded'}`,
    };
  }

  if (!asset.warrantyStart) {
    return {
      status: 'NO_RECORD', startDate: null, endDate: null, daysRemaining: null,
      billable: true, reason: 'No purchase/installation date on file. Verify the original invoice or ask an admin to override.',
    };
  }

  const totalMonths = asset.warrantyMonths + asset.extensionMonths;
  const start = parseDateOnly(asset.warrantyStart, 'warrantyStart');
  const endStr = computeWarrantyEnd(asset.warrantyStart, totalMonths);
  const end = parseISO(endStr);
  const daysRemaining = differenceInCalendarDays(end, svc);

  if (svc < start) {
    // service date before purchase date is a data-entry error: fail loudly instead of guessing
    throw new Error('Service date is before the warranty start date; check the asset record');
  }

  if (daysRemaining >= 0) {
    return {
      status: 'IN_WARRANTY', startDate: asset.warrantyStart, endDate: endStr, daysRemaining,
      billable: false, reason: `In warranty until ${endStr} (${daysRemaining} day${daysRemaining === 1 ? '' : 's'} left)`,
    };
  }
  return {
    status: 'EXPIRED', startDate: asset.warrantyStart, endDate: endStr, daysRemaining,
    billable: true, reason: `Warranty expired on ${endStr} (${-daysRemaining} day${daysRemaining === -1 ? '' : 's'} ago)`,
  };
}

/** Loads the asset + extensions and evaluates for `serviceDate`. Pass a client to run inside a transaction. */
export async function getAssetWarranty(
  db: Pool | PoolClient,
  assetId: string,
  serviceDate: string = todayIST(),
): Promise<WarrantyResult> {
  const { rows } = await db.query(
    `SELECT to_char(a.warranty_start, 'YYYY-MM-DD') AS warranty_start,
            a.warranty_months, a.warranty_void, a.warranty_void_reason,
            COALESCE((SELECT sum(extra_months) FROM warranty_extensions e WHERE e.asset_id = a.id), 0)::int AS ext
       FROM assets a WHERE a.id = $1`,
    [assetId],
  );
  if (rows.length === 0) throw new Error('Asset not found');
  const r = rows[0];
  return evaluateWarranty(
    {
      warrantyStart: r.warranty_start,
      warrantyMonths: r.warranty_months,
      extensionMonths: r.ext,
      isVoid: r.warranty_void,
      voidReason: r.warranty_void_reason,
    },
    serviceDate,
  );
}
