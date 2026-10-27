'use client';

import { Fragment, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Download, Search, X } from 'lucide-react';
import { api } from '@/lib/api';
import { ClientOnly } from '@/components/ClientOnly';
import { TicketStatusChip } from '@/components/StatusChip';
import { formatDay, formatWhen, istDate, istMonthStart } from '@/lib/format';
import type { ReportFilters, Ticket, TicketStatus } from '@/lib/types';

type Tab = 'TICKETS' | 'EMPLOYEES' | 'CUSTOMERS';
type GroupBy = 'NONE' | 'DAY' | 'CUSTOMER' | 'TECHNICIAN' | 'STATUS' | 'PRODUCT' | 'SERVICE';

const th = 'p-3 text-xs font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap';
const control = 'rounded-xl border border-slate-300 bg-white px-2.5 py-2 text-sm outline-none focus:border-slate-900';
const STATUS_OPTIONS: TicketStatus[] = ['NEW', 'ASSIGNED', 'IN_PROGRESS', 'SOLVED', 'CANCELLED'];
const STATUS_LABEL: Record<TicketStatus, string> = { NEW: 'New', ASSIGNED: 'Assigned', IN_PROGRESS: 'In progress', SOLVED: 'Solved', CANCELLED: 'Cancelled' };

const GROUPS: Record<GroupBy, { label: string; key: (t: Ticket) => string }> = {
  NONE: { label: 'No grouping', key: () => '' },
  DAY: { label: 'Day', key: (t) => istDate0(t.createdAt) },
  CUSTOMER: { label: 'Customer', key: (t) => t.customerName },
  TECHNICIAN: { label: 'Assigned to', key: (t) => t.technicianName ?? 'Unassigned' },
  STATUS: { label: 'Status', key: (t) => STATUS_LABEL[t.status] },
  PRODUCT: { label: 'Product', key: (t) => t.model ?? 'Not specified' },
  SERVICE: { label: 'Service', key: (t) => t.service ?? 'Not specified' },
};

/** IST calendar day (YYYY-MM-DD) of a timestamp. */
function istDate0(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(iso));
}

const PRESETS: { label: string; range: () => { from: string; to: string } }[] = [
  { label: 'Today', range: () => ({ from: istDate(), to: istDate() }) },
  { label: 'Yesterday', range: () => ({ from: istDate(-1), to: istDate(-1) }) },
  { label: 'Last 7 days', range: () => ({ from: istDate(-6), to: istDate() }) },
  { label: 'This month', range: () => ({ from: istMonthStart(), to: istDate() }) },
  { label: 'Last 30 days', range: () => ({ from: istDate(-29), to: istDate() }) },
  { label: 'All time', range: () => ({ from: '', to: '' }) },
];

