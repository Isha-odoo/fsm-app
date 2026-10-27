'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Plus, Search } from 'lucide-react';
import { api, session } from '@/lib/api';
import { ClientOnly } from '@/components/ClientOnly';
import { ItemModal, StockModal, TYPE_LABEL } from '@/components/admin/ItemModals';
import { formatINR } from '@/lib/format';
import type { InventoryItem, ItemType } from '@/lib/types';

const th = 'p-3 text-xs font-semibold uppercase tracking-wide text-slate-500';
const TABS: { key: ItemType | 'ALL'; label: string }[] = [
  { key: 'ALL', label: 'All' }, { key: 'PRODUCT', label: 'Products' }, { key: 'SERVICE', label: 'Services' },
  { key: 'PART', label: 'Spare parts' }, { key: 'CONSUMABLE', label: 'Consumables' },
];

const isLow = (i: InventoryItem) => i.onHand !== null && i.isActive && i.onHand <= i.reorderLevel && (i.reorderLevel > 0 || i.onHand < 0);

function Inventory() {
  const [tab, setTab] = useState<ItemType | 'ALL'>('ALL');
  const [q, setQ] = useState('');
  const [inactive, setInactive] = useState(false);
  const [edit, setEdit] = useState<InventoryItem | 'new' | null>(null);
  const [stockFor, setStockFor] = useState<InventoryItem | null>(null);
  const canEdit = session.role() === 'ADMIN';

  const items = useQuery({
    queryKey: ['admin', 'inventory', tab, q, inactive],
    queryFn: () => api.getInventory({ type: tab === 'ALL' ? undefined : tab, q, inactive }),
    placeholderData: (prev) => prev,
  });
  const rows = items.data ?? [];
  const low = rows.filter(isLow);

  return (
    <main className="space-y-4 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Inventory</h1>
          <p className="text-sm text-slate-600">Products and services customers can raise tickets about, plus the spare parts and consumables technicians use.</p>
        </div>
        {canEdit && (
          <button onClick={() => setEdit('new')} className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800">
            <Plus className="h-4 w-4" /> New item
          </button>
        )}
      </header>

      {low.length > 0 && (
        <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span><span className="font-semibold">Low stock:</span> {low.map((i) => `${i.name} (${i.onHand})`).join(', ')}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-xl bg-white p-1 shadow-sm ring-1 ring-slate-200">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${tab === t.key ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{t.label}</button>
          ))}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or SKU…" aria-label="Search inventory"
            className="rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-slate-900" />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={inactive} onChange={(e) => setInactive(e.target.checked)} className="h-4 w-4" /> Show inactive</label>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr><th className={th}>SKU</th><th className={th}>Name</th><th className={th}>Type</th><th className={`${th} text-right`}>Price</th><th className={`${th} text-right`}>GST</th><th className={`${th} text-right`}>On hand</th><th className={th}>Warranty</th><th className={th}>Customer form</th>{canEdit && <th className={th} />}</tr>
          </thead>
          <tbody>
            {items.isLoading && <tr><td colSpan={9} className="p-4"><div className="h-8 animate-pulse rounded bg-slate-100" /></td></tr>}
            {items.isError && <tr><td colSpan={9} className="p-4 text-red-700">{(items.error as Error).message}</td></tr>}
            {items.isSuccess && rows.length === 0 && <tr><td colSpan={9} className="p-6 text-center text-slate-500">No items found.</td></tr>}
            {rows.map((i) => (
              <tr key={i.id} className={`border-t border-slate-100 ${i.isActive ? '' : 'text-slate-400'}`}>
                <td className="p-3 font-mono text-xs">{i.sku}</td>
                <td className="p-3 font-semibold">{i.name}{!i.isActive && <span className="ml-2 text-xs font-normal">(inactive)</span>}</td>
                <td className="p-3">{TYPE_LABEL[i.type]}</td>
                <td className="p-3 text-right tabular-nums">{formatINR(i.unitPricePaise)}</td>
                <td className="p-3 text-right tabular-nums">{i.gstRateBp / 100}%</td>
                <td className="p-3 text-right tabular-nums">
                  {i.onHand === null ? '—' : <span className={isLow(i) ? 'rounded-full bg-red-100 px-2.5 py-0.5 font-semibold text-red-800' : ''}>{i.onHand}</span>}
                </td>
                <td className="p-3">{i.warrantyCovers ? 'Covered' : '—'}</td>
                <td className="p-3">{i.type === 'PRODUCT' || i.type === 'SERVICE' ? (i.requestable ? 'Offered' : 'Hidden') : '—'}</td>
                {canEdit && (
                  <td className="space-x-3 whitespace-nowrap p-3 text-right">
                    {i.onHand !== null && <button onClick={() => setStockFor(i)} className="font-semibold text-slate-700 underline-offset-2 hover:underline">Stock</button>}
                    <button onClick={() => setEdit(i)} className="font-semibold text-slate-700 underline-offset-2 hover:underline">Edit</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!canEdit && <p className="text-xs text-slate-500">Dispatchers can view inventory. Only administrators can change it.</p>}

      {edit && <ItemModal item={edit === 'new' ? undefined : edit} defaultType={tab === 'ALL' ? undefined : tab} onClose={() => setEdit(null)} />}
      {stockFor && <StockModal item={stockFor} onClose={() => setStockFor(null)} />}
    </main>
  );
}

export default function Page() {
  return (
    <ClientOnly fallback={<div className="p-6"><div className="h-64 animate-pulse rounded-2xl bg-slate-200" /></div>}>
      <Inventory />
    </ClientOnly>
  );
}
