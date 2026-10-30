'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useIdParam } from '@/lib/useIdParam';
import { ClientOnly } from '@/components/ClientOnly';
import { DocToolbar } from '@/components/admin/DocToolbar';
import { DocumentView } from '@/components/DocumentView';

function InvoiceDoc() {
  const id = useIdParam();
  const q = useQuery({ queryKey: ['admin', 'invoice', id], queryFn: () => api.getInvoice(id) });

  if (q.isLoading) return <div className="p-6"><div className="h-96 animate-pulse rounded-2xl bg-slate-200" /></div>;
  if (q.isError) return <p role="alert" className="m-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{(q.error as Error).message}</p>;
  const doc = q.data!;

  return (
    <main className="p-4 md:p-6 print:p-0">
      <DocToolbar backHref="/admin/invoices" backLabel="All invoices">
        {doc.ticket.id && <Link href={`/admin/tickets/view?id=${doc.ticket.id}`} className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold hover:bg-canvas">Open ticket #{doc.ticket.ticketNo}</Link>}
      </DocToolbar>
      <DocumentView doc={doc} />
    </main>
  );
}

export default function Page() {
  return (
    <ClientOnly fallback={<div className="p-6"><div className="h-96 animate-pulse rounded-2xl bg-slate-200" /></div>}>
      <InvoiceDoc />
    </ClientOnly>
  );
}
