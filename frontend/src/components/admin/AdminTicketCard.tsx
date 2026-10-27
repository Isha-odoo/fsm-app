import type { ReactNode } from 'react';
import Link from 'next/link';
import { Globe, Phone, Printer, User } from 'lucide-react';
import type { Ticket } from '@/lib/types';
import { PRIORITY_LABEL, formatINR, timeAgo } from '@/lib/format';
import { QuoteStatusChip, TicketStatusChip, WarrantyChip } from '@/components/StatusChip';

const PRIORITY_BAR = { 1: 'bg-red-500', 2: 'bg-amber-400', 3: 'bg-slate-300' } as const;

/** One ticket on the dispatch board. `children` is the action area (assign, invoice, ...). */
export function AdminTicketCard({ ticket: t, children }: { ticket: Ticket; children?: ReactNode }) {
  return (
    <article className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 pl-5 shadow-sm">
      <span className={`absolute inset-y-0 left-0 w-1.5 ${PRIORITY_BAR[t.priority]}`} aria-hidden />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
            <Link href={`/admin/tickets/${t.id}`} className="font-mono font-semibold text-slate-700 underline-offset-2 hover:underline">#{t.ticketNo}</Link>
            <span>{timeAgo(t.createdAt)}</span>
            {t.priority === 1 && <span className="font-semibold text-red-600">{PRIORITY_LABEL[1]}</span>}
            {t.source === 'CUSTOMER' && <span className="inline-flex items-center gap-1"><Globe className="h-3 w-3" /> Web form</span>}
          </div>
          <h3 className="mt-0.5 truncate text-base font-bold"><Link href={`/admin/tickets/${t.id}`} className="hover:underline">{t.customerName}</Link></h3>
        </div>
        <TicketStatusChip status={t.status} />
      </div>

      <div className="mt-2 space-y-1 text-sm text-slate-600">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {t.contactName && <span className="inline-flex items-center gap-1"><User className="h-3.5 w-3.5 text-slate-400" /> {t.contactName}</span>}
          {t.phone && <a href={`tel:${t.phone}`} className="inline-flex items-center gap-1 text-slate-700 underline-offset-2 hover:underline"><Phone className="h-3.5 w-3.5 text-slate-400" /> {t.phone}</a>}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Printer className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span>{t.model ?? 'Product not specified'}</span>
          {t.serialNumber && <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">{t.serialNumber}</span>}
          {!t.serialRecognised && t.serialNumber && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800">Serial not recognised</span>}
        </div>
        <p className="line-clamp-1 text-xs text-slate-500">{t.address}{t.city ? `, ${t.city}` : ''}</p>
      </div>

      {(t.service || t.issue || t.description) && (
        <p className="mt-2 line-clamp-3 text-sm text-slate-800">
          {t.service && <span className="mr-1.5 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-800">{t.service}</span>}
          {t.issue && <span className="mr-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold">{t.issue}</span>}
          {t.description}
        </p>
      )}

      {t.technicianName && (
        <p className="mt-2 text-xs text-slate-500">
          Technician: <span className="font-semibold text-slate-700">{t.technicianName}</span>
          {t.assignedByName && <> · assigned by <span className="font-semibold text-slate-700">{t.assignedByName}</span></>}
        </p>
      )}

      {t.status === 'SOLVED' && (
        <div className="mt-2 space-y-1 rounded-xl bg-slate-50 p-2.5 text-xs text-slate-600">
          <div className="flex flex-wrap items-center gap-2"><WarrantyChip status={t.warrantyStatus} />
            {t.quotation && <><span className="font-semibold text-slate-800">{t.quotation.quotationNo} · {t.quotation.totalPaise === 0 ? 'No charge' : formatINR(t.quotation.totalPaise)}</span><QuoteStatusChip status={t.quotation.status} /></>}
            {t.invoice && <span className="font-semibold text-slate-800">{t.invoice.invoiceNo} · {formatINR(t.invoice.totalPaise)}</span>}</div>
          {t.workDone && <p className="line-clamp-2"><span className="font-semibold">Solution:</span> {t.workDone}</p>}
        </div>
      )}

      {children && <div className="mt-3 border-t border-slate-100 pt-3">{children}</div>}
    </article>
  );
}
