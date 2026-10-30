'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ClipboardList, House, UserRound, type LucideIcon } from 'lucide-react';

export const TECH_NAV: { href: string; label: string; Icon: LucideIcon }[] = [
  { href: '/', label: 'Home', Icon: House },
  { href: '/tickets', label: 'Tickets', Icon: ClipboardList },
  { href: '/profile', label: 'Profile', Icon: UserRound },
];

/** Current path without a trailing slash (static export adds one). */
export const cleanPath = (p: string) => (p.length > 1 ? p.replace(/\/$/, '') : p);

/** Bottom navigation of the technician app. Only on the three main screens; ticket screens have their own action bar. */
export function BottomNav() {
  const path = cleanPath(usePathname());
  if (!TECH_NAV.some((n) => n.href === path)) return null;
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <ul className="grid grid-cols-3">
        {TECH_NAV.map(({ href, label, Icon }) => {
          const active = path === href;
          return (
            <li key={href}>
              <Link href={href} aria-current={active ? 'page' : undefined} className="flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-semibold">
                <span className={`flex h-8 w-14 items-center justify-center rounded-full transition-colors ${active ? 'bg-primary-soft text-primary' : 'text-muted'}`}>
                  <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 2} />
                </span>
                <span className={active ? 'text-primary' : 'text-muted'}>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
