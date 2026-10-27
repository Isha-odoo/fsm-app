'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { PRIORITY_LABEL } from '@/lib/format';
import type { TechnicianStats, Ticket } from '@/lib/types';

const select = 'min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-2.5 py-2 text-sm outline-none focus:border-slate-900';

/** Technician picker + priority + Assign (or Reassign before the technician checks in). */
export function AssignControl({ ticket, technicians }: { ticket: Ticket; technicians: TechnicianStats[] }) {
  const qc = useQueryClient();
  const [techId, setTechId] = useState(ticket.technicianId ?? '');
  const [priority, setPriority] = useState<1 | 2 | 3>(ticket.priority);
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin'] });

  const assign = useMutation({
    mutationFn: () => api.assignTicket(ticket.id, { technicianId: techId, priority }),
    onSuccess: refresh,
  });
  const cancel = useMutation({
    mutationFn: (reason: string) => api.cancelTicket(ticket.id, reason),
    onSuccess: refresh,
  });

  const isNew = ticket.status === 'NEW';
  const unchanged = !isNew && techId === ticket.technicianId && priority === ticket.priority;
  const error = (assign.error ?? cancel.error) as Error | null;

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <select aria-label="Technician" value={techId} onChange={(e) => setTechId(e.target.value)} className={select}>
          <option value="">Choose technician…</option>
          {technicians.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.activeTickets} open</option>)}
        </select>
        <select aria-label="Priority" value={priority} onChange={(e) => setPriority(Number(e.target.value) as 1 | 2 | 3)} className="w-24 rounded-xl border border-slate-300 bg-white px-2 py-2 text-sm outline-none focus:border-slate-900">
          {([1, 2, 3] as const).map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
        </select>
      </div>
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => { const reason = window.prompt('Why are you cancelling this ticket? (e.g. duplicate, spam)'); if (reason && reason.trim().length >= 3) cancel.mutate(reason.trim()); }}
          disabled={cancel.isPending || assign.isPending}
          className="text-xs font-semibold text-slate-500 underline-offset-2 hover:text-red-700 hover:underline disabled:opacity-50"
        >
          Cancel ticket
        </button>
        <button onClick={() => assign.mutate()} disabled={!techId || unchanged || assign.isPending || cancel.isPending}
          className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-40">
          {assign.isPending && <Loader2 className="h-4 w-4 animate-spin" />} {isNew ? 'Assign' : 'Reassign'}
        </button>
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-2 text-xs text-red-800">{error.message}</p>}
    </div>
  );
}
