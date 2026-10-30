import type { Metadata } from 'next';
import { TechChrome } from '@/components/ui/TechChrome';

export const metadata: Metadata = { title: 'Bhawani FSM — Technician' };

/** Technician app: phone-width column with side menu and bottom navigation (centred when previewed on a desktop). */
export default function TechLayout({ children }: { children: React.ReactNode }) {
  return <TechChrome>{children}</TechChrome>;
}
