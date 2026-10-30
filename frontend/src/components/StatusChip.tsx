import type { QuoteStatus, TicketStatus, VisitStatus, WarrantyStatus } from '@/lib/types';

const VISIT: Record<VisitStatus, { label: string; cls: string }> = {
  SCHEDULED: { label: 'Open', cls: 'bg-primary-soft text-primary' },
  CHECKED_IN: { label: 'In progress', cls: 'bg-orange-100 text-orange-700' },
  COMPLETED: { label: 'Solved', cls: 'bg-emerald-100 text-emerald-700' },
  CANCELLED: { label: 'Cancelled', cls: 'bg-slate-200 text-slate-600' },
};

const TICKET: Record<TicketStatus, { label: string; cls: string }> = {
  NEW: { label: 'New', cls: 'bg-violet-100 text-violet-700' },
  ASSIGNED: { label: 'Assigned', cls: 'bg-primary-soft text-primary' },
  IN_PROGRESS: { label: 'In progress', cls: 'bg-orange-100 text-orange-700' },
  SOLVED: { label: 'Solved', cls: 'bg-emerald-100 text-emerald-700' },
  CANCELLED: { label: 'Cancelled', cls: 'bg-slate-200 text-slate-600' },
};

const WARRANTY: Record<WarrantyStatus | 'NOT_APPLICABLE', { label: string; cls: string }> = {
  IN_WARRANTY: { label: 'In warranty', cls: 'bg-emerald-100 text-emerald-700' },
  EXPIRED: { label: 'Warranty expired', cls: 'bg-red-100 text-red-700' },
  VOID: { label: 'Warranty void', cls: 'bg-red-100 text-red-700' },
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
  SHARED: { label: 'Sent to customer', cls: 'bg-primary-soft text-primary' },
  APPROVED: { label: 'Customer approved', cls: 'bg-emerald-100 text-emerald-700' },
  REJECTED: { label: 'Customer declined', cls: 'bg-red-100 text-red-700' },
};

export function QuoteStatusChip({ status }: { status: QuoteStatus }) {
  const s = QUOTE[status];
  return <span className={`${base} ${s.cls}`}>{s.label}</span>;
}
