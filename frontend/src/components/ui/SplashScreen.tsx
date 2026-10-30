import { Loader2 } from 'lucide-react';
import { Logo } from './Logo';

/** Shown only while the app starts up (before the first screen is ready). */
export function SplashScreen() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-navy px-8 text-center text-white">
      <Logo size={88} tone="light" />
      <h1 className="mt-5 text-3xl font-bold tracking-tight">Bhawani FSM</h1>
      <p className="mt-1 text-base text-white/80">Field Service Management</p>
      <p className="mt-10 text-sm font-medium text-white/70">Right Service. Right Time.</p>
      <div className="mt-8 flex items-center gap-2 text-xs text-white/70" role="status" aria-live="polite">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    </main>
  );
}
