// app/robots.ts — what crawlers may visit. Public marketing pages and published project showrooms are open; the
// application, its APIs, invitations, shared documents and admin consoles are not (they are also marked noindex
// by proxy.ts). AI and search crawlers are treated alike; restricting AI training crawlers is a business decision
// recorded in docs/marketing/WEBSITE_SEO_AUDIT_2026-11.md.
import type { MetadataRoute } from 'next'
import { absolute, MARKETING_PATHS, siteUrl } from '@/lib/site/urls'

export default function robots(): MetadataRoute.Robots {
  const site = siteUrl()
  return {
    rules: [{
      userAgent: '*',
      allow: [...MARKETING_PATHS, '/privacy', '/terms', '/p/', '/llms.txt'],
      disallow: ['/api/', '/auth/', '/invite/', '/d/', '/forms/', '/platform', '/admin', '/dev', '/select-org', '/create-org', '/my/', '/login', '/reset-password'],
    }],
    ...(site ? { sitemap: absolute('/sitemap.xml', site), host: site } : {}),
  }
}
