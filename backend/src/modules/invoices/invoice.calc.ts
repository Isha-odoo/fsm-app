/** Pure invoice helpers (no DB, no clock) so the money rules are unit-tested. All amounts are integer paise. */

export interface PricedLine { lineTotalPaise: number; gstRateBp: number }

/** GST per line, rounded to the nearest paisa. Same-state supply splits into CGST + SGST (they always add up to the tax); otherwise IGST. */
export function computeTax(lines: PricedLine[], intraState: boolean) {
  const taxPaise = lines.reduce((s, l) => s + Math.round((l.lineTotalPaise * l.gstRateBp) / 10_000), 0);
  const cgstPaise = intraState ? Math.floor(taxPaise / 2) : 0;
  const sgstPaise = intraState ? taxPaise - cgstPaise : 0;
  const igstPaise = intraState ? 0 : taxPaise;
  return { taxPaise, cgstPaise, sgstPaise, igstPaise };
}

/** Indian financial year (April to March) of a 'YYYY-MM-DD' date, e.g. 2027-03-31 => '2026-27'. */
export function financialYear(isoDate: string): string {
  const year = Number(isoDate.slice(0, 4));
  const month = Number(isoDate.slice(5, 7));
  const start = month >= 4 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}
