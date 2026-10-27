'use client';

import { useSyncExternalStore, type ReactNode } from 'react';

const subscribe = () => () => {};

/**
 * Renders children only in the browser. These screens depend on "today", the phone's GPS and
 * per-user data, so there is nothing useful to prerender (and Next.js 16's Cache Components
 * rejects reading the current time during prerender).
 */
export function ClientOnly({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  return <>{mounted ? children : fallback}</>;
}
