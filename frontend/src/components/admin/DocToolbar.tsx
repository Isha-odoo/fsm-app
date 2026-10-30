'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, Printer } from 'lucide-react';

/** Buttons above a printable document. Hidden when printing. */
export function DocToolbar({ backHref, backLabel, children }: { backHref?: string; backLabel?: string; children?: ReactNode }) {
  return (
    <div className="mx-auto mb-4 flex w-full max-w-[210mm] flex-wrap items-center justify-between gap-2 print:hidden">
      {backHref ? <Link href={backHref} className="flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-ink"><ArrowLeft className="h-4 w-4" /> {backLabel ?? 'Back'}</Link> : <span />}
      <div className="flex flex-wrap items-center gap-2">
        {children}
        <button onClick={() => window.print()} className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white hover:bg-primary-dark">
          <Printer className="h-4 w-4" /> Print / Save as PDF
        </button>
      </div>
    </div>
  );
}