function downloadCsv(rows: Ticket[]) {
  const head = ['Ticket', 'Raised', 'Customer', 'Contact', 'Phone', 'Product', 'Serial', 'Service', 'Problem', 'Status', 'Assigned to', 'Assigned by', 'Assigned at', 'Solved at', 'Solution', 'Invoice'];
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = rows.map((t) => [t.ticketNo, t.createdAt, t.customerName, t.contactName, t.phone, t.model, t.serialNumber, t.service, t.description, t.status,
    t.technicianName, t.assignedByName, t.assignedAt, t.solvedAt, t.workDone, t.invoice?.invoiceNo].map(esc).join(','));
  const blob = new Blob([[head.map(esc).join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `tickets-${istDate()}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function Card({ label, value, tone = '' }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className={`text-3xl font-bold tabular-nums ${tone}`}>{value}</div>
      <div className="text-sm text-slate-600">{label}</div>
    </div>
  );
}

function Reports() {
  const [tab, setTab] = useState<Tab>('TICKETS');
  const [range, setRange] = useState(() => PRESETS[4].range());
  const [customerId, setCustomerId] = useState('');
  const [technicianId, setTechnicianId] = useState('');
  const [productId, setProductId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [status, setStatus] = useState<TicketStatus | ''>('');
  const [q, setQ] = useState('');
  const [groupBy, setGroupBy] = useState<GroupBy>('NONE');

  const filters: ReportFilters = {
    from: range.from || undefined, to: range.to || undefined, customerId: customerId || undefined, technicianId: technicianId || undefined,
    productId: productId || undefined, serviceId: serviceId || undefined, status: status ? [status] : undefined, q: q.trim() || undefined,
  };
  const hasFilters = !!(customerId || technicianId || productId || serviceId || status || q);

  const tickets = useQuery({ queryKey: ['admin', 'report', filters], queryFn: () => api.getTicketReport(filters), placeholderData: (prev) => prev });
  const techs = useQuery({ queryKey: ['admin', 'technicians', range.from, range.to], queryFn: () => api.getTechnicianReport({ from: range.from || undefined, to: range.to || undefined }), placeholderData: (prev) => prev });
  const customers = useQuery({ queryKey: ['admin', 'customers', range.from, range.to, q], queryFn: () => api.getCustomerReport({ from: range.from || undefined, to: range.to || undefined, q: tab === 'CUSTOMERS' ? q.trim() : '' }), placeholderData: (prev) => prev });
  const allCustomers = useQuery({ queryKey: ['admin', 'customers-all'], queryFn: () => api.getCustomerReport(), staleTime: 60_000 });
  const products = useQuery({ queryKey: ['admin', 'inventory', 'PRODUCT'], queryFn: () => api.getInventory({ type: 'PRODUCT' }), staleTime: 60_000 });
  const services = useQuery({ queryKey: ['admin', 'inventory', 'SERVICE'], queryFn: () => api.getInventory({ type: 'SERVICE' }), staleTime: 60_000 });

  const rows = useMemo(() => tickets.data?.rows ?? [], [tickets.data]);
  const groups = useMemo(() => {
    if (groupBy === 'NONE') return [{ name: '', rows }];
    const m = new Map<string, Ticket[]>();
    for (const t of rows) { const k = GROUPS[groupBy].key(t); m.set(k, [...(m.get(k) ?? []), t]); }
    const list = [...m.entries()].map(([name, r]) => ({ name, rows: r }));
    return groupBy === 'DAY' ? list.sort((a, b) => b.name.localeCompare(a.name)) : list.sort((a, b) => a.name.localeCompare(b.name));
  }, [rows, groupBy]);

  const drill = (f: { technicianId?: string; customerId?: string }) => {
    setTechnicianId(f.technicianId ?? ''); setCustomerId(f.customerId ?? ''); setTab('TICKETS');
  };
  const clear = () => { setCustomerId(''); setTechnicianId(''); setProductId(''); setServiceId(''); setStatus(''); setQ(''); };
  const sum = tickets.data?.summary;

  return (
    <main className="space-y-4 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-sm text-slate-600">Filter by day, customer, product, service and employee. Click an employee or customer to see their tickets.</p>
        </div>
        <button onClick={() => downloadCsv(rows)} disabled={rows.length === 0} className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50">
          <Download className="h-4 w-4" /> Export CSV
        </button>
      </header>

      {/* ───── filter bar ───── */}
      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map((p) => {
            const r = p.range();
            const active = r.from === range.from && r.to === range.to;
            return <button key={p.label} onClick={() => setRange(r)} className={`rounded-full px-3 py-1 text-sm font-semibold ${active ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>{p.label}</button>;
          })}
          <span className="mx-1 hidden h-5 w-px bg-slate-200 sm:block" />
          <label className="flex items-center gap-1.5 text-sm text-slate-600">From <input type="date" value={range.from} max={range.to || undefined} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} className={control} /></label>
          <label className="flex items-center gap-1.5 text-sm text-slate-600">To <input type="date" value={range.to} min={range.from || undefined} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} className={control} /></label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Customer" value={customerId} onChange={(e) => setCustomerId(e.target.value)} className={control}>
            <option value="">All customers</option>
            {allCustomers.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select aria-label="Employee" value={technicianId} onChange={(e) => setTechnicianId(e.target.value)} className={control}>
            <option value="">All technicians</option>
            {techs.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select aria-label="Product" value={productId} onChange={(e) => setProductId(e.target.value)} className={control}>
            <option value="">All products</option>
            {products.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select aria-label="Service" value={serviceId} onChange={(e) => setServiceId(e.target.value)} className={control}>
            <option value="">All services</option>
            {services.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as TicketStatus | '')} className={control}>
            <option value="">Any status</option>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ticket no, customer or serial…" aria-label="Search" className={`${control} pl-9`} />
          </div>
          {hasFilters && <button onClick={clear} className="flex items-center gap-1 text-sm font-semibold text-slate-600 hover:text-slate-900"><X className="h-4 w-4" /> Clear filters</button>}
        </div>
      </section>

      <div className="flex gap-1 rounded-xl bg-white p-1 shadow-sm ring-1 ring-slate-200 sm:w-fit">
        {([['TICKETS', 'Tickets'], ['EMPLOYEES', 'Employees'], ['CUSTOMERS', 'Customers']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`flex-1 rounded-lg px-4 py-1.5 text-sm font-semibold ${tab === k ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{label}</button>
        ))}
      </div>

      {/* ───── tickets ───── */}
      {tab === 'TICKETS' && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card label="Tickets raised" value={sum?.raised ?? 0} />
            <Card label="Solved" value={sum?.solved ?? 0} tone="text-emerald-700" />
            <Card label="Open" value={sum?.open ?? 0} tone="text-amber-700" />
            <Card label="Cancelled" value={sum?.cancelled ?? 0} tone="text-slate-500" />
          </div>

          {tickets.isError && <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{(tickets.error as Error).message}</p>}

          {tickets.data && tickets.data.daily.length > 0 && (
            <details className="overflow-hidden rounded-2xl border border-slate-200 bg-white" open={tickets.data.daily.length <= 14}>
              <summary className="cursor-pointer p-4 font-bold">Day-wise summary <span className="font-normal text-slate-500">({tickets.data.daily.length} days)</span></summary>
              <div className="max-h-72 overflow-auto border-t border-slate-100">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-left"><tr><th className={th}>Day</th><th className={`${th} text-right`}>Raised</th><th className={`${th} text-right`}>Solved</th><th className={`${th} text-right`}>Open</th><th className={`${th} text-right`}>Cancelled</th></tr></thead>
                  <tbody>
                    {tickets.data.daily.map((d) => (
                      <tr key={d.day} className="border-t border-slate-100">
                        <td className="p-3 font-semibold">{formatDay(`${d.day}T00:00:00+05:30`)}</td>
                        <td className="p-3 text-right tabular-nums">{d.raised}</td>
                        <td className="p-3 text-right tabular-nums text-emerald-700">{d.solved}</td>
                        <td className="p-3 text-right tabular-nums text-amber-700">{d.open}</td>
                        <td className="p-3 text-right tabular-nums text-slate-500">{d.cancelled}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
              <h2 className="font-bold">Tickets <span className="font-normal text-slate-500">({rows.length}{tickets.data?.truncated ? '+' : ''})</span></h2>
              <label className="flex items-center gap-2 text-sm text-slate-600">Group by
                <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)} className={control}>
                  {(Object.keys(GROUPS) as GroupBy[]).map((g) => <option key={g} value={g}>{GROUPS[g].label}</option>)}
                </select>
              </label>
            </div>
            {tickets.data?.truncated && <p className="bg-amber-50 p-3 text-sm text-amber-900">Showing the newest 2,000 tickets. Narrow the date range to see the rest.</p>}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left">
                  <tr><th className={th}>Ticket</th><th className={th}>Raised</th><th className={th}>Customer</th><th className={th}>Product</th><th className={th}>Service</th><th className={th}>Status</th><th className={th}>Assigned to</th><th className={th}>Assigned by</th><th className={th}>Solved</th></tr>
                </thead>
                <tbody>
                  {tickets.isLoading && <tr><td colSpan={9} className="p-4"><div className="h-8 animate-pulse rounded bg-slate-100" /></td></tr>}
                  {tickets.isSuccess && rows.length === 0 && <tr><td colSpan={9} className="p-8 text-center text-slate-500">No tickets match these filters.</td></tr>}
                  {groups.map((g) => (
                    <Fragment key={g.name || 'all'}>
                      {groupBy !== 'NONE' && (
                        <tr className="border-t border-slate-200 bg-slate-100/80">
                          <td colSpan={9} className="p-2.5 pl-3 text-sm font-bold">
                            {groupBy === 'DAY' ? formatDay(`${g.name}T00:00:00+05:30`) : g.name}
                            <span className="ml-2 font-normal text-slate-500">{g.rows.length} ticket{g.rows.length === 1 ? '' : 's'} · {g.rows.filter((t) => t.status === 'SOLVED').length} solved</span>
                          </td>
                        </tr>
                      )}
                      {g.rows.map((t) => (
                        <tr key={t.id} className="border-t border-slate-100 hover:bg-slate-50">
                          <td className="p-3 font-mono font-semibold"><Link href={`/admin/tickets/view?id=${t.id}`} className="underline-offset-2 hover:underline">#{t.ticketNo}</Link></td>
                          <td className="whitespace-nowrap p-3 text-slate-600">{formatWhen(t.createdAt)}</td>
                          <td className="p-3"><div className="font-semibold">{t.customerName}</div>{t.phone && <div className="text-xs text-slate-500">{t.phone}</div>}</td>
                          <td className="p-3">{t.model ?? '—'}{t.serialNumber && <div className="font-mono text-xs text-slate-500">{t.serialNumber}</div>}</td>
                          <td className="p-3">{t.service ?? '—'}</td>
                          <td className="p-3"><TicketStatusChip status={t.status} /></td>
                          <td className="p-3">{t.technicianName ?? <span className="text-slate-400">Unassigned</span>}</td>
                          <td className="p-3 text-slate-600">{t.assignedByName ?? '—'}{t.assignedAt && <div className="text-xs text-slate-400">{formatWhen(t.assignedAt)}</div>}</td>
                          <td className="whitespace-nowrap p-3 text-slate-600">{formatWhen(t.solvedAt)}</td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {/* ───── employees ───── */}
      {tab === 'EMPLOYEES' && (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left"><tr><th className={th}>Technician</th><th className={`${th} text-right`}>Active tickets now</th><th className={`${th} text-right`}>Assigned in period</th><th className={`${th} text-right`}>Total visits</th><th className={`${th} text-right`}>Solved</th><th className={`${th} text-right`}>Last solved</th></tr></thead>
              <tbody>
                {techs.isLoading && <tr><td colSpan={6} className="p-4"><div className="h-8 animate-pulse rounded bg-slate-100" /></td></tr>}
                {techs.data?.map((t) => (
                  <tr key={t.id} onClick={() => drill({ technicianId: t.id })} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50">
                    <td className="p-3 font-semibold">{t.name}</td>
                    <td className="p-3 text-right tabular-nums"><span className={t.activeTickets > 0 ? 'rounded-full bg-amber-100 px-2.5 py-0.5 font-semibold text-amber-800' : 'text-slate-500'}>{t.activeTickets}</span></td>
                    <td className="p-3 text-right tabular-nums">{t.assigned}</td>
                    <td className="p-3 text-right tabular-nums">{t.totalVisits}</td>
                    <td className="p-3 text-right tabular-nums text-emerald-700">{t.solvedTickets}</td>
                    <td className="p-3 text-right text-slate-600">{formatWhen(t.lastSolvedAt)}</td>
                  </tr>
                ))}
                {techs.isError && <tr><td colSpan={6} className="p-4 text-red-700">{(techs.error as Error).message}</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="border-t border-slate-100 p-3 text-xs text-slate-500">Total visits counts sites checked in at during the period. Active tickets are assigned or on site right now, whatever the dates.</p>
        </section>
      )}

      {/* ───── customers ───── */}
      {tab === 'CUSTOMERS' && (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left"><tr><th className={th}>Customer</th><th className={th}>Phone</th><th className={`${th} text-right`}>Raised</th><th className={`${th} text-right`}>Solved</th><th className={`${th} text-right`}>Open</th><th className={`${th} text-right`}>Last ticket</th></tr></thead>
              <tbody>
                {customers.isLoading && <tr><td colSpan={6} className="p-4"><div className="h-8 animate-pulse rounded bg-slate-100" /></td></tr>}
                {customers.isSuccess && customers.data.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-slate-500">No customers raised tickets in this period.</td></tr>}
                {customers.data?.map((c) => (
                  <tr key={c.id} onClick={() => drill({ customerId: c.id })} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50">
                    <td className="p-3 font-semibold">{c.name}</td>
                    <td className="p-3 text-slate-600">{c.phone ?? '—'}</td>
                    <td className="p-3 text-right tabular-nums">{c.ticketsRaised}</td>
                    <td className="p-3 text-right tabular-nums text-emerald-700">{c.ticketsSolved}</td>
                    <td className="p-3 text-right tabular-nums text-amber-700">{c.ticketsOpen}</td>
                    <td className="p-3 text-right text-slate-600">{formatDay(c.lastTicketAt)}</td>
                  </tr>
                ))}
                {customers.isError && <tr><td colSpan={6} className="p-4 text-red-700">{(customers.error as Error).message}</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}

export default function Page() {
  return (
    <ClientOnly fallback={<div className="p-6"><div className="h-64 animate-pulse rounded-2xl bg-slate-200" /></div>}>
      <Reports />
    </ClientOnly>
  );
}
