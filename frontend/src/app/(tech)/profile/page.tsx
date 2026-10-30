'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useSyncExternalStore } from 'react';
import { ChevronRight, ClipboardList, KeyRound, LogOut, Mail, ShieldCheck } from 'lucide-react';
import { session } from '@/lib/api';
import { ClientOnly } from '@/components/ClientOnly';
import { AppBar } from '@/components/ui/AppBar';
import { ChangePasswordSheet } from '@/components/ui/ChangePasswordSheet';
import { Avatar } from '@/components/ui/Avatar';
import { IconTile, Section, Skeleton, cardCls } from '@/components/ui/parts';

const subscribe = () => () => undefined;
const ROLE: Record<string, string> = { TECHNICIAN: 'Technician', DISPATCHER: 'Dispatcher', ADMIN: 'Administrator' };

function Profile() {
  const router = useRouter();
  const name = useSyncExternalStore(subscribe, () => session.name() ?? '', () => '');
  const email = useSyncExternalStore(subscribe, () => session.email() ?? '', () => '');
  const role = useSyncExternalStore(subscribe, () => session.role() ?? '', () => '');
  const [changing, setChanging] = useState(false);

  return (
    <main className="pb-28">
      <AppBar title="Profile" menu />
      <div className="space-y-4 p-4">
        <div className={`${cardCls} flex items-center gap-4 p-5`}>
          <Avatar name={name} size={64} />
          <div className="min-w-0">
            <h2 className="truncate text-xl font-bold">{name || 'Technician'}</h2>
            <p className="text-sm text-muted">{ROLE[role] ?? 'Technician'}</p>
          </div>
        </div>

        <Section title="Account">
          <ul className="divide-y divide-line">
            {email && <li className="flex items-center gap-3 py-3"><IconTile tone="slate" size={40}><Mail className="h-5 w-5" /></IconTile><div className="min-w-0"><div className="text-xs text-muted">Sign-in email</div><div className="truncate font-medium">{email}</div></div></li>}
            <li className="flex items-center gap-3 py-3"><IconTile tone="slate" size={40}><ShieldCheck className="h-5 w-5" /></IconTile><div><div className="text-xs text-muted">Role</div><div className="font-medium">{ROLE[role] ?? '—'}</div></div></li>
          </ul>
        </Section>

        <div className={`${cardCls} overflow-hidden`}>
          <Link href="/tickets" className="flex min-h-14 items-center gap-3 px-4 active:bg-canvas">
            <IconTile tone="blue" size={40}><ClipboardList className="h-5 w-5" /></IconTile>
            <span className="flex-1 font-medium">My Tickets</span><ChevronRight className="h-5 w-5 text-muted" />
          </Link>
          <button onClick={() => setChanging(true)} className="flex min-h-14 w-full items-center gap-3 border-t border-line px-4 text-left active:bg-canvas">
            <IconTile tone="blue" size={40}><KeyRound className="h-5 w-5" /></IconTile>
            <span className="flex-1 font-medium">Change password</span><ChevronRight className="h-5 w-5 text-muted" />
          </button>
        </div>

        <button onClick={() => { session.clear(); router.replace('/login'); }}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-white text-base font-semibold text-red-600 active:bg-red-50">
          <LogOut className="h-5 w-5" /> Logout
        </button>
        <p className="text-center text-xs text-muted">Forgot your password? Ask your administrator to reset it.</p>
        {changing && <ChangePasswordSheet onClose={() => setChanging(false)} />}
      </div>
    </main>
  );
}

export default function Page() {
  return (
    <ClientOnly fallback={<div className="space-y-3 p-4"><Skeleton className="h-24" /><Skeleton className="h-32" /></div>}>
      <Profile />
    </ClientOnly>
  );
}
