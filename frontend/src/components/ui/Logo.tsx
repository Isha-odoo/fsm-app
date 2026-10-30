/** Bhawani FSM mark: a gear with a wrench. `tone="light"` for dark backgrounds. */
export function Logo({ size = 48, tone = 'brand', className }: { size?: number; tone?: 'brand' | 'light'; className?: string }) {
  const fill = tone === 'light' ? '#ffffff' : '#0866f5';
  const cut = tone === 'light' ? '#0b2d5c' : '#ffffff';
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="Bhawani FSM" className={className}>
      <g fill={fill}>
        <circle cx="32" cy="32" r="19" />
        {[0, 45, 90, 135].map((a) => (
          <rect key={a} x="27" y="4" width="10" height="56" rx="3" transform={`rotate(${a} 32 32)`} />
        ))}
      </g>
      <g transform="rotate(45 32 32)" fill={cut}>
        <rect x="29" y="22" width="6" height="26" rx="3" />
        <path d="M23 20a9 9 0 0 1 18 0v4h-5.5v-4a3.5 3.5 0 0 0-7 0v4H23z" />
      </g>
    </svg>
  );
}
