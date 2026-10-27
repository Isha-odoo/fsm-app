import { describe, expect, it } from 'vitest';
import { computeTax, financialYear } from './invoice.calc';

describe('computeTax', () => {
  it('splits 18% intra-state GST into equal CGST and SGST', () => {
    expect(computeTax([{ lineTotalPaise: 100_000, gstRateBp: 1800 }], true)).toEqual({ taxPaise: 18_000, cgstPaise: 9_000, sgstPaise: 9_000, igstPaise: 0 });
  });
  it('keeps CGST + SGST equal to the tax when the tax is an odd number of paise', () => {
    const r = computeTax([{ lineTotalPaise: 1_001, gstRateBp: 1800 }], true); // 180.18 -> 180
    expect(r.taxPaise).toBe(180);
    expect(r.cgstPaise + r.sgstPaise).toBe(r.taxPaise);
    const odd = computeTax([{ lineTotalPaise: 1_003, gstRateBp: 1800 }], true); // 180.54 -> 181
    expect(odd.cgstPaise + odd.sgstPaise).toBe(181);
  });
  it('charges IGST for inter-state supply', () => {
    expect(computeTax([{ lineTotalPaise: 50_000, gstRateBp: 1800 }], false)).toEqual({ taxPaise: 9_000, cgstPaise: 0, sgstPaise: 0, igstPaise: 9_000 });
  });
  it('charges no tax on warranty-waived (zero) lines', () => {
    expect(computeTax([{ lineTotalPaise: 0, gstRateBp: 1800 }, { lineTotalPaise: 10_000, gstRateBp: 500 }], true).taxPaise).toBe(500);
  });
});

describe('financialYear', () => {
  it('rolls over on 1 April', () => {
    expect(financialYear('2027-03-31')).toBe('2026-27');
    expect(financialYear('2027-04-01')).toBe('2027-28');
    expect(financialYear('2026-10-23')).toBe('2026-27');
    expect(financialYear('2099-12-31')).toBe('2099-00');
  });
});
