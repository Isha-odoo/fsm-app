'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { api } from '@/lib/api';
import { ClientOnly } from '@/components/ClientOnly';
import { formatDay, formatINR } from '@/lib/format';

const th = 'p-3 text-xs font-semibold uppercase tracking-wide text-muted whitespace-nowrap';
const control = 'rounded-xl border border-slate-300 bg-white px-2.5 py-2 text-sm outline-none focus:border-primary';

function Invoices() {
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const list = useQuery({ queryKey: ['admin', 'invoices', q, from, to], queryFn: () => api.getInvoices({ q, from: from || undefined, to: to || undefined }), placeholderData: (p) => p });
  const rows = list.data ?? [];
  const total = rows.reduce((s, r) => s + r.totalPaise, 0);

  return (
    <main className="space-y-4 p-4 md:p-6">
      <header>
        <h1 className="text-2xl font-bold">Invoices</h1>
        <p className="text-sm text-slate-600">Tax invoices issued from solved tickets. Open one to print it or save it as PDF.</p>
      </header>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Invoice no, customer or ticket…" aria-label="Search invoices" className={`${control} pl-9`} />
        </div>
        <label className="flex items-center gap-1.5 text-sm text-slate-600">From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={control} /></label>
        <label className="flex items-center gap-1.5 text-sm text-slate-600">To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={control} /></label>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full text-sm">
          <thead className="bg-canvas text-left"><tr><th className={th}>Invoice</th><th className={th}>Date</th><th className={th}>Customer</th><th className={th}>Ticket</th><th className={th}>Quotation</th><th className={th}>Issued by</th><th className={`${th} text-right`}>Total</th><th className={th} /></tr></thead>
          <tbody>
            {list.isLoading && <tr><td colSpan={8} className="p-4"><div className="h-8 animate-pulse rounded bg-slate-100" /></td></tr>}
            {list.isError && <tr><td colSpan={8} className="p-4 text-red-700">{(list.error as Error).message}</td></tr>}
            {list.isSuccess && rows.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-muted">No invoices yet. Create one from a solved ticket on the Dispatch board.</td></tr>}
            {rows.map((i) => (
              <tr key={i.id} className="border-t border-slate-100 hover:bg-canvas">
                <td className="p-3 font-mono font-semibold">{i.invoiceNo}</td>
                <td className="whitespace-nowrap p-3 text-slate-600">{formatDay(i.issuedAt)}</td>
                <td className="p-3 font-semibold">{i.customerName}</td>
                <td className="p-3"><Link href={`/admin/tickets/view?id=${i.ticketId}`} className="font-mono underline-offset-2 hover:underline">#{i.ticketNo}</Link></td>
                <td className="p-3 font-mono text-xs">{i.quotationNo ?? '—'}</td>
                <td className="p-3 text-slate-600">{i.issuedBy ?? '—'}</td>
                <td className="p-3 text-right font-semibold tabular-nums">{formatINR(i.totalPaise)}</td>
                <td className="p-3 text-right"><Link href={`/admin/invoices/view?id=${i.id}`} className="font-semibold text-slate-700 underline-offset-2 hover:underline">Open / print</Link></td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && <tfoot className="border-t border-line bg-canvas font-bold"><tr><td colSpan={6} className="p-3 text-right">Total ({rows.length})</td><td className="p-3 text-right tabular-nums">{formatINR(total)}</td><td /></tr></tfoot>}
        </table>
      </div>
    </main>
  );
}

export default function Page() {
  return (
    <ClientOnly fallback={<div className="p-6"><div className="h-64 animate-pulse rounded-2xl bg-slate-200" /></div>}>
      <Invoices />
    </ClientOnly>
  );
}
