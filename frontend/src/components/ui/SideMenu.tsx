'use client';

import { useEffect, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LogOut, X } from 'lucide-react';
import { session } from '@/lib/api';
import { initials } from '@/lib/format';
import { Avatar } from './Avatar';
import { TECH_NAV, cleanPath } from './BottomNav';

const subscribe = () => () => undefined;

/** Slide-in menu for the technician app (opened from the menu button in the app bar). */
export function SideMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const path = cleanPath(usePathname());
  const router = useRouter();
  const name = useSyncExternalStore(subscribe, () => session.name() ?? '', () => '');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <div className={`fixed inset-0 z-50 ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open}>
      <button aria-label="Close menu" tabIndex={open ? 0 : -1} onClick={onClose}
        className={`absolute inset-0 bg-navy/60 transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0'}`} />
      <aside role="dialog" aria-modal="true" aria-label="Menu"
        className={`absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col bg-navy pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] text-white transition-transform duration-200 ${open ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}`}>
        <div className="flex items-center gap-3 p-5">
          <Avatar name={name} size={48} tone="light" />
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{name || 'Technician'}</div>
            <div className="text-sm text-white/70">Technician</div>
          </div>
          <button onClick={onClose} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-full active:bg-white/10"><X className="h-5 w-5" /></button>
        </div>
        <nav className="mt-2 flex-1 px-3">
          {TECH_NAV.map(({ href, label, Icon }) => (
            <Link key={href} href={href} onClick={onClose}
              className={`mb-1 flex min-h-12 items-center gap-3 rounded-xl px-4 text-base font-medium ${path === href ? 'bg-white/15' : 'active:bg-white/10'}`}>
              <Icon className="h-5 w-5" /> {label === 'Tickets' ? 'My Tickets' : label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-white/15 p-3">
          <button onClick={() => { session.clear(); onClose(); router.replace('/login'); }}
            className="flex min-h-12 w-full items-center gap-3 rounded-xl px-4 text-base font-medium active:bg-white/10">
            <LogOut className="h-5 w-5" /> Logout
          </button>
        </div>
      </aside>
    </div>
  );
}

export { initials };
