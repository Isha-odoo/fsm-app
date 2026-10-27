'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Wrench } from 'lucide-react';
import { api, session } from '@/lib/api';

const field = 'w-full rounded-2xl border border-slate-300 bg-white p-3 text-base outline-none focus:border-slate-900';

/** One sign-in for everybody. Technicians land on their own tickets, office staff on the admin dashboard. */
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { token, user } = await api.login(email.trim(), password);
      session.set(token, user);
      router.replace(user.role === 'TECHNICIAN' ? '/' : '/admin');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center p-6">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-white"><Wrench className="h-7 w-7" /></div>
        <h1 className="text-2xl font-bold">Bhawani Print &amp; Pack</h1>
        <p className="text-sm text-slate-500">Sign in with your employee account</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-semibold">Email</label>
          <input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
        </div>
        <div>
          <label htmlFor="password" className="mb-1.5 block text-sm font-semibold">Password</label>
          <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={field} />
        </div>
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        <button type="submit" disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 py-4 font-bold text-white active:bg-slate-800 disabled:opacity-60">
          {busy && <Loader2 className="h-5 w-5 animate-spin" />} Sign in
        </button>
      </form>
      <p className="mt-6 text-center text-xs text-slate-500">Forgot your password? Ask an administrator to reset it.</p>
    </main>
  );
}
