'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import { ApiError, api } from '@/lib/api';
import { ClientOnly } from '@/components/ClientOnly';

const EMPTY = { name: '', company: '', phone: '', email: '', serialNumber: '', address: '', city: '', productId: '', serviceId: '', description: '', website: '' };

const input = 'min-h-12 w-full rounded-xl border border-line bg-white px-3.5 py-3 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/15';

/** Turns the server's field errors into one readable sentence. */
function describe(err: unknown): string {
  if (err instanceof ApiError && err.details && typeof err.details === 'object') {
    const msgs = Object.values(err.details as Record<string, string[]>).flat();
    if (msgs.length) return msgs.join(' · ');
  }
  return (err as Error).message;
}

function Field({ id, label, required, hint, children }: { id: string; label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold">{label}{required && <span className="text-red-600"> *</span>}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function RequestForm() {
  // QR stickers on machines can link to /request?serial=XXXX so the customer does not type it.
  const [form, setForm] = useState(() => ({ ...EMPTY, serialNumber: new URLSearchParams(window.location.search).get('serial')?.slice(0, 60) ?? '' }));
  const [ticketNo, setTicketNo] = useState<number | null>(null);
  const idemKey = useRef<string>(crypto.randomUUID()); // reused on retries, so a double tap never creates two tickets

  const catalog = useQuery({ queryKey: ['public-catalog'], queryFn: api.getPublicCatalog, staleTime: 10 * 60_000 });
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = useMutation({
    mutationFn: () =>
      api.submitTicket(
        {
          name: form.name.trim(), company: form.company.trim() || undefined, phone: form.phone.trim(), email: form.email.trim() || undefined,
          serialNumber: form.serialNumber.trim(), address: form.address.trim(), city: form.city.trim() || undefined,
          productId: form.productId || undefined, serviceId: form.serviceId || undefined, description: form.description.trim(), website: form.website,
        },
        idemKey.current,
      ),
    onSuccess: (r) => setTicketNo(r.ticketNo),
  });

  const onSubmit = (e: FormEvent) => { e.preventDefault(); submit.mutate(); };

  if (ticketNo !== null) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
        <span className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50"><CheckCircle2 className="h-12 w-12 text-emerald-600" /></span>
        <h1 className="text-2xl font-bold">Request received</h1>
        <div className="w-full rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-sm text-slate-500">Your ticket number</div>
          <div className="font-mono text-3xl font-bold">#{ticketNo}</div>
        </div>
        <p className="text-sm text-slate-600">Our team will review it and send a technician. We will call you on <span className="font-semibold">{form.phone}</span> if we need anything. Please keep the ticket number handy.</p>
        <button
          onClick={() => { setForm({ ...EMPTY }); setTicketNo(null); submit.reset(); idemKey.current = crypto.randomUUID(); }}
          className="w-full rounded-2xl border border-slate-300 bg-white py-3.5 font-semibold active:bg-slate-100"
        >
          Report another problem
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg pb-12">
      <header className="bg-navy px-6 pb-14 pt-[max(2rem,env(safe-area-inset-top))] text-center text-white">
        <Logo size={56} tone="light" className="mx-auto" />
        <h1 className="mt-3 text-2xl font-bold">Request a service visit</h1>
        <p className="mt-1 text-sm text-white/80">Bhawani Print &amp; Pack. Tell us what is wrong and we will send a technician.</p>
      </header>

      <form onSubmit={onSubmit} className="relative -mt-8 mx-4 space-y-4 rounded-2xl border border-line bg-white p-5 shadow-card">
        <h2 className="pt-1 text-sm font-bold text-primary">Your details</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="name" label="Your name" required><input id="name" required minLength={2} maxLength={120} autoComplete="name" value={form.name} onChange={set('name')} className={input} /></Field>
          <Field id="phone" label="Phone number" required><input id="phone" required type="tel" inputMode="tel" autoComplete="tel" placeholder="98250 12345" value={form.phone} onChange={set('phone')} className={input} /></Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="company" label="Company / shop"><input id="company" maxLength={160} autoComplete="organization" value={form.company} onChange={set('company')} className={input} /></Field>
          <Field id="email" label="Email"><input id="email" type="email" maxLength={200} autoComplete="email" value={form.email} onChange={set('email')} className={input} /></Field>
        </div>

        <h2 className="pt-1 text-sm font-bold text-primary">Machine and service</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="product" label="Product / model" hint="Not sure? Leave it, the serial number is enough.">
            <select id="product" value={form.productId} onChange={set('productId')} className={input}>
              <option value="">Select product…</option>
              {catalog.data?.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field id="service" label="Service needed" required>
            <select id="service" required value={form.serviceId} onChange={set('serviceId')} className={input}>
              <option value="">Select service…</option>
              {catalog.data?.services.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
        </div>

        <Field id="serial" label="Machine serial number" required hint="Printed on a sticker at the back or bottom of the machine.">
          <input id="serial" required minLength={3} maxLength={60} autoCapitalize="characters" value={form.serialNumber} onChange={set('serialNumber')} className={`${input} font-mono tracking-wide`} />
        </Field>

        <Field id="address" label="Where is the machine?" required>
          <textarea id="address" required rows={2} minLength={5} maxLength={300} autoComplete="street-address" placeholder="Shop / plot no., area" value={form.address} onChange={set('address')} className={input} />
        </Field>
        <Field id="city" label="City"><input id="city" maxLength={80} autoComplete="address-level2" value={form.city} onChange={set('city')} className={input} /></Field>

        <h2 className="pt-1 text-sm font-bold text-primary">The problem</h2>
        <Field id="description" label="What is the problem?" required>
          <textarea id="description" required rows={4} minLength={10} maxLength={2000} placeholder="e.g. Prints come out blank after a power cut. It shows error E-502." value={form.description} onChange={set('description')} className={input} />
        </Field>

        {/* Honeypot: invisible to people, bots fill it in. */}
        <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label>Website<input tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} /></label>
        </div>

        {submit.isError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{describe(submit.error)}</p>}

        <button type="submit" disabled={submit.isPending}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-base font-semibold text-white shadow-sm active:bg-primary-dark disabled:opacity-60">
          {submit.isPending && <Loader2 className="h-5 w-5 animate-spin" />} Submit request
        </button>
      </form>
    </main>
  );
}

export default function Page() {
  return (
    <ClientOnly fallback={<div className="mx-auto max-w-lg p-4"><div className="h-96 animate-pulse rounded-2xl bg-slate-200" /></div>}>
      <RequestForm />
    </ClientOnly>
  );
}
