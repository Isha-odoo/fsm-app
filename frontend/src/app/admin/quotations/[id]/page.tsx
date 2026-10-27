'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, CheckCircle2, Link2, ThumbsDown } from 'lucide-react';
import { api } from '@/lib/api';
import { ClientOnly } from '@/components/ClientOnly';
import { DocToolbar } from '@/components/admin/DocToolbar';
import { DocumentView } from '@/components/DocumentView';
import { QuoteStatusChip } from '@/components/StatusChip';
import type { QuoteStatus } from '@/lib/types';

function QuotationDoc() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);
  const q = useQuery({ queryKey: ['admin', 'quotation', id], queryFn: () => api.getQuotation(id) });

  const link = useMutation({
    mutationFn: () => api.shareQuotation(id),
    onSuccess: async (r) => { await navigator.clipboard.writeText(r.url).catch(() => undefined); setCopied(true); setTimeout(() => setCopied(false), 2500); },
  });
  const decide = useMutation({
    mutationFn: (decision: 'APPROVED' | 'REJECTED') => api.decideQuotation(id, { decision, note: 'Recorded by office' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin'] }),
  });

  if (q.isLoading) return <div className="p-6"><div className="h-96 animate-pulse rounded-2xl bg-slate-200" /></div>;
  if (q.isError) return <p role="alert" className="m-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{(q.error as Error).message}</p>;
  const doc = q.data!;

  return (
    <main className="p-4 md:p-6 print:p-0">
      <DocToolbar backHref="/admin/quotations" backLabel="All quotations">
        <QuoteStatusChip status={doc.status as QuoteStatus} />
        {doc.ticket.id && <Link href={`/admin/tickets/${doc.ticket.id}`} className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold hover:bg-slate-50">Open ticket #{doc.ticket.ticketNo}</Link>}
        <button onClick={() => link.mutate()} disabled={link.isPending} className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60">
          {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Link2 className="h-4 w-4" />} {copied ? 'Customer link copied' : 'Copy customer link'}
        </button>
        {doc.status === 'SHARED' && (
          <>
            <button onClick={() => decide.mutate('APPROVED')} disabled={decide.isPending} className="flex items-center gap-2 rounded-xl border border-emerald-600 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"><CheckCircle2 className="h-4 w-4" /> Mark approved</button>
            <button onClick={() => decide.mutate('REJECTED')} disabled={decide.isPending} className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60"><ThumbsDown className="h-4 w-4" /> Mark declined</button>
          </>
        )}
      </DocToolbar>
      {(link.isError || decide.isError) && <p role="alert" className="mx-auto mb-3 max-w-[210mm] rounded-xl bg-red-50 p-3 text-sm text-red-800 print:hidden">{((link.error ?? decide.error) as Error).message}</p>}
      <DocumentView doc={doc} />
    </main>
  );
}

export default function Page() {
  return (
    <ClientOnly fallback={<div className="p-6"><div className="h-96 animate-pulse rounded-2xl bg-slate-200" /></div>}>
      <QuotationDoc />
    </ClientOnly>
  );
}
