'use client';

import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import type { InventoryItem, ItemType } from '@/lib/types';
import { Field, Modal, inputCls } from './Modal';

export const TYPE_LABEL: Record<ItemType, string> = { PRODUCT: 'Product', SERVICE: 'Service', PART: 'Spare part', CONSUMABLE: 'Consumable' };

const rupees = (paise: number) => String(paise / 100);
const toPaise = (v: string) => Math.round(Number(v) * 100);

function Footer({ onClose, pending, label }: { onClose: () => void; pending: boolean; label: string }) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <button type="button" onClick={onClose} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold hover:bg-slate-50">Cancel</button>
      <button type="submit" disabled={pending} className="flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50">
        {pending && <Loader2 className="h-4 w-4 animate-spin" />} {label}
      </button>
    </div>
  );
}

/** Create a product, service, spare part or consumable; or edit one (SKU and type are fixed after creation). */
export function ItemModal({ item, defaultType, onClose }: { item?: InventoryItem; defaultType?: ItemType; onClose: () => void }) {
  const qc = useQueryClient();
  const [type, setType] = useState<ItemType>(item?.type ?? defaultType ?? 'PRODUCT');
  const [sku, setSku] = useState(item?.sku ?? '');
  const [name, setName] = useState(item?.name ?? '');
  const [price, setPrice] = useState(item ? rupees(item.unitPricePaise) : '');
  const [gst, setGst] = useState(String((item?.gstRateBp ?? 1800) / 100));
  const [hsn, setHsn] = useState(item?.hsnSac ?? '');
  const [warrantyCovers, setWarrantyCovers] = useState(item?.warrantyCovers ?? false);
  const [requestable, setRequestable] = useState(item?.requestable ?? (type === 'PRODUCT' || type === 'SERVICE'));
  const [reorder, setReorder] = useState(String(item?.reorderLevel ?? 0));
  const [opening, setOpening] = useState('0');
  const [isActive, setIsActive] = useState(item?.isActive ?? true);

  const stocked = type !== 'SERVICE';
  const offerable = type === 'PRODUCT' || type === 'SERVICE';

  const save = useMutation({
    mutationFn: () => {
      const common = {
        name: name.trim(), unitPricePaise: toPaise(price), gstRateBp: Math.round(Number(gst) * 100), hsnSac: hsn.trim() || null,
        warrantyCovers, requestable: offerable && requestable, reorderLevel: stocked ? Number(reorder) || 0 : 0,
      };
      return item
        ? api.updateItem(item.id, { ...common, isActive })
        : api.createItem({ ...common, type, sku: sku.trim(), ...(stocked && Number(opening) > 0 ? { openingStock: Number(opening) } : {}) });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin'] }); onClose(); },
  });
  const onSubmit = (e: FormEvent) => { e.preventDefault(); save.mutate(); };

  return (
    <Modal title={item ? `Edit ${item.name}` : 'New inventory item'} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Type">
            <select value={type} disabled={!!item} onChange={(e) => { const t = e.target.value as ItemType; setType(t); setRequestable(t === 'PRODUCT' || t === 'SERVICE'); }} className={`${inputCls} disabled:bg-slate-100`}>
              {(Object.keys(TYPE_LABEL) as ItemType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
            </select>
          </Field>
          <Field label="SKU / code"><input required disabled={!!item} minLength={2} maxLength={40} pattern="[A-Za-z0-9._\-]+" value={sku} onChange={(e) => setSku(e.target.value)} className={`${inputCls} font-mono disabled:bg-slate-100`} /></Field>
        </div>
        <Field label="Name"><input required minLength={2} value={name} onChange={(e) => setName(e.target.value)} className={inputCls} /></Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Price (₹)"><input required type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className={inputCls} /></Field>
          <Field label="GST %"><input required type="number" min="0" max="28" step="0.5" value={gst} onChange={(e) => setGst(e.target.value)} className={inputCls} /></Field>
          <Field label="HSN / SAC"><input maxLength={12} value={hsn} onChange={(e) => setHsn(e.target.value)} className={inputCls} /></Field>
        </div>

        {stocked && (
          <div className="grid gap-3 sm:grid-cols-2">
            {!item && <Field label="Opening stock"><input type="number" min="0" value={opening} onChange={(e) => setOpening(e.target.value)} className={inputCls} /></Field>}
            <Field label="Low-stock alert at" hint="Shows red when on-hand falls to this number."><input type="number" min="0" value={reorder} onChange={(e) => setReorder(e.target.value)} className={inputCls} /></Field>
          </div>
        )}

        <div className="space-y-2 rounded-xl bg-slate-50 p-3 text-sm">
          <label className="flex items-start gap-2"><input type="checkbox" checked={warrantyCovers} onChange={(e) => setWarrantyCovers(e.target.checked)} className="mt-0.5 h-4 w-4" />
            <span><span className="font-semibold">Free while the machine is in warranty</span><br /><span className="text-xs text-slate-500">Leave off for consumables like toner and ink.</span></span></label>
          {offerable && (
            <label className="flex items-start gap-2"><input type="checkbox" checked={requestable} onChange={(e) => setRequestable(e.target.checked)} className="mt-0.5 h-4 w-4" />
              <span><span className="font-semibold">Offer on the customer request form</span><br /><span className="text-xs text-slate-500">Customers can pick this {type === 'PRODUCT' ? 'product' : 'service'} when they raise a ticket.</span></span></label>
          )}
          {item && <label className="flex items-center gap-2"><input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4" /> <span className="font-semibold">Active</span></label>}
        </div>

        {save.isError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{(save.error as Error).message}</p>}
        <Footer onClose={onClose} pending={save.isPending} label={item ? 'Save' : 'Create item'} />
      </form>
    </Modal>
  );
}

/** Receive stock (purchase) or correct it (adjustment, e.g. after a stock count). Usage on tickets is deducted automatically. */
export function StockModal({ item, onClose }: { item: InventoryItem; onClose: () => void }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<'PURCHASE' | 'ADJUSTMENT'>('PURCHASE');
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');

  const save = useMutation({
    mutationFn: () => api.adjustStock(item.id, { qtyDelta: Number(qty), reason: mode, note: note.trim() || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin'] }); onClose(); },
  });
  const onSubmit = (e: FormEvent) => { e.preventDefault(); save.mutate(); };
  const after = (item.onHand ?? 0) + (Number(qty) || 0);

  return (
    <Modal title={`Stock: ${item.name}`} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3">
        <p className="text-sm text-slate-600">On hand now: <span className="font-bold text-slate-900">{item.onHand}</span></p>
        <div className="flex gap-2">
          {([['PURCHASE', 'Receive stock'], ['ADJUSTMENT', 'Correct count']] as const).map(([m, label]) => (
            <button key={m} type="button" onClick={() => setMode(m)} className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold ${mode === m ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 hover:bg-slate-50'}`}>{label}</button>
          ))}
        </div>
        <Field label={mode === 'PURCHASE' ? 'Quantity received' : 'Quantity change (use a minus to remove)'}>
          <input required type="number" step="1" min={mode === 'PURCHASE' ? 1 : undefined} value={qty} onChange={(e) => setQty(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Note" hint="e.g. purchase order no., or why the count changed"><input maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} /></Field>
        {Number(qty) !== 0 && qty !== '' && <p className="text-sm text-slate-600">After this: <span className={`font-bold ${after < 0 ? 'text-red-700' : 'text-slate-900'}`}>{after}</span></p>}
        {save.isError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{(save.error as Error).message}</p>}
        <Footer onClose={onClose} pending={save.isPending} label="Update stock" />
      </form>
    </Modal>
  );
}
