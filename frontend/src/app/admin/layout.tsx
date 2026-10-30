'use client';

import { Suspense, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { BarChart3, Boxes, Check, Copy, ExternalLink, FileText, KeyRound, LayoutGrid, LogOut, Menu, Receipt, UsersRound, X, type LucideIcon } from 'lucide-react';
import { session } from '@/lib/api';
import { Avatar } from '@/components/ui/Avatar';
import { ChangePasswordSheet } from '@/components/ui/ChangePasswordSheet';
import { Logo } from '@/components/ui/Logo';

type Role = 'ADMIN' | 'DISPATCHER';
// Who sees which window. The API enforces the same rules on every request.
const NAV: { href: string; label: string; Icon: LucideIcon; roles: Role[] }[] = [
  { href: '/admin/dispatch', label: 'Dispatch board', Icon: LayoutGrid, roles: ['ADMIN', 'DISPATCHER'] },
  { href: '/admin/quotations', label: 'Quotations', Icon: FileText, roles: ['ADMIN', 'DISPATCHER'] },
  { href: '/admin/invoices', label: 'Invoices', Icon: Receipt, roles: ['ADMIN'] },
  { href: '/admin/reports', label: 'Reports', Icon: BarChart3, roles: ['ADMIN', 'DISPATCHER'] },
  { href: '/admin/inventory', label: 'Inventory', Icon: Boxes, roles: ['ADMIN', 'DISPATCHER'] },
  { href: '/admin/employees', label: 'Employees', Icon: UsersRound, roles: ['ADMIN'] },
];

const subscribe = () => () => undefined;
const getRole = () => session.role();

/** UI guard only (the API checks the role on every request). Children always render so pages stay part of the static shell. */
function Guard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const role = useSyncExternalStore(subscribe, getRole, () => 'ADMIN'); // server snapshot: assume allowed, the browser corrects it
  useEffect(() => {
    if (role === 'TECHNICIAN') router.replace('/');
    else if (role !== 'ADMIN' && role !== 'DISPATCHER') router.replace('/login');
  }, [role, router]);
  return <>{children}</>;
}

/** Reads the current URL, so it sits in its own Suspense boundary and the rest of the page stays static. */
function NavLinks({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {NAV.filter((n) => n.roles.includes(role)).map(({ href, label, Icon }) => {
        const active = path.startsWith(href);
        return (
          <Link key={href} href={href} onClick={onNavigate} aria-current={active ? 'page' : undefined}
            className={`flex min-h-11 items-center gap-3 rounded-xl px-3.5 text-sm font-semibold ${active ? 'bg-white text-navy shadow-sm' : 'text-white/80 hover:bg-white/10'}`}>
            <Icon className="h-5 w-5" /> {label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Menu content shared by the desktop sidebar and the mobile drawer. */
function MenuContent({ role, onNavigate, onChangePassword }: { role: Role; onNavigate?: () => void; onChangePassword: () => void }) {
  const router = useRouter();
  const name = useSyncExternalStore(subscribe, () => session.name() ?? '', () => '');
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    await navigator.clipboard.writeText(`${window.location.origin}/request`).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  const item = 'flex min-h-11 w-full items-center gap-3 rounded-xl px-3.5 text-left text-sm font-semibold text-white/80 hover:bg-white/10';

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-3 pb-5 pt-2">
        <span className="rounded-xl bg-white/10 p-1.5"><Logo size={32} tone="light" /></span>
        <div className="leading-tight"><div className="font-bold">Bhawani FSM</div><div className="text-xs text-white/70">Office</div></div>
      </div>
      <Suspense fallback={null}><NavLinks role={role} onNavigate={onNavigate} /></Suspense>
      <div className="mt-auto space-y-1 pt-6">
        <button onClick={copyLink} className={item}>{copied ? <Check className="h-5 w-5 text-emerald-300" /> : <Copy className="h-5 w-5" />} {copied ? 'Link copied' : 'Copy customer form link'}</button>
        <a href="/request" target="_blank" rel="noopener noreferrer" className={item}><ExternalLink className="h-5 w-5" /> Open customer form</a>
        <div className="my-2 flex items-center gap-3 rounded-xl bg-white/10 p-3">
          <Avatar name={name} size={36} tone="light" />
          <div className="min-w-0 leading-tight"><div className="truncate text-sm font-semibold">{name || 'Admin'}</div><div className="text-xs text-white/70">{role === 'DISPATCHER' ? 'Dispatcher' : 'Administrator'}</div></div>
        </div>
        <button onClick={() => { onNavigate?.(); onChangePassword(); }} className={item}><KeyRound className="h-5 w-5" /> Change password</button>
        <button onClick={() => { session.clear(); router.replace('/login'); }} className={item}><LogOut className="h-5 w-5" /> Sign out</button>
      </div>
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const role = useSyncExternalStore(subscribe, getRole, () => 'ADMIN') as Role;
  const [open, setOpen] = useState(false);
  const [changing, setChanging] = useState(false);

  return (
    <div className="min-h-dvh bg-canvas text-ink print:bg-white">
      {/* Desktop: fixed sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 bg-navy p-4 text-white print:hidden md:block"><MenuContent role={role} onChangePassword={() => setChanging(true)} /></aside>

      {/* Phone / tablet: app bar + drawer */}
      <header className="sticky top-0 z-30 flex items-center gap-2 bg-navy px-2 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] text-white print:hidden md:hidden">
        <button onClick={() => setOpen(true)} aria-label="Open menu" className="flex h-11 w-11 items-center justify-center rounded-full active:bg-white/15"><Menu className="h-6 w-6" /></button>
        <Logo size={28} tone="light" /><span className="font-bold">Bhawani FSM</span>
      </header>
      <div className={`fixed inset-0 z-50 print:hidden md:hidden ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open}>
        <button aria-label="Close menu" tabIndex={open ? 0 : -1} onClick={() => setOpen(false)} className={`absolute inset-0 bg-navy/60 transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0'}`} />
        <aside role="dialog" aria-modal="true" aria-label="Menu" className={`absolute inset-y-0 left-0 w-72 max-w-[85%] bg-navy p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] text-white transition-transform duration-200 ${open ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}`}>
          <button onClick={() => setOpen(false)} aria-label="Close" className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full active:bg-white/10"><X className="h-5 w-5" /></button>
          <MenuContent role={role} onNavigate={() => setOpen(false)} onChangePassword={() => setChanging(true)} />
        </aside>
      </div>

      <div className="min-w-0 md:pl-64 print:pl-0">{children}</div>
      {changing && <ChangePasswordSheet onClose={() => setChanging(false)} />}
    </div>
  );
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <Guard><Shell>{children}</Shell></Guard>
  );
}
