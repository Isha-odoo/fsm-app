'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Loader2, Printer, ThumbsDown } from 'lucide-react';
import { api } from '@/lib/api';
import { useIdParam } from '@/lib/useIdParam';
import { ClientOnly } from '@/components/ClientOnly';
import { DocumentView } from '@/components/DocumentView';

function Quotation() {
  const token = useIdParam('t');
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['public-quotation', token], queryFn: () => api.getPublicQuotation(token), retry: false });
  const [name, setName] = useState('');
  const [note, setNote] = useState('');

  const decide = useMutation({
    mutationFn: (decision: 'APPROVED' | 'REJECTED') => api.decidePublicQuotation(token, { decision, name: name.trim(), note: note.trim() || undefined }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['public-quotation', token] }),
  });

  if (q.isLoading) return <div className="mx-auto max-w-3xl p-4"><div className="h-96 animate-pulse rounded-2xl bg-slate-200" /></div>;
  if (q.isError) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 p-6 text-center">
        <h1 className="text-xl font-bold">Quotation not available</h1>
        <p className="text-sm text-slate-600">{(q.error as Error).message}</p>
      </main>
    );
  }
  const doc = q.data!;

  return (
    <main className="px-3 py-6 sm:px-6">
      <div className="mx-auto mb-4 flex max-w-[210mm] justify-end print:hidden">
        <button onClick={() => window.print()} className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800">
          <Printer className="h-4 w-4" /> Print / Save as PDF
        </button>
      </div>

      <DocumentView doc={doc}>
        {doc.canDecide && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <h2 className="font-bold">Your answer</h2>
            <p className="mt-1 text-sm text-slate-600">Approve this quotation so we can proceed, or let us know if you do not accept it.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" aria-label="Your name" maxLength={120}
                className="rounded-xl border border-slate-300 bg-white p-2.5 text-sm outline-none focus:border-slate-900" />
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" aria-label="Note" maxLength={300}
                className="rounded-xl border border-slate-300 bg-white p-2.5 text-sm outline-none focus:border-slate-900" />
            </div>
            {decide.isError && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">{(decide.error as Error).message}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => decide.mutate('APPROVED')} disabled={name.trim().length < 2 || decide.isPending}
                className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
                {decide.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Approve
              </button>
              <button onClick={() => decide.mutate('REJECTED')} disabled={name.trim().length < 2 || decide.isPending}
                className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold hover:bg-slate-100 disabled:opacity-50">
                <ThumbsDown className="h-4 w-4" /> Decline
              </button>
            </div>
          </div>
        )}
      </DocumentView>
    </main>
  );
}

export default function Page() {
  return (
    <ClientOnly fallback={<div className="mx-auto max-w-3xl p-4"><div className="h-96 animate-pulse rounded-2xl bg-slate-200" /></div>}>
      <Quotation />
    </ClientOnly>
  );
}
