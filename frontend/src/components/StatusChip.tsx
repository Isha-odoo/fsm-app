import type { QuoteStatus, TicketStatus, VisitStatus, WarrantyStatus } from '@/lib/types';

const VISIT: Record<VisitStatus, { label: string; cls: string }> = {
  SCHEDULED: { label: 'Assigned', cls: 'bg-sky-100 text-sky-800' },
  CHECKED_IN: { label: 'On site', cls: 'bg-amber-100 text-amber-800' },
  COMPLETED: { label: 'Solved', cls: 'bg-emerald-100 text-emerald-800' },
  CANCELLED: { label: 'Cancelled', cls: 'bg-slate-200 text-slate-600' },
};

const TICKET: Record<TicketStatus, { label: string; cls: string }> = {
  NEW: { label: 'New', cls: 'bg-violet-100 text-violet-800' },
  ASSIGNED: { label: 'Assigned', cls: 'bg-sky-100 text-sky-800' },
  IN_PROGRESS: { label: 'In progress', cls: 'bg-amber-100 text-amber-800' },
  SOLVED: { label: 'Solved', cls: 'bg-emerald-100 text-emerald-800' },
  CANCELLED: { label: 'Cancelled', cls: 'bg-slate-200 text-slate-600' },
};

const WARRANTY: Record<WarrantyStatus | 'NOT_APPLICABLE', { label: string; cls: string }> = {
  IN_WARRANTY: { label: 'In warranty', cls: 'bg-emerald-100 text-emerald-800' },
  EXPIRED: { label: 'Warranty expired', cls: 'bg-red-100 text-red-800' },
  VOID: { label: 'Warranty void', cls: 'bg-red-100 text-red-800' },
  NO_RECORD: { label: 'No warranty record', cls: 'bg-slate-200 text-slate-700' },
  NOT_APPLICABLE: { label: 'No machine on file', cls: 'bg-slate-200 text-slate-700' },
};

const base = 'inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold';

/** Status of a technician's visit (mobile app wording). */
export function VisitStatusChip({ status }: { status: VisitStatus }) {
  const s = VISIT[status];
  return <span className={`${base} ${s.cls}`}>{s.label}</span>;
}

export function TicketStatusChip({ status }: { status: TicketStatus }) {
  const s = TICKET[status];
  return <span className={`${base} ${s.cls}`}>{s.label}</span>;
}

export function WarrantyChip({ status }: { status: WarrantyStatus | 'NOT_APPLICABLE' | null }) {
  if (!status) return null;
  const s = WARRANTY[status];
  return <span className={`${base} ${s.cls}`}>{s.label}</span>;
}

const QUOTE: Record<QuoteStatus, { label: string; cls: string }> = {
  DRAFT: { label: 'Draft', cls: 'bg-slate-200 text-slate-700' },
  SHARED: { label: 'Sent to customer', cls: 'bg-sky-100 text-sky-800' },
  APPROVED: { label: 'Customer approved', cls: 'bg-emerald-100 text-emerald-800' },
  REJECTED: { label: 'Customer declined', cls: 'bg-red-100 text-red-800' },
};

export function QuoteStatusChip({ status }: { status: QuoteStatus }) {
  const s = QUOTE[status];
  return <span className={`${base} ${s.cls}`}>{s.label}</span>;
}
