import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Bhawani FSM — Technician' };

/** Phone-width column; centred on desktop so you can preview it in a normal browser window. */
export default function TechLayout({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto min-h-dvh max-w-md bg-slate-50 text-slate-900 shadow-xl">{children}</div>;
}
