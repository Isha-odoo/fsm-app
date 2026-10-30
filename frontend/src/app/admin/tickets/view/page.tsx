'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Check, FileText, Receipt } from 'lucide-react';
import { api, session } from '@/lib/api';
import { useIdParam } from '@/lib/useIdParam';
import { ClientOnly } from '@/components/ClientOnly';
import { AssignControl } from '@/components/admin/AssignControl';
import { InvoiceModal } from '@/components/admin/InvoiceModal';
import { QuoteStatusChip, TicketStatusChip, WarrantyChip } from '@/components/StatusChip';
import { PRIORITY_LABEL, formatINR, formatWhen, timeAgo } from '@/lib/format';
import type { ActivityEntry, Ticket } from '@/lib/types';

const STAGES = ['New', 'Assigned', 'On site', 'Solved', 'Invoiced'] as const;

function stageOf(t: Ticket): number {
  if (t.invoice) return 4;
  return { NEW: 0, ASSIGNED: 1, IN_PROGRESS: 2, SOLVED: 3, CANCELLED: -1 }[t.status];
}

function describe(a: ActivityEntry): string {
  const d = a.detail ?? {};
  switch (a.action) {
    case 'ticket.create_public': return 'Raised by the customer on the web form';
    case 'ticket.assign': return `Assigned to a technician${d.priority ? ` (${PRIORITY_LABEL[d.priority as 1 | 2 | 3]})` : ''}`;
    case 'ticket.cancel': return `Cancelled: ${String(d.reason ?? '')}`;
    case 'ticket.solve': return 'Marked solved by the technician';
    case 'quotation.create': return `Quotation created and shared${typeof d.totalPaise === 'number' ? ` (${d.totalPaise === 0 ? 'no charge' : formatINR(d.totalPaise)})` : ''}`;
    case 'quotation.decision': return `Quotation ${d.decision === 'APPROVED' ? 'approved' : 'declined'}${d.by && d.by !== 'staff' ? ` by ${String(d.by).replace('customer: ', '')}` : ''}${d.note ? `: ${String(d.note)}` : ''}`;
    case 'invoice.create': return `Invoice ${String(d.invoiceNo ?? '')} created`;
    default: return a.action;
  }
}

