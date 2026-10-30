'use client';

import { AlertTriangle, CheckCircle2, HelpCircle, Loader2, ShieldOff, XCircle } from 'lucide-react';
import type { Warranty } from '@/lib/types';
import { formatDate } from '@/lib/format';

const STYLES = {
  IN_WARRANTY: { label: 'In Warranty', box: 'border-emerald-200 bg-emerald-50 text-emerald-900', Icon: CheckCircle2, icon: 'text-emerald-600' },
  EXPIRED: { label: 'Warranty Expired', box: 'border-red-200 bg-red-50 text-red-900', Icon: XCircle, icon: 'text-red-600' },
  VOID: { label: 'Warranty Void', box: 'border-red-200 bg-red-50 text-red-900', Icon: ShieldOff, icon: 'text-red-600' },
  NO_RECORD: { label: 'No Warranty Record', box: 'border-line bg-canvas text-ink', Icon: HelpCircle, icon: 'text-muted' },
} as const;

interface Props {
  warranty: Warranty | null | undefined;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  /** Compact one-line version for the solve form header. */
  compact?: boolean;
}

export function WarrantyCard({ warranty, isLoading, isError, onRetry, compact }: Props) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-line bg-white p-4 text-muted" aria-live="polite">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Checking warranty…</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
        <div className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-5 w-5" /> Could not check warranty</div>
        <p className="mt-1 text-sm">Check your connection and try again. Log the work as usual; the office handles billing.</p>
        {onRetry && (
          <button onClick={onRetry} className="mt-3 rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white active:bg-amber-700">
            Try again
          </button>
        )}
      </div>
    );
  }

  if (!warranty) {
    return (
      <div className="rounded-2xl border border-line bg-white p-4 text-sm text-slate-600">
        This serial number is not on file, so no warranty can be checked. Log the work as usual; the office will verify.
      </div>
    );
  }

  const s = STYLES[warranty.status];
  if (compact) {
    return (
      <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold ${s.box}`}>
        <s.Icon className={`h-5 w-5 shrink-0 ${s.icon}`} />
        <span>{s.label}</span>
        {!warranty.billable && <span className="ml-auto text-xs font-medium">Covered parts free</span>}
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border p-4 ${s.box}`}>
      <div className="flex items-center gap-3">
        <s.Icon className={`h-8 w-8 shrink-0 ${s.icon}`} />
        <div>
          <div className="text-lg font-bold leading-tight">{s.label}</div>
          {warranty.endDate && (
            <div className="text-sm">
              {warranty.status === 'IN_WARRANTY' ? 'Valid until ' : 'Ended on '}
              <span className="font-semibold">{formatDate(warranty.endDate)}</span>
            </div>
          )}
        </div>
      </div>
      <p className="mt-3 text-sm">{warranty.reason}</p>
      <p className="mt-2 text-xs font-medium">
        {warranty.billable
          ? 'This call is billable. Log every part you used; the office will invoice it.'
          : 'Labour and covered parts are free. Consumables (toner, ink) are still charged by the office.'}
      </p>
    </div>
  );
}
