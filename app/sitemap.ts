// app/sitemap.ts — the pages we want indexed. Built from lib/site/urls.ts; legal pages join once confirmed
// (lib/legal.ts). Customer project showrooms are not listed: each customer decides whether to promote theirs.
import type { MetadataRoute } from 'next'
import { absolute, ROUTES, siteUrl } from '@/lib/site/urls'
import { LEGAL } from '@/lib/legal'

export default function sitemap(): MetadataRoute.Sitemap {
  const site = siteUrl()
  const pages: { path: string; priority: number }[] = [
    { path: ROUTES.home, priority: 1 },
    { path: ROUTES.pricing, priority: 0.8 },
    { path: ROUTES.demo, priority: 0.7 },
    { path: ROUTES.leakageAudit, priority: 0.6 },
    { path: ROUTES.migration, priority: 0.7 },
    ...(LEGAL.confirmed ? [{ path: ROUTES.privacy, priority: 0.2 }, { path: ROUTES.terms, priority: 0.2 }] : []),
  ]
  return pages.map((p) => ({ url: absolute(p.path, site), changeFrequency: 'monthly', priority: p.priority }))
}
