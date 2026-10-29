'use client';

import { Suspense, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { BarChart3, Boxes, Check, Copy, FileText, LayoutGrid, LogOut, Receipt, UsersRound, Wrench, type LucideIcon } from 'lucide-react';
import { session } from '@/lib/api';

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
    else if (role !== 'ADMIN' && role !== 'DISPATCHER') router.replace('/login/');
  }, [role, router]);
  return <>{children}</>;
}

/** Reads the current URL, so it sits in its own Suspense boundary and the rest of the page stays static. */
function NavLinks({ role }: { role: Role }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-1 md:flex-col">
      {NAV.filter((n) => n.roles.includes(role)).map(({ href, label, Icon }) => (
        <Link key={href} href={href}
          className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold ${pathname.startsWith(href) ? 'bg-white text-slate-900' : 'text-slate-300 hover:bg-white/10'}`}>
          <Icon className="h-4 w-4" /> {label}
        </Link>
      ))}
    </nav>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const role = useSyncExternalStore(subscribe, getRole, () => 'ADMIN') as Role;
  const name = useSyncExternalStore(subscribe, () => session.name(), () => '');

  async function copyLink() {
    await navigator.clipboard.writeText(`${window.location.origin}/request`).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  function signOut() {
    session.clear();
    router.replace('/login/');
  }

  return (
    <div className="flex min-h-dvh flex-col bg-slate-50 text-slate-900 md:flex-row print:block print:bg-white">
      <aside className="flex shrink-0 flex-col gap-1 bg-slate-900 p-3 text-white md:w-60 md:p-4 print:hidden">
        <div className="flex items-center gap-2 px-2 pb-2 md:pb-5 md:pt-2">
          <div className="rounded-xl bg-white/10 p-2"><Wrench className="h-5 w-5" /></div>
          <div className="min-w-0 leading-tight">
            <div className="font-bold">Bhawani FSM</div>
            <div className="truncate text-xs text-slate-400">{name || 'Admin'} · {role === 'DISPATCHER' ? 'Dispatcher' : 'Administrator'}</div>
          </div>
        </div>
        <Suspense fallback={null}><NavLinks role={role} /></Suspense>
        <div className="mt-2 flex flex-wrap gap-1 md:mt-auto md:flex-col">
          <button onClick={copyLink} className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-300 hover:bg-white/10">
            {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />} {copied ? 'Link copied' : 'Copy customer form link'}
          </button>
          <a href="/request" target="_blank" rel="noopener noreferrer" className="rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-300 hover:bg-white/10">Open customer form ↗</a>
          <button onClick={signOut} className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-300 hover:bg-white/10">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <Guard><Shell>{children}</Shell></Guard>
  );
}
