import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

export const cardCls = 'rounded-2xl border border-line bg-white shadow-card';

const TONES = {
  blue: 'bg-primary-soft text-primary',
  green: 'bg-emerald-50 text-emerald-600',
  orange: 'bg-orange-50 text-orange-600',
  red: 'bg-red-50 text-red-600',
  slate: 'bg-slate-100 text-slate-600',
} as const;

/** Rounded square with an icon, used as the visual anchor of cards and rows. */
export function IconTile({ children, tone = 'blue', size = 44 }: { children: ReactNode; tone?: keyof typeof TONES; size?: number }) {
  return <span style={{ width: size, height: size }} className={`flex shrink-0 items-center justify-center rounded-xl ${TONES[tone]}`}>{children}</span>;
}

/** Titled white card. */
export function Section({ title, icon, right, children, className = '' }: { title: string; icon?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`${cardCls} p-4 ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold text-ink">{icon}{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-wash ${className}`} aria-hidden />;
}

/** Explains what to do next when a list is empty. */
export function EmptyState({ icon, title, message, action }: { icon: ReactNode; title: string; message: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-line bg-white px-6 py-10 text-center">
      <IconTile tone="blue" size={56}>{icon}</IconTile>
      <h3 className="mt-4 text-base font-bold">{title}</h3>
      <p className="mt-1 max-w-xs text-sm text-muted">{message}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Actionable error: says what failed and offers a retry. */
export function ErrorState({ title, message, onRetry }: { title: string; message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4">
      <div className="flex items-center gap-2 font-bold text-red-800"><AlertTriangle className="h-5 w-5" /> {title}</div>
      <p className="mt-1 text-sm text-red-800">{message}</p>
      {onRetry && <button onClick={onRetry} className="mt-3 min-h-11 rounded-xl bg-red-600 px-5 text-sm font-semibold text-white active:bg-red-700">Try again</button>}
    </div>
  );
}

/** Primary / secondary buttons share one size and radius. */
export const btnPrimary = 'flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-base font-semibold text-white shadow-sm active:bg-primary-dark disabled:opacity-50';
export const btnSecondary = 'flex min-h-12 items-center justify-center gap-2 rounded-xl border border-line bg-white px-4 text-sm font-semibold text-ink active:bg-canvas disabled:opacity-50';
