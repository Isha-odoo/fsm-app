const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });

/** Money is handled as integer paise everywhere; convert only for display. */
export function formatINR(paise: number): string {
  return inr.format(paise / 100);
}

export function formatTime(iso: string | null): string {
  if (!iso) return 'Unscheduled';
  return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
}

/** Today's date in IST as YYYY-MM-DD. */
export function todayIST(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

export function formatLongDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00+05:30`).toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata',
  });
}

export function formatDate(isoDate: string | null): string {
  if (!isoDate) return '—';
  return new Date(`${isoDate}T00:00:00+05:30`).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata',
  });
}

export function mapsDirectionsUrl(v: { latitude: number | null; longitude: number | null; address: string; city: string | null }): string {
  const dest = v.latitude != null && v.longitude != null ? `${v.latitude},${v.longitude}` : encodeURIComponent(`${v.address} ${v.city ?? ''}`.trim());
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
}

/** "23 Oct, 3:30 pm" in IST, for timestamps. */
export function formatWhen(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
}

/** "23 Oct 2026" in IST, for timestamps. */
export function formatDay(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

export function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export const PRIORITY_LABEL = { 1: 'Urgent', 2: 'Normal', 3: 'Low' } as const;

/** A calendar day in IST as YYYY-MM-DD, `offsetDays` from today (negative = past). */
export function istDate(offsetDays = 0): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(Date.now() + offsetDays * 86_400_000));
}

/** First day of the current month in IST. */
export function istMonthStart(): string {
  return `${istDate().slice(0, 8)}01`;
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function below100(n: number): string {
  return n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? `-${ONES[n % 10]}` : ''}`;
}
function below1000(n: number): string {
  const h = Math.floor(n / 100);
  return `${h ? `${ONES[h]} Hundred${n % 100 ? ' ' : ''}` : ''}${below100(n % 100)}`;
}

/** 324500 paise => "Rupees Three Thousand Two Hundred Forty-Five Only" (Indian crore / lakh grouping). */
export function amountInWords(paise: number): string {
  const rupees = Math.floor(paise / 100);
  const ps = paise % 100;
  if (rupees === 0 && ps === 0) return 'Rupees Zero Only';
  if (rupees === 0) return `${below100(ps)} Paise Only`;
  const groups: [number, string][] = [[Math.floor(rupees / 10_000_000), 'Crore'], [Math.floor(rupees / 100_000) % 100, 'Lakh'], [Math.floor(rupees / 1000) % 100, 'Thousand']];
  const words = groups.filter(([n]) => n > 0).map(([n, label]) => `${below100(n)} ${label}`);
  if (rupees % 1000) words.push(below1000(rupees % 1000));
  return `Rupees ${words.join(' ') || 'Zero'}${ps ? ` and ${below100(ps)} Paise` : ''} Only`;
}
