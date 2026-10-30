import Link from 'next/link';
import { Flag, MapPin, Printer, Wrench } from 'lucide-react';
import type { Visit } from '@/lib/types';
import { dayLabel, formatTime } from '@/lib/format';
import { VisitStatusChip } from './StatusChip';
import { IconTile, cardCls } from './ui/parts';

/** One ticket in a list. The whole card is the tap target. */
export function VisitCard({ visit, highlight }: { visit: Visit; highlight?: boolean }) {
  const done = visit.status === 'COMPLETED';
  const urgent = visit.priority === 1 && !done;
  const title = visit.service ?? visit.assetModel ?? 'Service visit';
  return (
    <Link href={`/visits/detail?id=${visit.id}`}
      className={`${cardCls} block p-4 active:bg-canvas ${highlight ? 'ring-2 ring-primary/30' : ''} ${done ? 'opacity-75' : ''}`}>
      <div className="flex items-start gap-3">
        <IconTile tone={urgent ? 'red' : done ? 'green' : 'blue'}><Wrench className="h-5 w-5" /></IconTile>
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-base font-bold leading-tight">{title}</h3>
          <p className="mt-0.5 line-clamp-2 text-sm text-muted">#{visit.jobNo} · Client: {visit.customerName}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <VisitStatusChip status={visit.status} />
          <span className="text-xs font-semibold text-muted">{formatTime(visit.scheduledFor)}</span>
        </div>
      </div>

      <div className="mt-3 flex items-start gap-1.5 text-sm text-muted">
        <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
        <span className="line-clamp-1">{visit.address}{visit.city ? `, ${visit.city}` : ''}</span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        {urgent && <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 font-semibold text-red-700"><Flag className="h-3 w-3" /> High priority</span>}
        <span className="rounded-full bg-canvas px-2.5 py-1 font-semibold text-muted">{dayLabel(visit.scheduledFor) || 'Unscheduled'}</span>
        {visit.assetModel && (
          <span className="inline-flex min-w-0 items-center gap-1 rounded-full bg-canvas px-2.5 py-1 font-medium text-muted"><Printer className="h-3 w-3 shrink-0" /><span className="truncate">{visit.assetModel}</span></span>
        )}
      </div>
    </Link>
  );
}
