import { initials } from '@/lib/format';

/** Initials in a circle. There are no profile photos in the system, so none are faked. */
export function Avatar({ name, size = 40, tone = 'brand' }: { name: string; size?: number; tone?: 'brand' | 'light' }) {
  return (
    <span aria-hidden style={{ width: size, height: size, fontSize: size * 0.38 }}
      className={`flex shrink-0 items-center justify-center rounded-full font-bold ${tone === 'light' ? 'bg-white text-navy' : 'bg-primary-soft text-primary'}`}>
      {initials(name)}
    </span>
  );
}
