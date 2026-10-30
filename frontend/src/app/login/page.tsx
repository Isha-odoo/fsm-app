'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Loader2, Lock, Mail } from 'lucide-react';
import { api, session } from '@/lib/api';
import { Logo } from '@/components/ui/Logo';

/** One sign-in for everybody. Technicians land on their own tickets, office staff on the admin dashboard. */
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { token, user } = await api.login(email.trim(), password);
      session.set(token, { ...user, email: email.trim() });
      router.replace(user.role === 'TECHNICIAN' ? '/' : '/admin');
    } catch (err) {
      const msg = (err as Error).message;
      setError(/fetch|network|load failed/i.test(msg) ? 'Cannot reach the server. Check your internet connection and try again.' : msg);
    } finally {
      setBusy(false);
    }
  }

  const field = 'h-12 w-full rounded-xl border border-line bg-white pl-11 pr-4 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/15';

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col bg-white px-6 pb-8 pt-[max(2.5rem,env(safe-area-inset-top))] sm:my-6 sm:min-h-0 sm:rounded-3xl sm:shadow-card">
      <div className="mt-6 flex flex-col items-center text-center">
        <Logo size={72} />
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-navy">Bhawani FSM</h1>
        <p className="mt-1 text-sm text-muted">Field Service Management</p>
      </div>

      <div className="mt-10">
        <h2 className="text-2xl font-bold">Welcome Back</h2>
        <p className="mt-1 text-sm text-muted">Sign in to continue</p>
      </div>

      <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-semibold">Email</label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
            <input id="email" type="email" inputMode="email" autoComplete="username" autoCapitalize="none" required value={email}
              onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" className={field} />
          </div>
        </div>
        <div>
          <label htmlFor="password" className="mb-1.5 block text-sm font-semibold">Password</label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
            <input id="password" type={show ? 'text' : 'password'} autoComplete="current-password" required value={password}
              onChange={(e) => setPassword(e.target.value)} placeholder="Your password" className={`${field} pr-12`} />
            <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}
              className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-muted">
              {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}

        <button type="submit" disabled={busy || !email.trim() || !password}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-base font-semibold text-white shadow-sm active:bg-primary-dark disabled:opacity-50">
          {busy && <Loader2 className="h-5 w-5 animate-spin" />} {busy ? 'Signing in…' : 'Login'}
        </button>
      </form>

      <p className="mt-8 text-center text-sm text-muted">New to FSM? Contact your administrator.</p>
    </main>
  );
}
