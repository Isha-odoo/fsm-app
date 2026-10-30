'use client';

import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, Eye, EyeOff, Loader2, X } from 'lucide-react';
import { api } from '@/lib/api';

const field = 'h-12 w-full rounded-xl border border-line bg-white px-3.5 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/15';

/** Change your own password. Works for every role: shown as a bottom sheet on phones and a dialog on larger screens. */
export function ChangePasswordSheet({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [show, setShow] = useState(false);

  const save = useMutation({ mutationFn: () => api.changePassword(current, next) });

  const tooShort = next.length > 0 && next.length < 10;
  const mismatch = again.length > 0 && again !== next;
  const canSave = current.length > 0 && next.length >= 10 && again === next && !save.isPending;
  const onSubmit = (e: FormEvent) => { e.preventDefault(); if (canSave) save.mutate(); };
  const type = show ? 'text' : 'password';

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Change password">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-navy/60" />
      <div className="relative w-full max-w-md rounded-t-3xl bg-white p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Change password</h2>
          <button onClick={onClose} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-full text-muted active:bg-canvas"><X className="h-5 w-5" /></button>
        </div>

        {save.isSuccess ? (
          <div className="py-4 text-center">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50"><CheckCircle2 className="h-10 w-10 text-emerald-600" /></span>
            <p className="mt-3 font-bold">Password changed</p>
            <p className="mt-1 text-sm text-muted">Use the new password the next time you sign in.</p>
            <button onClick={onClose} className="mt-5 min-h-12 w-full rounded-xl bg-primary font-semibold text-white active:bg-primary-dark">Done</button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3">
            <div>
              <label htmlFor="cur" className="mb-1.5 block text-sm font-semibold">Current password</label>
              <input id="cur" type={type} autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className={field} />
            </div>
            <div>
              <label htmlFor="new" className="mb-1.5 block text-sm font-semibold">New password</label>
              <input id="new" type={type} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className={field} />
              <p className={`mt-1 text-xs ${tooShort ? 'text-red-600' : 'text-muted'}`}>At least 10 characters.</p>
            </div>
            <div>
              <label htmlFor="again" className="mb-1.5 block text-sm font-semibold">Repeat new password</label>
              <input id="again" type={type} autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} className={field} />
              {mismatch && <p className="mt-1 text-xs text-red-600">The two passwords do not match.</p>}
            </div>
            <button type="button" onClick={() => setShow((s) => !s)} className="flex min-h-11 items-center gap-2 text-sm font-semibold text-primary">
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />} {show ? 'Hide passwords' : 'Show passwords'}
            </button>
            {save.isError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{(save.error as Error).message}</p>}
            <button type="submit" disabled={!canSave} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-white active:bg-primary-dark disabled:opacity-50">
              {save.isPending && <Loader2 className="h-5 w-5 animate-spin" />} Save new password
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
