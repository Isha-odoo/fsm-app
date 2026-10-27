import Link from 'next/link';
import { ChevronRight, Clock, MapPin, Printer } from 'lucide-react';
import type { Visit } from '@/lib/types';
import { formatWhen } from '@/lib/format';
import { VisitStatusChip } from './StatusChip';

const PRIORITY_BAR = { 1: 'bg-red-500', 2: 'bg-amber-400', 3: 'bg-slate-300' } as const;

export function VisitCard({ visit }: { visit: Visit }) {
  const done = visit.status === 'COMPLETED';
  return (
    <Link
      href={`/visits/${visit.id}`}
      className={`relative block overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 pl-5 shadow-sm active:bg-slate-50 ${done ? 'opacity-70' : ''}`}
    >
      <span className={`absolute inset-y-0 left-0 w-1.5 ${PRIORITY_BAR[visit.priority]}`} aria-hidden />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
            <Clock className="h-4 w-4" /> {formatWhen(visit.scheduledFor)}
            <span className="font-normal text-slate-400">· Ticket #{visit.jobNo}</span>
          </div>
          <h3 className="mt-1 truncate text-base font-bold">{visit.customerName}</h3>
        </div>
        <VisitStatusChip status={visit.status} />
      </div>

      <div className="mt-2 flex items-start gap-1.5 text-sm text-slate-600">
        <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
        <span className="line-clamp-2">{visit.address}{visit.city ? `, ${visit.city}` : ''}</span>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5 text-sm text-slate-700">
          <Printer className="h-4 w-4 shrink-0 text-slate-400" />
          <span className="truncate">{visit.assetModel ?? (visit.serialNumber ? 'Machine not on file' : 'No serial given')}</span>
          {visit.serialNumber && <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">{visit.serialNumber}</span>}
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
      </div>
      {(visit.service || visit.issue) && (
        <p className="mt-2 text-xs font-medium text-slate-500">
          {visit.service && <span className="mr-2 rounded-full bg-sky-100 px-2 py-0.5 font-semibold text-sky-800">{visit.service}</span>}
          {visit.issue && <>Issue: {visit.issue}</>}
        </p>
      )}
    </Link>
  );
}
