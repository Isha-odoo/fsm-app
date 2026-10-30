'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, ClipboardList, Hourglass, Inbox, Menu, RefreshCw, Wrench, type LucideIcon } from 'lucide-react';
import { api, session } from '@/lib/api';
import { ClientOnly } from '@/components/ClientOnly';
import { VisitCard } from '@/components/VisitCard';
import { Avatar } from '@/components/ui/Avatar';
import { SplashScreen } from '@/components/ui/SplashScreen';
import { useOpenMenu } from '@/components/ui/TechChrome';
import { EmptyState, ErrorState, IconTile, Skeleton, cardCls } from '@/components/ui/parts';
import { formatLongDate, greeting, todayIST } from '@/lib/format';

function StatCard({ href, label, value, Icon, tone }: { href: string; label: string; value: number | null; Icon: LucideIcon; tone: 'blue' | 'orange' | 'green' }) {
  return (
    <Link href={href} className={`${cardCls} flex flex-col items-center gap-1.5 px-2 py-3 text-center active:bg-canvas`}>
      <IconTile tone={tone} size={40}><Icon className="h-5 w-5" /></IconTile>
      <span className="text-xs font-medium text-muted">{label}</span>
      <span className="text-2xl font-bold leading-none tabular-nums">{value ?? '–'}</span>
    </Link>
  );
}

function Dashboard() {
  const openMenu = useOpenMenu();
  const date = todayIST();
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['visits', 'today', date],
    queryFn: () => api.getMyVisits(date),
  });

  const open = data?.filter((v) => v.status !== 'COMPLETED') ?? [];
  const inProgress = open.filter((v) => v.status === 'CHECKED_IN');
  const solved = data?.filter((v) => v.status === 'COMPLETED') ?? [];
  // The most useful next action: a visit already in progress, otherwise the most urgent open one (the API orders by priority).
  const next = inProgress[0] ?? open[0];
  const upcoming = open.filter((v) => v.id !== next?.id).slice(0, 4);
  const name = session.name() ?? '';

  return (
    <main className="pb-28">
      <header className="bg-navy pb-16 pt-[env(safe-area-inset-top)] text-white">
        <div className="flex items-center gap-1 px-2 pt-2">
          <button onClick={openMenu} aria-label="Open menu" className="flex h-11 w-11 items-center justify-center rounded-full active:bg-white/15"><Menu className="h-6 w-6" /></button>
          <div className="min-w-0 flex-1 px-2">
            <p className="text-xs text-white/70">{greeting()},</p>
            <h1 className="truncate text-lg font-semibold leading-tight">{name || 'Technician'}</h1>
            <p className="text-xs text-white/70">Technician · {formatLongDate(date)}</p>
          </div>
          <button onClick={() => refetch()} aria-label="Refresh" className="flex h-11 w-11 items-center justify-center rounded-full active:bg-white/15">
            <RefreshCw className={`h-5 w-5 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
          <Link href="/profile" aria-label="Profile" className="flex h-11 w-11 items-center justify-center"><Avatar name={name} size={36} tone="light" /></Link>
        </div>
      </header>

      <div className="-mt-12 grid grid-cols-3 gap-3 px-4">
        <StatCard href="/tickets?filter=open" label="Open" value={isLoading ? null : open.length} Icon={ClipboardList} tone="blue" />
        <StatCard href="/tickets?filter=progress" label="In progress" value={isLoading ? null : inProgress.length} Icon={Hourglass} tone="orange" />
        <StatCard href="/tickets?filter=solved" label="Solved today" value={isLoading ? null : solved.length} Icon={CheckCircle2} tone="green" />
      </div>

      <div className="space-y-6 px-4 pt-6">
        {isLoading && (
          <div className="space-y-3"><Skeleton className="h-36" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div>
        )}

        {isError && <ErrorState title="Couldn't load your tickets" message={(error as Error).message} onRetry={() => refetch()} />}

        {data && open.length === 0 && (
          <EmptyState icon={<Inbox className="h-6 w-6" />} title="No tickets assigned"
            message="You are all caught up. New assignments from the office will appear here."
            action={<Link href="/tickets" className="inline-flex min-h-11 items-center rounded-xl border border-line bg-white px-5 text-sm font-semibold">View all tickets</Link>} />
        )}

        {next && (
          <section>
            <h2 className="mb-2 flex items-center gap-2 text-base font-bold"><Wrench className="h-4 w-4 text-primary" /> {next.status === 'CHECKED_IN' ? 'Currently on site' : 'Next up'}</h2>
            <VisitCard visit={next} highlight />
          </section>
        )}

        {upcoming.length > 0 && (
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-base font-bold">Upcoming visits</h2>
              <Link href="/tickets" className="flex min-h-11 items-center text-sm font-semibold text-primary">View all</Link>
            </div>
            <div className="space-y-3">{upcoming.map((v) => <VisitCard key={v.id} visit={v} />)}</div>
          </section>
        )}
      </div>
    </main>
  );
}

export default function Page() {
  return (
    <ClientOnly fallback={<SplashScreen />}>
      <Dashboard />
    </ClientOnly>
  );
}
