'use client';

import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import type { Employee, Role } from '@/lib/types';
import { Field, Modal, inputCls } from './Modal';

export const ROLE_LABEL: Record<Role, string> = { ADMIN: 'Administrator', DISPATCHER: 'Dispatcher', TECHNICIAN: 'Technician' };
const ROLE_HELP: Record<Role, string> = {
  ADMIN: 'Sees and does everything: dispatch, invoices, inventory, employees, reports.',
  DISPATCHER: 'Assigns tickets and reads reports and inventory. No invoicing, no employee management.',
  TECHNICIAN: 'Signs in on the phone and only sees tickets assigned to them.',
};

function randomPassword(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint32Array(12));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('') + '#7';
}

/** Create an employee login, or edit one (name, phone, role, active, password reset). */
export function EmployeeModal({ employee, isSelf, onClose }: { employee?: Employee; isSelf?: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(employee?.name ?? '');
  const [email, setEmail] = useState(employee?.email ?? '');
  const [phone, setPhone] = useState(employee?.phone ?? '');
  const [role, setRole] = useState<Role>(employee?.role ?? 'TECHNICIAN');
  const [isActive, setIsActive] = useState(employee?.isActive ?? true);
  const [password, setPassword] = useState('');

  const save = useMutation({
    mutationFn: () =>
      employee
        ? api.updateEmployee(employee.id, { name: name.trim(), phone: phone.trim() || null, role, isActive, ...(password ? { password } : {}) })
        : api.createEmployee({ name: name.trim(), email: email.trim(), phone: phone.trim() || undefined, role, password }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin'] }); onClose(); },
  });

  const onSubmit = (e: FormEvent) => { e.preventDefault(); save.mutate(); };

  return (
    <Modal title={employee ? `Edit ${employee.name}` : 'New employee'} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3">
        <Field label="Full name"><input required minLength={2} value={name} onChange={(e) => setName(e.target.value)} className={inputCls} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Email (login)"><input required type="email" disabled={!!employee} value={email} onChange={(e) => setEmail(e.target.value)} className={`${inputCls} disabled:bg-slate-100`} /></Field>
          <Field label="Phone"><input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} /></Field>
        </div>
        <Field label="Role" hint={ROLE_HELP[role]}>
          <select value={role} disabled={isSelf} onChange={(e) => setRole(e.target.value as Role)} className={inputCls}>
            {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </Field>

        <Field label={employee ? 'Reset password (leave empty to keep)' : 'Initial password'} hint="At least 10 characters. Share it with the employee; they can be given a new one any time.">
          <div className="flex gap-2">
            <input type="text" autoComplete="off" required={!employee} minLength={employee && !password ? undefined : 10} value={password} onChange={(e) => setPassword(e.target.value)} className={`${inputCls} font-mono`} />
            <button type="button" onClick={() => setPassword(randomPassword())} className="shrink-0 rounded-xl border border-slate-300 px-3 text-sm font-semibold hover:bg-slate-50">Generate</button>
          </div>
        </Field>

        {employee && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isActive} disabled={isSelf} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4" />
            Active (can sign in)
          </label>
        )}

        {save.isError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{(save.error as Error).message}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold hover:bg-slate-50">Cancel</button>
          <button type="submit" disabled={save.isPending} className="flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50">
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />} {employee ? 'Save' : 'Create employee'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
