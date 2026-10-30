'use client';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList, Search, SearchX, X } from 'lucide-react';
import { api } from '@/lib/api';
import { ClientOnly } from '@/components/ClientOnly';
import { VisitCard } from '@/components/VisitCard';
import { AppBar } from '@/components/ui/AppBar';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/parts';
import { todayIST } from '@/lib/format';
import type { Visit } from '@/lib/types';

type Filter = 'all' | 'open' | 'progress' | 'solved';
const FILTERS: { key: Filter; label: string; match: (v: Visit) => boolean }[] = [
  { key: 'all', label: 'All', match: () => true },
  { key: 'open', label: 'Open', match: (v) => v.status === 'SCHEDULED' },
  { key: 'progress', label: 'In progress', match: (v) => v.status === 'CHECKED_IN' },
  { key: 'solved', label: 'Solved', match: (v) => v.status === 'COMPLETED' },
];

function TicketList() {
  const params = useSearchParams();
  const initial = (params.get('filter') as Filter | null) ?? 'all';
  const [filter, setFilter] = useState<Filter>(FILTERS.some((f) => f.key === initial) ? initial : 'all');
  const [q, setQ] = useState('');

  const date = todayIST();
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['visits', 'today', date], queryFn: () => api.getMyVisits(date) });
  const all = useMemo(() => data ?? [], [data]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const f = FILTERS.find((x) => x.key === filter)!;
    return all.filter(f.match).filter((v) => !needle
      || String(v.jobNo) === needle.replace('#', '')
      || [v.customerName, v.serialNumber, v.assetModel, v.service, v.address, v.city].some((s) => s?.toLowerCase().includes(needle)));
  }, [all, filter, q]);

  return (
    <main className="pb-28">
      <AppBar title="My Tickets" subtitle={data ? `${all.length} ticket${all.length === 1 ? '' : 's'}` : undefined} menu />

      <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-10 -mt-px space-y-3 bg-canvas px-4 pb-3 pt-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tickets…" aria-label="Search tickets"
            className="h-12 w-full rounded-xl border border-line bg-white pl-11 pr-11 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
          {q && <button onClick={() => setQ('')} aria-label="Clear search" className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-muted"><X className="h-4 w-4" /></button>}
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="tablist" aria-label="Filter by status">
          {FILTERS.map((f) => {
            const n = all.filter(f.match).length;
            const active = filter === f.key;
            return (
              <button key={f.key} role="tab" aria-selected={active} onClick={() => setFilter(f.key)}
                className={`min-h-10 shrink-0 rounded-full border px-4 text-sm font-semibold ${active ? 'border-primary bg-primary text-white' : 'border-line bg-white text-muted active:bg-canvas'}`}>
                {f.label} ({data ? n : '–'})
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-3 px-4 pt-1">
        {isLoading && [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}
        {isError && <ErrorState title="Couldn't load your tickets" message={(error as Error).message} onRetry={() => refetch()} />}
        {data && all.length === 0 && (
          <EmptyState icon={<ClipboardList className="h-6 w-6" />} title="No tickets assigned" message="New assignments from the office will appear here." />
        )}
        {data && all.length > 0 && shown.length === 0 && (
          <EmptyState icon={<SearchX className="h-6 w-6" />} title="No matching tickets" message="Try a different search or switch the status filter."
            action={<button onClick={() => { setQ(''); setFilter('all'); }} className="min-h-11 rounded-xl border border-line bg-white px-5 text-sm font-semibold">Clear filters</button>} />
        )}
        {shown.map((v) => <VisitCard key={v.id} visit={v} />)}
        {data && all.length > 0 && <p className="pt-1 text-center text-xs text-muted">Shows your open tickets and the ones you solved today.</p>}
      </div>
    </main>
  );
}

export default function Page() {
  return (
    <ClientOnly fallback={<div className="space-y-3 p-4"><Skeleton className="h-14" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div>}>
      <TicketList />
    </ClientOnly>
  );
}
