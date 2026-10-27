'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { api } from '@/lib/api';
import { ClientOnly } from '@/components/ClientOnly';
import { QuoteStatusChip } from '@/components/StatusChip';
import { formatDay, formatINR } from '@/lib/format';
import type { QuoteStatus } from '@/lib/types';

const th = 'p-3 text-xs font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap';
const control = 'rounded-xl border border-slate-300 bg-white px-2.5 py-2 text-sm outline-none focus:border-slate-900';

function Quotations() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<QuoteStatus | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const list = useQuery({
    queryKey: ['admin', 'quotations', q, status, from, to],
    queryFn: () => api.getQuotations({ q, status: status || undefined, from: from || undefined, to: to || undefined }),
    placeholderData: (p) => p,
  });
  const rows = list.data ?? [];

  return (
    <main className="space-y-4 p-4 md:p-6">
      <header>
        <h1 className="text-2xl font-bold">Quotations</h1>
        <p className="text-sm text-slate-600">Created by technicians on site when they solve a ticket, and shared with the customer.</p>
      </header>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Quotation no, customer or ticket…" aria-label="Search quotations" className={`${control} pl-9`} />
        </div>
        <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as QuoteStatus | '')} className={control}>
          <option value="">Any status</option><option value="SHARED">Sent to customer</option><option value="APPROVED">Approved</option><option value="REJECTED">Declined</option>
        </select>
        <label className="flex items-center gap-1.5 text-sm text-slate-600">From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={control} /></label>
        <label className="flex items-center gap-1.5 text-sm text-slate-600">To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={control} /></label>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left"><tr><th className={th}>Quotation</th><th className={th}>Date</th><th className={th}>Customer</th><th className={th}>Product</th><th className={th}>Ticket</th><th className={th}>Technician</th><th className={th}>Status</th><th className={`${th} text-right`}>Total</th><th className={th}>Invoice</th></tr></thead>
          <tbody>
            {list.isLoading && <tr><td colSpan={9} className="p-4"><div className="h-8 animate-pulse rounded bg-slate-100" /></td></tr>}
            {list.isError && <tr><td colSpan={9} className="p-4 text-red-700">{(list.error as Error).message}</td></tr>}
            {list.isSuccess && rows.length === 0 && <tr><td colSpan={9} className="p-8 text-center text-slate-500">No quotations yet.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="p-3"><Link href={`/admin/quotations/view?id=${r.id}`} className="font-mono font-semibold underline-offset-2 hover:underline">{r.quotationNo}</Link></td>
                <td className="whitespace-nowrap p-3 text-slate-600">{formatDay(r.createdAt)}</td>
                <td className="p-3 font-semibold">{r.customerName}</td>
                <td className="p-3">{r.product ?? '—'}</td>
                <td className="p-3"><Link href={`/admin/tickets/view?id=${r.ticketId}`} className="font-mono underline-offset-2 hover:underline">#{r.ticketNo}</Link></td>
                <td className="p-3 text-slate-600">{r.technicianName ?? '—'}</td>
                <td className="p-3"><QuoteStatusChip status={r.status} /></td>
                <td className="p-3 text-right font-semibold tabular-nums">{r.totalPaise === 0 ? 'No charge' : formatINR(r.totalPaise)}</td>
                <td className="p-3">{r.invoiceId ? <Link href={`/admin/invoices/view?id=${r.invoiceId}`} className="font-mono text-xs underline-offset-2 hover:underline">{r.invoiceNo}</Link> : <span className="text-slate-400">Not invoiced</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}

export default function Page() {
  return (
    <ClientOnly fallback={<div className="p-6"><div className="h-64 animate-pulse rounded-2xl bg-slate-200" /></div>}>
      <Quotations />
    </ClientOnly>
  );
}
