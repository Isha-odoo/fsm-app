'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarCheck, LogOut, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { api, session } from "@/lib/api";
import { ClientOnly } from '@/components/ClientOnly';
import { formatLongDate, todayIST } from '@/lib/format';
import { VisitCard } from '@/components/VisitCard';

function Dashboard() {
  const router = useRouter();
  const date = todayIST();
  const signedIn = typeof window !== 'undefined' && !!window.localStorage.getItem('fsm_token');
  useEffect(() => { if (!signedIn) router.replace('/login/'); }, [signedIn, router]);
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['visits', 'today', date],
    queryFn: () => api.getMyVisits(date),
    enabled: signedIn,
  });

  const open = data?.filter((v) => v.status !== 'COMPLETED').length ?? 0;
  const onSite = data?.filter((v) => v.status === 'CHECKED_IN').length ?? 0;
  const solved = data?.filter((v) => v.status === 'COMPLETED').length ?? 0;
  const next = data?.find((v) => v.status === 'CHECKED_IN') ?? data?.find((v) => v.status === 'SCHEDULED');

  return (
    <main className="pb-10">
      <header className="bg-slate-900 px-5 pb-6 pt-8 text-white">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-slate-300">{formatLongDate(date)}<span className="ml-2 text-slate-400">· {session.name()}</span></p>
            <h1 className="mt-1 text-2xl font-bold">My tickets</h1>
          </div>
          <div className="flex gap-2">
            <button onClick={() => refetch()} aria-label="Refresh" className="rounded-full bg-white/10 p-2.5 active:bg-white/20">
              <RefreshCw className={`h-5 w-5 ${isFetching ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={() => { session.clear(); router.replace('/login/'); }} aria-label="Sign out" className="rounded-full bg-white/10 p-2.5 active:bg-white/20">
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-3 text-center">
          <Stat label="Open" value={open} />
          <Stat label="On site" value={onSite} />
          <Stat label="Solved today" value={solved} />
        </div>
      </header>

      <section className="space-y-3 px-4 pt-4">
        {next && !isLoading && (
          <p className="flex items-center gap-2 text-sm font-medium text-slate-600">
            <CalendarCheck className="h-4 w-4" />
            {next.status === 'CHECKED_IN' ? 'Currently at' : 'Up next:'} <span className="font-semibold text-slate-900">{next.customerName}</span>
          </p>
        )}

        {isLoading && [0, 1, 2].map((i) => <div key={i} className="h-32 animate-pulse rounded-2xl bg-slate-200" />)}

        {isError && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <p className="font-semibold">Couldn&apos;t load your tickets</p>
            <p className="mt-1">{(error as Error).message}</p>
            <button onClick={() => refetch()} className="mt-3 rounded-xl bg-red-600 px-4 py-2 font-semibold text-white">Try again</button>
          </div>
        )}

        {data && data.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-slate-500">
            No tickets assigned to you right now.
          </div>
        )}

        {data?.map((v) => <VisitCard key={v.id} visit={v} />)}
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-white/10 py-3">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-slate-300">{label}</div>
    </div>
  );
}


export default function Page() {
  return (
    <ClientOnly fallback={<div className="p-4"><div className="h-40 animate-pulse rounded-2xl bg-slate-200" /></div>}>
      <Dashboard />
    </ClientOnly>
  );
}
