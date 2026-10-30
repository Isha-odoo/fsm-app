'use client';

import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Inbox, Receipt, RefreshCw, Truck } from 'lucide-react';
import { api } from '@/lib/api';
import { ClientOnly } from '@/components/ClientOnly';
import { AdminTicketCard } from '@/components/admin/AdminTicketCard';
import { AssignControl } from '@/components/admin/AssignControl';
import { InvoiceModal } from '@/components/admin/InvoiceModal';
import type { Ticket } from '@/lib/types';

const urgentFirst = (a: Ticket, b: Ticket) => a.priority - b.priority || a.createdAt.localeCompare(b.createdAt);
const newestFirst = (a: Ticket, b: Ticket) => (b.solvedAt ?? b.createdAt).localeCompare(a.solvedAt ?? a.createdAt);

function Column({ title, hint, count, icon, children }: { title: string; hint: string; count: number; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="flex min-h-0 flex-col rounded-2xl bg-wash p-3">
      <header className="mb-3 flex items-center gap-2 px-1">
        <span className="text-muted">{icon}</span>
        <div className="min-w-0 flex-1"><h2 className="font-bold leading-tight">{title}</h2><p className="text-xs text-muted">{hint}</p></div>
        <span className="rounded-full bg-white px-2.5 py-0.5 text-sm font-bold tabular-nums shadow-sm">{count}</span>
      </header>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-muted">{children}</p>;
}

function Board() {
  const [invoiceFor, setInvoiceFor] = useState<string | null>(null);

  const tickets = useQuery({
    queryKey: ['admin', 'tickets'],
    queryFn: () => api.getTickets({ status: ['NEW', 'ASSIGNED', 'IN_PROGRESS', 'SOLVED'], uninvoiced: true }),
    refetchInterval: 30_000, // new customer tickets appear without a manual refresh
  });
  const technicians = useQuery({ queryKey: ['admin', 'technicians'], queryFn: () => api.getTechnicianReport(), refetchInterval: 30_000 });

  const all = tickets.data ?? [];
  const techs = technicians.data ?? [];
  const fresh = all.filter((t) => t.status === 'NEW').sort(urgentFirst);
  const inField = all.filter((t) => t.status === 'ASSIGNED' || t.status === 'IN_PROGRESS').sort(urgentFirst);
  const solved = all.filter((t) => t.status === 'SOLVED').sort(newestFirst);

  return (
    <main className="p-4 md:p-6">
      <header className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dispatch board</h1>
          <p className="text-sm text-slate-600">Assign new customer tickets, follow technicians in the field, then invoice solved tickets.</p>
        </div>
        <button onClick={() => { tickets.refetch(); technicians.refetch(); }} aria-label="Refresh" className="rounded-full border border-slate-300 bg-white p-2.5 hover:bg-canvas">
          <RefreshCw className={`h-5 w-5 ${tickets.isFetching ? 'animate-spin' : ''}`} />
        </button>
      </header>

      {tickets.isError && (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-semibold">Couldn&apos;t load tickets</p>
          <p className="mt-1">{(tickets.error as Error).message}</p>
          <button onClick={() => tickets.refetch()} className="mt-3 rounded-xl bg-red-600 px-4 py-2 font-semibold text-white">Try again</button>
        </div>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <Column title="New tickets" hint="Waiting for a technician" count={fresh.length} icon={<Inbox className="h-5 w-5" />}>
          {tickets.isLoading && <div className="h-40 animate-pulse rounded-2xl bg-slate-200" />}
          {!tickets.isLoading && fresh.length === 0 && <Empty>No unassigned tickets. Nice.</Empty>}
          {fresh.map((t) => <AdminTicketCard key={t.id} ticket={t}><AssignControl ticket={t} technicians={techs} /></AdminTicketCard>)}
        </Column>

        <Column title="With technicians" hint="Assigned or on site" count={inField.length} icon={<Truck className="h-5 w-5" />}>
          {tickets.isLoading && <div className="h-40 animate-pulse rounded-2xl bg-slate-200" />}
          {!tickets.isLoading && inField.length === 0 && <Empty>No tickets in the field.</Empty>}
          {inField.map((t) => (
            <AdminTicketCard key={t.id} ticket={t}>
              {t.status === 'ASSIGNED'
                ? <AssignControl ticket={t} technicians={techs} />
                : <p className="text-sm font-medium text-amber-800">{t.technicianName} is on site.</p>}
            </AdminTicketCard>
          ))}
        </Column>

        <Column title="Solved" hint="Ready to invoice" count={solved.length} icon={<Receipt className="h-5 w-5" />}>
          {tickets.isLoading && <div className="h-40 animate-pulse rounded-2xl bg-slate-200" />}
          {!tickets.isLoading && solved.length === 0 && <Empty>Nothing waiting to be invoiced.</Empty>}
          {solved.map((t) => (
            <AdminTicketCard key={t.id} ticket={t}>
              <button onClick={() => setInvoiceFor(t.id)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-bold text-white hover:bg-primary-dark">
                <Receipt className="h-4 w-4" /> Create invoice
              </button>
            </AdminTicketCard>
          ))}
        </Column>
      </div>

      {invoiceFor && <InvoiceModal ticketId={invoiceFor} onClose={() => setInvoiceFor(null)} />}
    </main>
  );
}

export default function Page() {
  return (
    <ClientOnly fallback={<div className="p-6"><div className="h-64 animate-pulse rounded-2xl bg-slate-200" /></div>}>
      <Board />
    </ClientOnly>
  );
}
