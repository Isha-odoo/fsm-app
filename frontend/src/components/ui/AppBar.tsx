'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Menu } from 'lucide-react';
import { useOpenMenu } from './TechChrome';

/**
 * Navy app bar. `back` is an href, or `true` to go back in history (falls back to Home).
 * `menu` shows the menu button that opens the side menu.
 */
export function AppBar({ title, subtitle, back, menu, right }: { title: string; subtitle?: string; back?: string | true; menu?: boolean; right?: ReactNode }) {
  const router = useRouter();
  const openMenu = useOpenMenu();
  const btn = 'flex h-11 w-11 shrink-0 items-center justify-center rounded-full active:bg-white/15';
  return (
    <header className="sticky top-0 z-20 bg-navy pt-[env(safe-area-inset-top)] text-white">
      <div className="flex h-14 items-center gap-1 px-2">
        {back === true && (
          <button aria-label="Back" className={btn} onClick={() => (window.history.length > 1 ? router.back() : router.push('/'))}><ArrowLeft className="h-5 w-5" /></button>
        )}
        {typeof back === 'string' && <Link aria-label="Back" href={back} className={btn}><ArrowLeft className="h-5 w-5" /></Link>}
        {menu && <button aria-label="Open menu" className={btn} onClick={openMenu}><Menu className="h-6 w-6" /></button>}
        <div className="min-w-0 flex-1 px-2">
          <h1 className="truncate text-lg font-semibold leading-tight">{title}</h1>
          {subtitle && <p className="truncate text-xs text-white/70">{subtitle}</p>}
        </div>
        {right}
      </div>
    </header>
  );
}
