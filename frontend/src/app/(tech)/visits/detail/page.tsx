'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, CheckCircle2, Clock, FileText, Flag, Loader2, LogIn, MapPin, Navigation, Phone, Printer, Share2, User, Wrench } from 'lucide-react';
import { api } from '@/lib/api';
import { useIdParam } from '@/lib/useIdParam';
import { ClientOnly } from '@/components/ClientOnly';
import { dayLabel, formatINR, formatTime, mapsDirectionsUrl } from '@/lib/format';
import { WarrantyCard } from '@/components/WarrantyCard';
import { QuoteStatusChip, VisitStatusChip } from '@/components/StatusChip';
import { ShareButtons } from '@/components/ShareQuotation';
import { AppBar } from '@/components/ui/AppBar';
import { ErrorState, IconTile, Section, Skeleton, btnPrimary, btnSecondary, cardCls } from '@/components/ui/parts';

/** Best-effort GPS: never blocks check-in if the phone denies permission or times out. */
function getPosition(): Promise<{ lat: number; lng: number } | undefined> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(undefined);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(undefined),
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 30_000 },
    );
  });
}

function VisitExecution() {
  const id = useIdParam();
  const qc = useQueryClient();

  const visit = useQuery({ queryKey: ['visit', id], queryFn: () => api.getVisit(id) });
  // Warranty is fetched separately so the card has its own loading/error state and is always evaluated server-side.
  const warranty = useQuery({ queryKey: ['visit', id, 'warranty'], queryFn: () => api.getVisitWarranty(id), enabled: !!visit.data });

  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const share = useMutation({ mutationFn: (quotationId: string) => api.shareQuotation(quotationId), onSuccess: (r) => setShareUrl(r.url) });

  const checkIn = useMutation({
    mutationFn: async () => api.checkIn(id, await getPosition()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['visit', id] });
      qc.invalidateQueries({ queryKey: ['visits'] });
    },
  });

  if (visit.isLoading) {
    return (
      <main>
        <AppBar title="Ticket Details" back />
        <div className="space-y-3 p-4"><Skeleton className="h-40" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div>
      </main>
    );
  }
  if (visit.isError || !visit.data) {
    return (
      <main>
        <AppBar title="Ticket Details" back />
        <div className="p-4"><ErrorState title="Couldn't open this ticket" message={(visit.error as Error)?.message ?? 'Ticket not found'} onRetry={() => visit.refetch()} /></div>
      </main>
    );
  }

  const v = visit.data;
  const phone = v.contactPhone ?? v.customerPhone;
  const active = v.status === 'SCHEDULED' || v.status === 'CHECKED_IN';
  const title = v.service ?? v.assetModel ?? 'Service visit';

  return (
    <main className={active ? 'pb-32' : 'pb-10'}>
      <AppBar title="Ticket Details" back />

      <div className="space-y-4 p-4">
        {/* Headline: ticket number, status, what and for whom */}
        <div className={`${cardCls} p-4`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-primary">#{v.jobNo}</p>
              <h2 className="mt-0.5 text-xl font-bold leading-tight">{title}</h2>
              <p className="mt-0.5 text-sm text-muted">{v.customerName}</p>
            </div>
            <VisitStatusChip status={v.status} />
          </div>
          <div className="mt-4 space-y-3 border-t border-line pt-4">
            <div className="flex items-start gap-3">
              <IconTile tone="blue" size={40}><MapPin className="h-5 w-5" /></IconTile>
              <div className="min-w-0 text-sm">
                <div className="font-semibold">{v.siteLabel}</div>
                <div className="text-muted">{v.address}{v.city ? `, ${v.city}` : ''}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <IconTile tone="blue" size={40}><CalendarDays className="h-5 w-5" /></IconTile>
              <div className="text-sm">
                <div className="font-semibold">{dayLabel(v.scheduledFor) || 'Unscheduled'}</div>
                <div className="flex items-center gap-1 text-muted"><Clock className="h-3.5 w-3.5" /> Assigned {formatTime(v.scheduledFor)}</div>
              </div>
              {v.priority === 1 && v.status !== 'COMPLETED' && <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700"><Flag className="h-3 w-3" /> High priority</span>}
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <a href={mapsDirectionsUrl(v)} target="_blank" rel="noopener noreferrer" className={btnSecondary}><Navigation className="h-4 w-4 text-primary" /> Navigate</a>
            {phone ? <a href={`tel:${phone}`} className={btnSecondary}><Phone className="h-4 w-4 text-primary" /> Call customer</a> : <span />}
          </div>
        </div>

        {/* What the customer reported */}
        <Section title="Service details" icon={<Wrench className="h-4 w-4 text-primary" />}>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {v.service && <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-semibold text-primary">{v.service}</span>}
            {v.issue && <span className="rounded-full bg-canvas px-2.5 py-0.5 text-xs font-semibold text-muted">{v.issue}</span>}
          </div>
          <p className="text-sm leading-relaxed">{v.description ?? 'No description provided.'}</p>
          {v.contactName && <p className="mt-3 flex items-center gap-2 border-t border-line pt-3 text-sm"><User className="h-4 w-4 text-muted" /> <span className="text-muted">Contact:</span> <span className="font-medium">{v.contactName}</span></p>}
        </Section>

        {/* Machine and warranty */}
        <Section title="Machine" icon={<Printer className="h-4 w-4 text-primary" />}>
          {v.assetModel ? (
            <div>
              <div className="font-semibold">{v.assetModel}</div>
              {v.serialNumber && <div className="mt-1 text-xs text-muted">Serial no.</div>}
              {v.serialNumber && <div className="font-mono text-base font-semibold tracking-wide">{v.serialNumber}</div>}
            </div>
          ) : v.serialNumber ? (
            <div>
              <div className="text-xs text-muted">Serial no. given by customer</div>
              <div className="font-mono text-base font-semibold tracking-wide">{v.serialNumber}</div>
              <p className="mt-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Not found in our machine records. Check the label on the machine and tell the office if it differs.</p>
            </div>
          ) : <p className="text-sm text-muted">No serial number was given.</p>}
          <div className="mt-3">
            <WarrantyCard warranty={warranty.data} isLoading={visit.isSuccess && warranty.isLoading} isError={warranty.isError} onRetry={() => warranty.refetch()} />
          </div>
        </Section>

        {/* Solved summary + quotation */}
        {v.status === 'COMPLETED' && (
          <Section title="Solution & quotation" icon={<FileText className="h-4 w-4 text-primary" />}>
            {v.workDone && <p className="mb-3 text-sm leading-relaxed">{v.workDone}</p>}
            <div className="rounded-xl bg-canvas p-3 text-sm">
              <div className="mb-1 font-semibold">Quoted items</div>
              {v.parts && v.parts.length > 0 ? (
                <ul className="space-y-1.5">
                  {v.parts.map((p) => (
                    <li key={p.description} className="flex justify-between gap-2">
                      <span>{p.quantity} × {p.description}</span>
                      <span className={`shrink-0 tabular-nums ${p.warrantyWaived ? 'text-xs font-semibold text-emerald-700' : ''}`}>{p.warrantyWaived ? 'Warranty' : formatINR(p.lineTotalPaise)}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-muted">No parts or services used.</p>}
            </div>
            {v.quotation && (
              <div className="mt-3 rounded-xl border border-line p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <div><div className="text-xs text-muted">Quotation</div><div className="font-mono font-bold">{v.quotation.quotationNo}</div></div>
                  <div className="text-right"><QuoteStatusChip status={v.quotation.status} /><div className="mt-1 font-bold">{v.quotation.totalPaise === 0 ? 'No charge' : formatINR(v.quotation.totalPaise)}</div></div>
                </div>
                {shareUrl
                  ? <div className="mt-3"><ShareButtons url={shareUrl} quotationNo={v.quotation.quotationNo} customerName={v.customerName} phone={v.contactPhone ?? v.customerPhone} /></div>
                  : (
                    <button onClick={() => share.mutate(v.quotation!.id)} disabled={share.isPending} className={`${btnSecondary} mt-3 w-full`}>
                      {share.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4 text-primary" />} Share quotation with customer
                    </button>
                  )}
                {share.isError && <p role="alert" className="mt-2 text-xs text-red-700">{(share.error as Error).message}</p>}
              </div>
            )}
          </Section>
        )}

        {checkIn.isError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{(checkIn.error as Error).message}</p>}
      </div>

      {/* Sticky action bar: only the action that is actually possible now */}
      {active && (
        <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md border-t border-line bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {v.status === 'SCHEDULED' ? (
            <button onClick={() => checkIn.mutate()} disabled={checkIn.isPending} className={btnPrimary}>
              {checkIn.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogIn className="h-5 w-5" />}
              {checkIn.isPending ? 'Checking in…' : 'Check in at site'}
            </button>
          ) : (
            <Link href={`/visits/solve?id=${id}`} className={btnPrimary}><CheckCircle2 className="h-5 w-5" /> Solve &amp; create quotation</Link>
          )}
        </div>
      )}
    </main>
  );
}

export default function Page() {
  return (
    <ClientOnly fallback={<div className="space-y-3 p-4"><Skeleton className="h-40" /><Skeleton className="h-28" /></div>}>
      <VisitExecution />
    </ClientOnly>
  );
}
