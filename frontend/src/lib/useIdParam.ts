'use client';

import { useSearchParams } from 'next/navigation';

/**
 * Reads ?id=... (or another query name). Pages use query strings instead of /[id] paths so the whole app can also be
 * exported as plain static files (Render Static Site, Capacitor APK), which cannot serve paths with unknown ids.
 */
export function useIdParam(name = 'id'): string {
  return useSearchParams().get(name) ?? '';
}
