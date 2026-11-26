// app/manifest.ts — installable app (PWA) manifest, so salespeople can add RE to their home screen.
import type { MetadataRoute } from 'next'
import { PRODUCT_NAME } from '@/lib/brand'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: PRODUCT_NAME,
    short_name: PRODUCT_NAME,
    description: 'Every real-estate lead, assigned in seconds.',
    start_url: '/select-org',
    scope: '/',
    display: 'standalone',
    background_color: '#f3f6fa',
    theme_color: '#0b1120',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
