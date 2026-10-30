import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Request service — Bhawani Print & Pack',
  description: 'Report a problem with your printer or copier and our technicians will get back to you.',
};

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-canvas text-ink">{children}</div>;
}
