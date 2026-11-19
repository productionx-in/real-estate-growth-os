// app/sitemap.ts — the pages we want indexed, from the site page map (lib/marketing/site-pages.ts) and the URL
// configuration. Legal pages join once confirmed (lib/legal.ts). Customer project showrooms are not listed: each
// customer decides whether to promote theirs.
import type { MetadataRoute } from 'next'
import { absolute, LEGAL_PATHS, ROUTES, siteUrl } from '@/lib/site/urls'
import { SITE_PAGES } from '@/lib/marketing/site-pages'
import { LEGAL } from '@/lib/legal'

export default function sitemap(): MetadataRoute.Sitemap {
  const site = siteUrl()
  const pages: { path: string; priority: number }[] = [
    { path: ROUTES.home, priority: 1 },
    ...SITE_PAGES.map((p) => ({ path: p.path, priority: p.priority })),
    ...(LEGAL.confirmed ? LEGAL_PATHS.map((path) => ({ path, priority: path === ROUTES.contact ? 0.5 : 0.2 })) : []),
  ]
  return pages.map((p) => ({ url: absolute(p.path, site), changeFrequency: 'monthly', priority: p.priority }))
}
