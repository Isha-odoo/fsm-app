import type { DocumentData } from '@/lib/types';
import { amountInWords, formatDay, formatINR } from '@/lib/format';

const WARRANTY_TEXT: Record<string, string> = {
  IN_WARRANTY: 'In warranty', EXPIRED: 'Warranty expired', VOID: 'Warranty void', NO_RECORD: 'No warranty record', NOT_APPLICABLE: 'Machine not on file',
};
const DECISION_TEXT: Record<string, string> = { APPROVED: 'Approved by the customer', REJECTED: 'Declined by the customer' };

/** A4 printable quotation or tax invoice. Everything here comes from the server; nothing is calculated in the browser. */
export function DocumentView({ doc, children }: { doc: DocumentData; children?: React.ReactNode }) {
  const isInvoice = doc.kind === 'INVOICE';
  const s = doc.seller;
  const c = doc.customer;
  const interState = doc.igstPaise > 0;

  return (
    <article className="mx-auto w-full max-w-[210mm] rounded-2xl bg-white p-6 text-sm text-ink shadow-sm ring-1 ring-line print:max-w-none print:rounded-none print:p-0 print:shadow-none print:ring-0 sm:p-10">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-slate-900 pb-4">
        <div className="min-w-0">
          <h1 className="text-xl font-bold">{s.name}</h1>
          {s.address && <p className="mt-1 whitespace-pre-line text-slate-600">{s.address}</p>}
          <p className="mt-1 text-slate-600">
            {s.gstin && <>GSTIN: <span className="font-mono">{s.gstin}</span></>}
            {s.phone && <>{s.gstin ? ' · ' : ''}{s.phone}</>}
            {s.email && <> · {s.email}</>}
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold tracking-wide">{isInvoice ? 'TAX INVOICE' : 'QUOTATION'}</div>
          <div className="mt-1 font-mono text-base font-semibold">{doc.number}</div>
          <div className="text-slate-600">Date: {formatDay(doc.date)}</div>
          {!isInvoice && doc.validUntil && <div className="text-slate-600">Valid until: {formatDay(`${doc.validUntil}T00:00:00+05:30`)}</div>}
          {isInvoice && doc.quotationNo && <div className="text-slate-600">Against quotation {doc.quotationNo}</div>}
          <div className="text-slate-600">Service ticket #{doc.ticket.ticketNo}</div>
        </div>
      </header>

      <section className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Bill to</h2>
          <p className="mt-1 font-bold">{c.name}</p>
          {c.contactName && <p>Attn: {c.contactName}</p>}
          <p className="text-slate-600">{c.address}{c.city ? `, ${c.city}` : ''}</p>
          {c.phone && <p className="text-slate-600">Phone: {c.phone}</p>}
          {c.gstin && <p className="text-slate-600">GSTIN: <span className="font-mono">{c.gstin}</span></p>}
          <p className="text-slate-600">Place of supply: state code {doc.placeOfSupply}</p>
        </div>
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Service details</h2>
          <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
            {doc.ticket.product && <><dt className="text-muted">Product</dt><dd className="font-semibold">{doc.ticket.product}</dd></>}
            {doc.ticket.serial && <><dt className="text-muted">Serial no.</dt><dd className="font-mono">{doc.ticket.serial}</dd></>}
            {doc.ticket.service && <><dt className="text-muted">Service</dt><dd>{doc.ticket.service}</dd></>}
            {doc.warranty && <><dt className="text-muted">Warranty</dt><dd>{WARRANTY_TEXT[doc.warranty.status] ?? doc.warranty.status}{doc.warranty.endDate ? ` (until ${formatDay(`${doc.warranty.endDate}T00:00:00+05:30`)})` : ''}</dd></>}
            {doc.ticket.technician && <><dt className="text-muted">Technician</dt><dd>{doc.ticket.technician}</dd></>}
          </dl>
        </div>
      </section>

      {doc.ticket.solution && (
        <section className="mt-4 rounded-xl bg-canvas p-3 print:border print:border-slate-300 print:bg-white">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Work done / solution</h2>
          <p className="mt-1 whitespace-pre-line">{doc.ticket.solution}</p>
        </section>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-y border-slate-900 bg-slate-100 text-left text-xs uppercase tracking-wide print:bg-white">
              <th className="p-2">#</th><th className="p-2">Description</th><th className="p-2">HSN/SAC</th>
              <th className="p-2 text-right">Qty</th><th className="p-2 text-right">Rate</th><th className="p-2 text-right">GST</th><th className="p-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {doc.lines.length === 0 && <tr><td colSpan={7} className="p-3 text-muted">No charges: no parts or services were needed.</td></tr>}
            {doc.lines.map((l, i) => (
              <tr key={i} className="border-b border-line">
                <td className="p-2 align-top">{i + 1}</td>
                <td className="p-2 align-top">{l.description}{l.warrantyWaived && <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 print:border print:border-emerald-700 print:bg-white">Covered by warranty</span>}</td>
                <td className="p-2 align-top font-mono text-xs">{l.hsnSac ?? ''}</td>
                <td className="p-2 text-right align-top tabular-nums">{l.quantity}</td>
                <td className="p-2 text-right align-top tabular-nums">{formatINR(l.unitPricePaise)}</td>
                <td className="p-2 text-right align-top tabular-nums">{l.gstRateBp / 100}%</td>
                <td className="p-2 text-right align-top font-semibold tabular-nums">{formatINR(l.lineTotalPaise)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <p className="max-w-sm text-slate-600"><span className="font-semibold text-ink">Amount in words:</span> {amountInWords(doc.totalPaise)}</p>
        <table className="w-full max-w-xs text-sm">
          <tbody>
            <Row label="Subtotal" paise={doc.subtotalPaise} />
            {interState ? <Row label="IGST" paise={doc.igstPaise} /> : <><Row label="CGST" paise={doc.cgstPaise} /><Row label="SGST" paise={doc.sgstPaise} /></>}
            <tr className="border-t-2 border-slate-900 text-base font-bold"><td className="py-2">Total</td><td className="py-2 text-right tabular-nums">{formatINR(doc.totalPaise)}</td></tr>
          </tbody>
        </table>
      </section>

      {doc.decision && !isInvoice && (
        <p className="mt-4 rounded-xl bg-canvas p-3 text-slate-700 print:border print:border-slate-300 print:bg-white">
          <span className="font-semibold">{DECISION_TEXT[doc.status] ?? doc.status}</span> on {formatDay(doc.decision.at)}.{doc.decision.note ? ` ${doc.decision.note}` : ''}
        </p>
      )}

      <footer className="mt-10 flex items-end justify-between gap-6 text-xs text-muted">
        <p className="max-w-md">
          {isInvoice
            ? 'This is a computer-generated tax invoice. Thank you for your business.'
            : 'GST is included as shown. Prices are fixed for the validity period above. Parts covered by warranty are shown at no charge.'}
        </p>
        <div className="text-center"><div className="mb-1 h-10 w-44 border-b border-slate-400" />Authorised signatory</div>
      </footer>

      {children && <div className="mt-6 print:hidden">{children}</div>}
    </article>
  );
}

function Row({ label, paise }: { label: string; paise: number }) {
  return <tr><td className="py-1 text-slate-600">{label}</td><td className="py-1 text-right tabular-nums">{formatINR(paise)}</td></tr>;
}
