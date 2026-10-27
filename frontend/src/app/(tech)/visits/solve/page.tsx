'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, Loader2, Minus, Plus, Search, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useIdParam } from '@/lib/useIdParam';
import { ClientOnly } from '@/components/ClientOnly';
import { ShareButtons } from '@/components/ShareQuotation';
import { WarrantyCard } from '@/components/WarrantyCard';
import { formatINR } from '@/lib/format';
import type { SolveResult } from '@/lib/types';

function SolveForm() {
  const id = useIdParam();
  const router = useRouter();
  const qc = useQueryClient();

  const visit = useQuery({ queryKey: ['visit', id], queryFn: () => api.getVisit(id) });
  const warranty = useQuery({ queryKey: ['visit', id, 'warranty'], queryFn: () => api.getVisitWarranty(id) });
  const catalog = useQuery({ queryKey: ['catalog', 'quote'], queryFn: () => api.getCatalog(), staleTime: 5 * 60_000 });
  const categories = useQuery({ queryKey: ['issue-categories'], queryFn: api.getIssueCategories, staleTime: 5 * 60_000 });

  const [workDone, setWorkDone] = useState('');
  const [categoryId, setCategoryId] = useState<number | ''>('');
  const [search, setSearch] = useState('');
  const [qtyById, setQtyById] = useState<Record<string, number>>({});
  const [result, setResult] = useState<SolveResult | null>(null);

  // One key per form instance: a retry after a network drop reuses it, so the server never records the fix twice.
  const idemKey = useRef<string>(crypto.randomUUID());

  const items = useMemo(() => catalog.data ?? [], [catalog.data]);
  const selected = useMemo(() => items.filter((c) => qtyById[c.id] > 0), [items, qtyById]);
  const payloadItems = useMemo(() => selected.map((c) => ({ catalogItemId: c.id, quantity: qtyById[c.id] })), [selected, qtyById]);
  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((c) => !qtyById[c.id] && (!q || c.name.toLowerCase().includes(q) || c.sku.toLowerCase().includes(q))).slice(0, 8);
  }, [items, qtyById, search]);

  // The server prices every line (warranty-aware, with GST). The screen only displays what it returns.
  const preview = useQuery({
    queryKey: ['visit', id, 'preview', payloadItems],
    queryFn: () => api.previewSolve(id, payloadItems),
    placeholderData: (prev) => prev,
  });
  const lineOf = (itemId: string) => preview.data?.lines.find((l) => l.catalogItemId === itemId);

  const setQty = (itemId: string, qty: number) =>
    setQtyById((prev) => {
      const next = { ...prev };
      if (qty <= 0) delete next[itemId];
      else next[itemId] = Math.min(qty, 99);
      return next;
    });

  const submit = useMutation({
    mutationFn: () => api.solveVisit(id, { workDone: workDone.trim(), issueCategoryId: categoryId === '' ? undefined : categoryId, items: payloadItems }, idemKey.current),
    onSuccess: (r) => {
      setResult(r);
      qc.invalidateQueries({ queryKey: ['visit', id] });
      qc.invalidateQueries({ queryKey: ['visits'] });
    },
  });

  const canSubmit = workDone.trim().length >= 3 && !submit.isPending && !catalog.isLoading && preview.isSuccess && !preview.isPlaceholderData;
  const inWarranty = warranty.data && !warranty.data.billable;
  const total = preview.data?.totalPaise ?? 0;
  const tax = (preview.data?.cgstPaise ?? 0) + (preview.data?.sgstPaise ?? 0) + (preview.data?.igstPaise ?? 0);

  // ───── success: the quotation is ready to share ─────
  if (result) {
    const v = visit.data;
    return (
      <main className="space-y-4 p-6">
        <div className="pt-6 text-center">
          <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-600" />
          <h1 className="mt-3 text-2xl font-bold">Ticket #{result.ticketNo} solved</h1>
          <p className="mt-1 text-sm text-slate-600">Quotation created. Send it to the customer now.</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center">
          <div className="text-sm text-slate-500">Quotation</div>
          <div className="font-mono text-xl font-bold">{result.quotation.quotationNo}</div>
          <div className="mt-1 text-2xl font-bold">{result.quotation.totalPaise === 0 ? 'No charge' : formatINR(result.quotation.totalPaise)}</div>
          {result.quotation.totalPaise > 0 && <div className="text-xs text-slate-500">including GST</div>}
        </div>
        <ShareButtons url={result.shareUrl} quotationNo={result.quotation.quotationNo} customerName={v?.customerName ?? 'Customer'} phone={v?.contactPhone ?? v?.customerPhone} />
        <p className="text-center text-xs text-slate-500">The customer can view, print and approve it from the link. The office sees it on the ticket.</p>
        <button onClick={() => router.push('/')} className="w-full rounded-2xl bg-slate-900 py-4 font-bold text-white active:bg-slate-800">Back to my tickets</button>
      </main>
    );
  }

  return (
    <main className="pb-44">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        <Link href={`/visits/detail?id=${id}`} aria-label="Back to ticket" className="rounded-full p-2 active:bg-slate-100"><ArrowLeft className="h-5 w-5" /></Link>
        <div className="min-w-0">
          <h1 className="text-base font-bold">Solve &amp; create quotation</h1>
          <p className="truncate text-xs text-slate-500">{visit.data ? `${visit.data.customerName} · ${visit.data.assetModel ?? visit.data.serialNumber ?? 'no machine'}` : 'Loading…'}</p>
        </div>
      </header>

      <div className="space-y-5 p-4">
        <WarrantyCard warranty={warranty.data} isLoading={warranty.isLoading} isError={warranty.isError} onRetry={() => warranty.refetch()} compact />

        <section>
          <label htmlFor="workDone" className="mb-1.5 block text-sm font-semibold">Solution / work done <span className="text-red-600">*</span></label>
          <textarea id="workDone" rows={4} value={workDone} onChange={(e) => setWorkDone(e.target.value)} maxLength={4000}
            placeholder="e.g. Cleaned paper path, replaced pickup roller, tested 20 pages."
            className="w-full rounded-2xl border border-slate-300 bg-white p-3 text-base outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10" />
        </section>

        <section>
          <label htmlFor="category" className="mb-1.5 block text-sm font-semibold">Problem category</label>
          <select id="category" value={categoryId} onChange={(e) => setCategoryId(e.target.value === '' ? '' : Number(e.target.value))}
            className="w-full rounded-2xl border border-slate-300 bg-white p-3 text-base outline-none focus:border-slate-900">
            <option value="">{visit.data?.issue ? `Keep: ${visit.data.issue}` : 'Select…'}</option>
            {categories.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </section>

        <section>
          <h2 className="mb-1.5 text-sm font-semibold">Parts &amp; services used</h2>

          {selected.length > 0 && (
            <ul className="mb-3 space-y-2">
              {selected.map((c) => {
                const qty = qtyById[c.id];
                const line = lineOf(c.id);
                return (
                  <li key={c.id} className="rounded-2xl border border-slate-200 bg-white p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold leading-tight">{c.name}</div>
                        <div className="text-xs text-slate-500">{c.sku} · {formatINR(c.unitPricePaise)} each</div>
                      </div>
                      <button onClick={() => setQty(c.id, 0)} aria-label={`Remove ${c.name}`} className="rounded-full p-2 text-slate-400 active:bg-slate-100"><Trash2 className="h-4 w-4" /></button>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
                        <button onClick={() => setQty(c.id, qty - 1)} aria-label="Decrease quantity" className="rounded-lg p-2 active:bg-white"><Minus className="h-4 w-4" /></button>
                        <span className="w-8 text-center font-semibold tabular-nums">{qty}</span>
                        <button onClick={() => setQty(c.id, qty + 1)} aria-label="Increase quantity" className="rounded-lg p-2 active:bg-white"><Plus className="h-4 w-4" /></button>
                      </div>
                      {line
                        ? line.warrantyWaived
                          ? <span className="text-sm font-bold text-emerald-700">Free · warranty</span>
                          : <span className="text-sm font-bold tabular-nums">{formatINR(line.lineTotalPaise)}</span>
                        : <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3.5 h-5 w-5 text-slate-400" />
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search parts, toner, services…"
              className="w-full rounded-2xl border border-slate-300 bg-white py-3 pl-10 pr-3 text-base outline-none focus:border-slate-900" />
          </div>

          <div className="mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {catalog.isLoading && <p className="p-4 text-sm text-slate-500">Loading items…</p>}
            {catalog.isError && <p className="p-4 text-sm text-red-700">Could not load the list. <button onClick={() => catalog.refetch()} className="font-semibold underline">Retry</button></p>}
            {!catalog.isLoading && !catalog.isError && results.length === 0 && <p className="p-4 text-sm text-slate-500">No matching items.</p>}
            {results.map((c) => (
              <button key={c.id} onClick={() => { setQty(c.id, 1); setSearch(''); }}
                className="flex w-full items-center justify-between gap-3 border-b border-slate-100 p-3 text-left last:border-0 active:bg-slate-50">
                <div className="min-w-0">
                  <div className="truncate font-medium">{c.name}</div>
                  <div className="text-xs text-slate-500">
                    {c.type === 'SERVICE' ? 'Service' : c.type === 'PART' ? 'Spare part' : 'Consumable'}
                    {inWarranty && (c.warrantyCovers ? ' · free in warranty' : ' · charged even in warranty')}
                  </div>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums">{formatINR(c.unitPricePaise)}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">Nothing used? Leave this empty to create a no-charge quotation.</p>
        </section>

        {submit.isError && <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{(submit.error as Error).message}</p>}
        {preview.isError && <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{(preview.error as Error).message}</p>}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md border-t border-slate-200 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mb-3 space-y-0.5 text-sm">
          <div className="flex justify-between text-slate-600"><span>Subtotal</span><span className="tabular-nums">{formatINR(preview.data?.subtotalPaise ?? 0)}</span></div>
          <div className="flex justify-between text-slate-600"><span>GST</span><span className="tabular-nums">{formatINR(tax)}</span></div>
          <div className="flex justify-between text-base font-bold"><span>Quotation total</span><span className="tabular-nums">{total === 0 ? 'No charge' : formatINR(total)}</span></div>
        </div>
        <button onClick={() => submit.mutate()} disabled={!canSubmit}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-4 text-base font-bold text-white active:bg-emerald-700 disabled:opacity-50">
          {submit.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
          Solve &amp; create quotation
        </button>
        {workDone.trim().length < 3 && <p className="mt-2 text-center text-xs text-slate-500">Describe the solution to continue.</p>}
      </div>
    </main>
  );
}

export default function Page() {
  return (
    <ClientOnly fallback={<div className="p-4"><div className="h-40 animate-pulse rounded-2xl bg-slate-200" /></div>}>
      <SolveForm />
    </ClientOnly>
  );
}
