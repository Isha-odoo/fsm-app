'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, Loader2, LogIn, Share2, MapPin, Navigation, Phone, Printer, User } from 'lucide-react';
import { api } from '@/lib/api';
import { useIdParam } from '@/lib/useIdParam';
import { ClientOnly } from '@/components/ClientOnly';
import { formatINR, formatWhen, mapsDirectionsUrl } from '@/lib/format';
import { WarrantyCard } from '@/components/WarrantyCard';
import { QuoteStatusChip, VisitStatusChip } from '@/components/StatusChip';
import { ShareButtons } from '@/components/ShareQuotation';

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
    return <div className="flex h-dvh items-center justify-center text-slate-500"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }
  if (visit.isError || !visit.data) {
    return (
      <main className="p-6">
        <BackLink />
        <p className="mt-6 rounded-2xl bg-red-50 p-4 text-red-800">{(visit.error as Error)?.message ?? 'Visit not found'}</p>
      </main>
    );
  }

  const v = visit.data;
  const phone = v.contactPhone ?? v.customerPhone;

  return (
    <main className="pb-32">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        <BackLink />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-bold">{v.customerName}</h1>
          <p className="text-xs text-slate-500">Ticket #{v.jobNo} · assigned {formatWhen(v.scheduledFor)}</p>
        </div>
        <VisitStatusChip status={v.status} />
      </header>

      <div className="space-y-4 p-4">
        {/* Customer & site */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Customer &amp; site</h2>
          <div className="flex items-start gap-2">
            <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
            <div className="text-sm">
              <div className="font-semibold">{v.siteLabel}</div>
              <div className="text-slate-600">{v.address}{v.city ? `, ${v.city}` : ''}</div>
            </div>
          </div>
          {v.contactName && (
            <div className="mt-3 flex items-center gap-2 text-sm"><User className="h-5 w-5 text-slate-400" /> {v.contactName}</div>
          )}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <a href={mapsDirectionsUrl(v)} target="_blank" rel="noopener noreferrer"
               className="flex items-center justify-center gap-2 rounded-xl bg-slate-100 py-3 text-sm font-semibold active:bg-slate-200">
              <Navigation className="h-4 w-4" /> Navigate
            </a>
            {phone ? (
              <a href={`tel:${phone}`} className="flex items-center justify-center gap-2 rounded-xl bg-slate-100 py-3 text-sm font-semibold active:bg-slate-200">
                <Phone className="h-4 w-4" /> Call
              </a>
            ) : <span />}
          </div>
        </section>

        {/* Machine */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Machine</h2>
          {v.assetModel ? (
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-slate-100 p-3"><Printer className="h-6 w-6 text-slate-600" /></div>
              <div>
                <div className="font-semibold">{v.assetModel}</div>
                <div className="text-sm text-slate-500">Serial no.</div>
                <div className="font-mono text-base font-semibold tracking-wide">{v.serialNumber}</div>
              </div>
            </div>
          ) : v.serialNumber ? (
            <div>
              <div className="text-sm text-slate-500">Serial no. given by customer</div>
              <div className="font-mono text-base font-semibold tracking-wide">{v.serialNumber}</div>
              <p className="mt-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Not found in our machine records. Check the label on the machine and tell the office if it differs.</p>
            </div>
          ) : <p className="text-sm text-slate-600">No serial number was given.</p>}
        </section>

        {/* Warranty, fetched dynamically */}
        <section>
          <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Warranty status</h2>
          <WarrantyCard
            warranty={warranty.data}
            isLoading={visit.isSuccess && warranty.isLoading}
            isError={warranty.isError}
            onRetry={() => warranty.refetch()}
          />
        </section>

        {/* Reported problem */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Reported problem</h2>
          <div className="mb-1 flex flex-wrap gap-1.5">
            {v.service && <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-semibold text-sky-800">Service: {v.service}</span>}
            {v.issue && <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold">{v.issue}</span>}
          </div>
          <p className="text-sm text-slate-700">{v.description ?? 'No description provided.'}</p>
        </section>

        {/* Solved summary + quotation */}
        {v.status === 'COMPLETED' && (
          <section className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Solution recorded</h2>
            {v.workDone && <p className="text-sm text-emerald-950">{v.workDone}</p>}
            <div className="rounded-xl bg-white p-3 text-sm">
              <div className="mb-1 font-semibold">Quoted items</div>
              {v.parts && v.parts.length > 0 ? (
                <ul className="space-y-1">
                  {v.parts.map((p) => (
                    <li key={p.description} className="flex justify-between gap-2">
                      <span>{p.quantity} × {p.description}</span>
                      <span className={`shrink-0 tabular-nums ${p.warrantyWaived ? 'text-xs font-semibold text-emerald-700' : ''}`}>{p.warrantyWaived ? 'Warranty' : formatINR(p.lineTotalPaise)}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-slate-600">No parts or services used.</p>}
            </div>
            {v.quotation && (
              <div className="rounded-xl bg-white p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <div><div className="text-xs text-slate-500">Quotation</div><div className="font-mono font-bold">{v.quotation.quotationNo}</div></div>
                  <div className="text-right"><QuoteStatusChip status={v.quotation.status} /><div className="mt-1 font-bold">{v.quotation.totalPaise === 0 ? 'No charge' : formatINR(v.quotation.totalPaise)}</div></div>
                </div>
                {shareUrl
                  ? <div className="mt-3"><ShareButtons url={shareUrl} quotationNo={v.quotation.quotationNo} customerName={v.customerName} phone={v.contactPhone ?? v.customerPhone} /></div>
                  : (
                    <button onClick={() => share.mutate(v.quotation!.id)} disabled={share.isPending}
                      className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 py-3 text-sm font-semibold active:bg-slate-100 disabled:opacity-60">
                      {share.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />} Share quotation with customer
                    </button>
                  )}
                {share.isError && <p role="alert" className="mt-2 text-xs text-red-700">{(share.error as Error).message}</p>}
              </div>
            )}
          </section>
        )}

        {checkIn.isError && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{(checkIn.error as Error).message}</p>}
      </div>

      {/* Sticky action bar */}
      {(v.status === 'SCHEDULED' || v.status === 'CHECKED_IN') && (
        <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md border-t border-slate-200 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {v.status === 'SCHEDULED' ? (
            <button
              onClick={() => checkIn.mutate()}
              disabled={checkIn.isPending}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 py-4 text-base font-bold text-white active:bg-slate-800 disabled:opacity-60"
            >
              {checkIn.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogIn className="h-5 w-5" />}
              {checkIn.isPending ? 'Checking in…' : 'Check in at site'}
            </button>
          ) : (
            <Link
              href={`/visits/solve?id=${id}`}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-4 text-base font-bold text-white active:bg-emerald-700"
            >
              <CheckCircle2 className="h-5 w-5" /> Solve &amp; create quotation
            </Link>
          )}
        </div>
      )}
    </main>
  );
}

function BackLink() {
  return (
    <Link href="/" aria-label="Back to my tickets" className="rounded-full p-2 active:bg-slate-100">
      <ArrowLeft className="h-5 w-5" />
    </Link>
  );
}


export default function Page() {
  return (
    <ClientOnly fallback={<div className="p-4"><div className="h-40 animate-pulse rounded-2xl bg-slate-200" /></div>}>
      <VisitExecution />
    </ClientOnly>
  );
}
