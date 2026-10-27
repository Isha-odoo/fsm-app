'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Loader2, Receipt, X } from 'lucide-react';
import { api } from '@/lib/api';
import { formatINR, formatWhen } from '@/lib/format';
import { WarrantyChip } from '@/components/StatusChip';

/** Admin invoicing for one SOLVED ticket. Totals always come from the server (preview), never from this screen. */
export function InvoiceModal({ ticketId, onClose }: { ticketId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const ticket = useQuery({ queryKey: ['admin', 'ticket', ticketId], queryFn: () => api.getTicket(ticketId) });
  const services = useQuery({ queryKey: ['catalog', 'SERVICE'], queryFn: () => api.getCatalog('SERVICE'), staleTime: 5 * 60_000 });

  const [extras, setExtras] = useState<Record<string, boolean>>({});
  const extraItems = useMemo(
    () => Object.keys(extras).filter((k) => extras[k]).sort().map((catalogItemId) => ({ catalogItemId, quantity: 1 })),
    [extras],
  );

  const preview = useQuery({
    queryKey: ['admin', 'invoice-preview', ticketId, extraItems.map((e) => e.catalogItemId).join(',')],
    queryFn: () => api.previewInvoice({ ticketId, extraItems }),
    enabled: ticket.isSuccess && !ticket.data.invoice,
  });

  const create = useMutation({
    mutationFn: () => api.createInvoice({ ticketId, extraItems }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin'] }),
  });

  const t = ticket.data;
  const done = create.data;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 md:items-center" role="dialog" aria-modal="true" aria-label="Create invoice">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold"><Receipt className="h-5 w-5" /> Create invoice{t ? ` · Ticket #${t.ticketNo}` : ''}</h2>
            {t && <p className="text-sm text-slate-600">{t.customerName} · {t.model ?? 'Product not specified'}{t.service ? ` · ${t.service}` : ''} {t.serialNumber && <span className="font-mono text-xs">({t.serialNumber})</span>}</p>}
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>

        {ticket.isLoading && <div className="mt-6 h-32 animate-pulse rounded-xl bg-slate-100" />}
        {ticket.isError && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{(ticket.error as Error).message}</p>}

        {done && (
          <div className="mt-6 space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
            <div className="font-mono text-xl font-bold">{done.invoice.invoiceNo}</div>
            <div className="text-slate-700">Total {formatINR(done.totalPaise)} (incl. GST)</div>
            <div className="flex flex-wrap justify-center gap-2">
              <Link href={`/admin/invoices/view?id=${done.invoice.id}`} className="rounded-xl bg-emerald-600 px-6 py-2.5 font-bold text-white hover:bg-emerald-700">Open &amp; print invoice</Link>
              <button onClick={onClose} className="rounded-xl border border-slate-300 bg-white px-6 py-2.5 font-semibold hover:bg-slate-50">Done</button>
            </div>
          </div>
        )}

        {t && !done && (
          <>
            {t.invoice && (
              <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">Already invoiced as <span className="font-mono font-semibold">{t.invoice.invoiceNo}</span> ({formatINR(t.invoice.totalPaise)}). <Link href={`/admin/invoices/view?id=${t.invoice.id}`} className="font-semibold underline">Open &amp; print</Link></p>
            )}

            <div className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-3 text-sm sm:grid-cols-2">
              <div><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Warranty at visit</div><div className="mt-1"><WarrantyChip status={t.warrantyStatus} /></div></div>
              {t.quotation && <div><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Customer quotation</div><div className="mt-1"><Link href={`/admin/quotations/view?id=${t.quotation.id}`} className="font-mono underline-offset-2 hover:underline">{t.quotation.quotationNo}</Link> · {formatINR(t.quotation.totalPaise)}</div></div>}
              <div><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Solved by</div><div className="mt-1">{t.technicianName ?? '—'} · {formatWhen(t.solvedAt)}</div></div>
              {t.workDone && <div className="sm:col-span-2"><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Solution</div><p className="mt-1">{t.workDone}</p></div>}
            </div>

            {!t.invoice && services.data && services.data.length > 0 && (
              <fieldset className="mt-4">
                <legend className="mb-1.5 text-sm font-semibold">Add charges</legend>
                <div className="space-y-1.5">
                  {services.data.map((c) => (
                    <label key={c.id} className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 text-sm has-[:checked]:border-slate-900">
                      <span className="flex items-center gap-2.5">
                        <input type="checkbox" checked={!!extras[c.id]} onChange={(e) => setExtras((x) => ({ ...x, [c.id]: e.target.checked }))} className="h-4 w-4" />
                        {c.name}
                        {!c.warrantyCovers && <span className="text-xs text-slate-500">(not covered by warranty)</span>}
                      </span>
                      <span className="tabular-nums text-slate-600">{formatINR(c.unitPricePaise ?? 0)}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            {!t.invoice && (
              <div className="mt-4">
                {preview.isLoading && <div className="h-28 animate-pulse rounded-xl bg-slate-100" />}
                {preview.isError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{(preview.error as Error).message}</p>}
                {preview.data && (
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                        <tr><th className="p-2.5">Item</th><th className="p-2.5 text-right">Qty</th><th className="p-2.5 text-right">Rate</th><th className="p-2.5 text-right">GST</th><th className="p-2.5 text-right">Amount</th></tr>
                      </thead>
                      <tbody>
                        {preview.data.lines.length === 0 && <tr><td colSpan={5} className="p-3 text-slate-500">No parts were logged. Add a charge above or create a zero-value invoice.</td></tr>}
                        {preview.data.lines.map((l, i) => (
                          <tr key={i} className="border-t border-slate-100">
                            <td className="p-2.5">{l.description}{l.warrantyWaived && <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">Warranty</span>}</td>
                            <td className="p-2.5 text-right tabular-nums">{l.quantity}</td>
                            <td className="p-2.5 text-right tabular-nums">{formatINR(l.unitPricePaise)}</td>
                            <td className="p-2.5 text-right tabular-nums">{l.gstRateBp / 100}%</td>
                            <td className="p-2.5 text-right font-semibold tabular-nums">{formatINR(l.lineTotalPaise)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="border-t border-slate-200 text-sm">
                        <TotalRow label="Subtotal" paise={preview.data.subtotalPaise} />
                        {preview.data.igstPaise > 0
                          ? <TotalRow label="IGST" paise={preview.data.igstPaise} />
                          : <><TotalRow label="CGST" paise={preview.data.cgstPaise} /><TotalRow label="SGST" paise={preview.data.sgstPaise} /></>}
                        <TotalRow label="Total" paise={preview.data.totalPaise} bold />
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            )}

            {create.isError && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">{(create.error as Error).message}</p>}

            {!t.invoice && (
              <div className="mt-5 flex justify-end gap-2">
                <button onClick={onClose} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold hover:bg-slate-50">Cancel</button>
                <button onClick={() => create.mutate()} disabled={!preview.data || create.isPending}
                  className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
                  {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Generate invoice
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function TotalRow({ label, paise, bold }: { label: string; paise: number; bold?: boolean }) {
  return (
    <tr className={bold ? 'border-t border-slate-200 bg-slate-50 font-bold' : ''}>
      <td colSpan={4} className="p-2 pr-3 text-right text-slate-600">{label}</td>
      <td className="p-2 pr-2.5 text-right tabular-nums">{formatINR(paise)}</td>
    </tr>
  );
}
