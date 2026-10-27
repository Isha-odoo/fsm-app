'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api, session } from '@/lib/api';
import { ClientOnly } from '@/components/ClientOnly';
import { EmployeeModal, ROLE_LABEL } from '@/components/admin/EmployeeModal';
import { formatDay } from '@/lib/format';
import type { Employee } from '@/lib/types';

const th = 'p-3 text-xs font-semibold uppercase tracking-wide text-slate-500';
const ROLE_CHIP = { ADMIN: 'bg-violet-100 text-violet-800', DISPATCHER: 'bg-sky-100 text-sky-800', TECHNICIAN: 'bg-slate-100 text-slate-700' } as const;

function Employees() {
  const [editing, setEditing] = useState<Employee | 'new' | null>(null);
  const employees = useQuery({ queryKey: ['admin', 'employees'], queryFn: api.getEmployees, retry: false });
  const load = useQuery({ queryKey: ['admin', 'technicians'], queryFn: () => api.getTechnicianReport() });
  const myId = session.id();

  const openFor = (id: string) => load.data?.find((t) => t.id === id)?.activeTickets;

  return (
    <main className="space-y-4 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Employees</h1>
          <p className="text-sm text-slate-600">Every employee has their own login. Technicians only see tickets assigned to them; administrators see everything.</p>
        </div>
        <button onClick={() => setEditing('new')} className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800">
          <Plus className="h-4 w-4" /> New employee
        </button>
      </header>

      {employees.isError && (
        <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {(employees.error as Error).message === 'Not allowed' ? 'Only administrators can manage employees.' : (employees.error as Error).message}
        </p>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left"><tr><th className={th}>Name</th><th className={th}>Email</th><th className={th}>Phone</th><th className={th}>Role</th><th className={`${th} text-right`}>Open tickets</th><th className={th}>Status</th><th className={th}>Added</th><th className={th} /></tr></thead>
          <tbody>
            {employees.isLoading && <tr><td colSpan={8} className="p-4"><div className="h-8 animate-pulse rounded bg-slate-100" /></td></tr>}
            {employees.data?.map((e) => (
              <tr key={e.id} className={`border-t border-slate-100 ${e.isActive ? '' : 'text-slate-400'}`}>
                <td className="p-3 font-semibold">{e.name}{e.id === myId && <span className="ml-2 text-xs font-normal text-slate-500">(you)</span>}</td>
                <td className="p-3">{e.email}</td>
                <td className="p-3">{e.phone ?? '—'}</td>
                <td className="p-3"><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${ROLE_CHIP[e.role]}`}>{ROLE_LABEL[e.role]}</span></td>
                <td className="p-3 text-right tabular-nums">{e.role === 'TECHNICIAN' ? openFor(e.id) ?? '—' : '—'}</td>
                <td className="p-3">{e.isActive ? 'Active' : 'Disabled'}</td>
                <td className="p-3">{formatDay(e.createdAt)}</td>
                <td className="p-3 text-right"><button onClick={() => setEditing(e)} className="font-semibold text-slate-700 underline-offset-2 hover:underline">Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <EmployeeModal
          employee={editing === 'new' ? undefined : editing}
          isSelf={editing !== 'new' && editing.id === myId}
          onClose={() => setEditing(null)}
        />
      )}
    </main>
  );
}

export default function Page() {
  return (
    <ClientOnly fallback={<div className="p-6"><div className="h-64 animate-pulse rounded-2xl bg-slate-200" /></div>}>
      <Employees />
    </ClientOnly>
  );
}
