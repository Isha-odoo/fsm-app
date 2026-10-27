'use client';

import { useState } from 'react';
import { Check, Copy, ExternalLink, MessageCircle, Share2 } from 'lucide-react';

/** wa.me wants digits with the country code. Ten-digit Indian numbers get 91 in front. */
function whatsappNumber(phone: string | null | undefined): string {
  const d = (phone ?? '').replace(/\D/g, '');
  if (d.length === 10) return `91${d}`;
  return d.length >= 11 ? d : '';
}

/** Ways to get a quotation to the customer: WhatsApp, the phone's share sheet, copy the link, open or print it. */
export function ShareButtons({ url, quotationNo, customerName, phone }: { url: string; quotationNo: string; customerName: string; phone?: string | null }) {
  const [copied, setCopied] = useState(false);
  const text = `Hello ${customerName}, here is your service quotation ${quotationNo}. You can view, print and approve it here: ${url}`;
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const btn = 'flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-semibold active:bg-slate-100';

  return (
    <div className="grid grid-cols-2 gap-2">
      <a href={`https://wa.me/${whatsappNumber(phone)}?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer"
        className="col-span-2 flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-3.5 text-sm font-bold text-white active:bg-emerald-700">
        <MessageCircle className="h-5 w-5" /> Send on WhatsApp
      </a>
      {canShare && (
        <button onClick={() => navigator.share({ title: `Quotation ${quotationNo}`, text, url }).catch(() => undefined)} className={btn}><Share2 className="h-4 w-4" /> Share…</button>
      )}
      <button onClick={async () => { await navigator.clipboard.writeText(url).catch(() => undefined); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className={btn}>
        {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />} {copied ? 'Copied' : 'Copy link'}
      </button>
      <a href={url} target="_blank" rel="noopener noreferrer" className={`${btn} ${canShare ? '' : 'col-span-1'}`}><ExternalLink className="h-4 w-4" /> View / print</a>
    </div>
  );
}