function Card({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-2"><h2 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h2>{right}</div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div><dt className="text-xs text-muted">{label}</dt><dd className="mt-0.5 font-medium">{children || <span className="text-slate-400">—</span>}</dd></div>;
}

function TicketForm() {
  const id = useIdParam();
  const [invoicing, setInvoicing] = useState(false);
  const ticket = useQuery({ queryKey: ['admin', 'ticket', id], queryFn: () => api.getTicket(id) });
  const techs = useQuery({ queryKey: ['admin', 'technicians'], queryFn: () => api.getTechnicianReport() });
  const isAdmin = session.role() === 'ADMIN';

  if (ticket.isLoading) return <div className="p-6"><div className="h-96 animate-pulse rounded-2xl bg-slate-200" /></div>;
  if (ticket.isError) return <p role="alert" className="m-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{(ticket.error as Error).message}</p>;
  const t = ticket.data!;
  const stage = stageOf(t);
  const parts = t.parts ?? [];

  return (
    <main className="space-y-4 p-4 md:p-6">
      <Link href="/admin/dispatch" className="flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-ink"><ArrowLeft className="h-4 w-4" /> Dispatch board</Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Ticket <span className="font-mono">#{t.ticketNo}</span></h1>
          <p className="text-sm text-slate-600">{t.customerName} · raised {timeAgo(t.createdAt)} ({formatWhen(t.createdAt)}) · {PRIORITY_LABEL[t.priority]} priority</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TicketStatusChip status={t.status} />
          {t.quotation && <Link href={`/admin/quotations/view?id=${t.quotation.id}`} className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-canvas"><FileText className="h-4 w-4" /> {t.quotation.quotationNo}</Link>}
          {t.invoice && <Link href={`/admin/invoices/view?id=${t.invoice.id}`} className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-canvas"><Receipt className="h-4 w-4" /> {t.invoice.invoiceNo}</Link>}
          {isAdmin && t.status === 'SOLVED' && !t.invoice && (
            <button onClick={() => setInvoicing(true)} className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white hover:bg-primary-dark"><Receipt className="h-4 w-4" /> Create invoice</button>
          )}
        </div>
      </header>

      {/* Odoo-style status bar */}
      {stage >= 0 ? (
        <ol className="flex flex-wrap gap-1 rounded-2xl border border-line bg-white p-2 text-sm font-semibold">
          {STAGES.map((s, i) => (
            <li key={s} className={`flex items-center gap-1.5 rounded-xl px-4 py-1.5 ${i === stage ? 'bg-primary text-white' : i < stage ? 'bg-emerald-50 text-emerald-800' : 'text-slate-400'}`}>
              {i < stage && <Check className="h-4 w-4" />} {s}
            </li>
          ))}
        </ol>
      ) : <p className="rounded-2xl bg-slate-100 p-3 text-sm font-semibold text-slate-600">This ticket was cancelled.</p>}

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Customer and machine">
            <dl className="grid gap-3 sm:grid-cols-2">
              <Field label="Customer">{t.customerName}</Field>
              <Field label="Contact">{[t.contactName, t.phone].filter(Boolean).join(' · ')}</Field>
              <Field label="Service address">{t.address}{t.city ? `, ${t.city}` : ''}</Field>
              <Field label="Product">{t.model}</Field>
              <Field label="Serial number">{t.serialNumber && <span className="font-mono">{t.serialNumber}{!t.serialRecognised && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 font-sans text-xs font-semibold text-amber-800">not recognised</span>}</span>}</Field>
              <Field label="Service requested">{t.service}</Field>
            </dl>
          </Card>

          <Card title="Problem reported">
            {t.issue && <span className="mb-2 inline-block rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold">{t.issue}</span>}
            <p className="whitespace-pre-line">{t.description ?? '—'}</p>
          </Card>

          <Card title="Visit" right={t.warrantyStatus && <WarrantyChip status={t.warrantyStatus} />}>
            <dl className="grid gap-3 sm:grid-cols-2">
              <Field label="Technician">{t.technicianName}</Field>
              <Field label="Assigned by">{t.assignedByName && `${t.assignedByName} · ${formatWhen(t.assignedAt)}`}</Field>
              <Field label="Checked in at site">{t.checkedInAt && formatWhen(t.checkedInAt)}</Field>
              <Field label="Solved">{t.completedAt && formatWhen(t.completedAt)}</Field>
              {t.warrantyEnd && <Field label="Warranty ends">{t.warrantyEnd}</Field>}
            </dl>
            {t.workDone && <div className="mt-3 rounded-xl bg-canvas p-3"><div className="text-xs font-semibold uppercase tracking-wide text-muted">Solution</div><p className="mt-1 whitespace-pre-line">{t.workDone}</p></div>}
            {(t.status === 'NEW' || t.status === 'ASSIGNED') && (
              <div className="mt-4 max-w-md border-t border-slate-100 pt-4"><AssignControl ticket={t} technicians={techs.data ?? []} /></div>
            )}
          </Card>

          {t.status === 'SOLVED' && (
            <Card title="Quoted items" right={t.quotation && <QuoteStatusChip status={t.quotation.status} />}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-muted"><tr><th className="pb-2">Item</th><th className="pb-2 text-right">Qty</th><th className="pb-2 text-right">Rate</th><th className="pb-2 text-right">Amount</th></tr></thead>
                  <tbody>
                    {parts.length === 0 && <tr><td colSpan={4} className="py-2 text-muted">No parts or services were used.</td></tr>}
                    {parts.map((p, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="py-2">{p.description}{p.warrantyWaived && <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">Warranty</span>}</td>
                        <td className="py-2 text-right tabular-nums">{p.quantity}</td>
                        <td className="py-2 text-right tabular-nums">{formatINR(p.unitPricePaise)}</td>
                        <td className="py-2 text-right font-semibold tabular-nums">{p.warrantyWaived ? formatINR(0) : formatINR(p.unitPricePaise * p.quantity)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-sm">
                <span className="text-slate-600">{t.quotation ? `Quotation total (with GST): ${t.quotation.totalPaise === 0 ? 'no charge' : formatINR(t.quotation.totalPaise)}` : 'Solved before quotations existed: no quotation was created. An invoice can still be made.'}</span>
                {t.invoice && <span className="font-semibold">Invoiced: {t.invoice.invoiceNo} · {formatINR(t.invoice.totalPaise)}</span>}
              </div>
            </Card>
          )}
        </div>

        <Card title="History">
          <ol className="relative space-y-4 border-l border-line pl-4">
            {(t.activity ?? []).length === 0 && <li className="text-sm text-muted">No recorded activity.</li>}
            {(t.activity ?? []).map((a, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-slate-400 ring-4 ring-white" />
                <p className="text-sm font-medium">{describe(a)}</p>
                <p className="text-xs text-muted">{a.actor ?? 'Customer'} · {formatWhen(a.at)}</p>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      {invoicing && <InvoiceModal ticketId={t.id} onClose={() => setInvoicing(false)} />}
    </main>
  );
}

export default function Page() {
  return (
    <ClientOnly fallback={<div className="p-6"><div className="h-96 animate-pulse rounded-2xl bg-slate-200" /></div>}>
      <TicketForm />
    </ClientOnly>
  );
}
