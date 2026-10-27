import type { MetadataRoute } from 'next';

/** Makes the web app installable on a phone ("Add to home screen") and is what an Android wrapper (APK) builds on. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Bhawani FSM',
    short_name: 'FSM',
    description: 'Field service tickets for Bhawani Print and Pack',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0f172a',
    theme_color: '#0f172a',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
