import { describe, expect, it } from 'vitest';
import { computeWarrantyEnd, evaluateWarranty } from './warranty.service';

const base = { warrantyMonths: 12, extensionMonths: 0, isVoid: false };

describe('computeWarrantyEnd', () => {
  it('is inclusive (12 months from 1 Jan ends 31 Dec)', () => {
    expect(computeWarrantyEnd('2026-01-01', 12)).toBe('2026-12-31');
  });
  it('handles month-end clamping', () => {
    expect(computeWarrantyEnd('2026-01-31', 1)).toBe('2026-02-27');
  });
  it('handles leap years', () => {
    expect(computeWarrantyEnd('2023-03-01', 12)).toBe('2024-02-29');
  });
});

describe('evaluateWarranty', () => {
  it('flags in-warranty on the last day', () => {
    const r = evaluateWarranty({ ...base, warrantyStart: '2025-11-01' }, '2026-10-31');
    expect(r.status).toBe('IN_WARRANTY');
    expect(r.billable).toBe(false);
  });
  it('flags expired the day after', () => {
    const r = evaluateWarranty({ ...base, warrantyStart: '2025-11-01' }, '2026-11-01');
    expect(r.status).toBe('EXPIRED');
    expect(r.billable).toBe(true);
  });
  it('extensions push the end date out', () => {
    const r = evaluateWarranty({ ...base, extensionMonths: 12, warrantyStart: '2025-01-01' }, '2026-10-23');
    expect(r.status).toBe('IN_WARRANTY');
    expect(r.endDate).toBe('2026-12-31');
  });
  it('void overrides an otherwise active warranty', () => {
    const r = evaluateWarranty({ ...base, warrantyStart: '2026-01-01', isVoid: true, voidReason: 'Liquid damage' }, '2026-02-01');
    expect(r.status).toBe('VOID');
    expect(r.billable).toBe(true);
  });
  it('missing start date => NO_RECORD, billable', () => {
    const r = evaluateWarranty({ ...base, warrantyStart: null }, '2026-02-01');
    expect(r.status).toBe('NO_RECORD');
    expect(r.billable).toBe(true);
  });
  it('rejects a service date before purchase', () => {
    expect(() => evaluateWarranty({ ...base, warrantyStart: '2026-05-01' }, '2026-04-01')).toThrow();
  });
});
