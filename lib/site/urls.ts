// lib/site/urls.ts — every absolute URL REGrow produces comes from here, so a domain change is a configuration
// change, never a code change. No domain is written into the code.
//
// Sources, in order:
//   NEXT_PUBLIC_SITE_URL  the marketing site (canonical URLs, sitemap, Open Graph). Optional: falls back to the app URL,
//                         because today the marketing site and the app are served by the same deployment.
//   NEXT_PUBLIC_APP_URL   the application (sign-in, invitations, webhooks, embed snippets, push links).
//   VERCEL_PROJECT_PRODUCTION_URL  set by Vercel on every deployment: the project's production domain.
//   the request's own origin (server) or window.location.origin (browser), as the last resort.
// If none is known, functions return null and callers fall back to relative links — never to a guessed domain.

const clean = (u: string | undefined | null): string | null => {
  if (!u) return null
  const v = u.trim().replace(/\/+$/, '')
  if (!v) return null
  const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`
  try { return new URL(withScheme).origin } catch { return null }
}

/** The application's origin (e.g. for links in emails, webhooks and embed code). */
export function appUrl(requestOrigin?: string | null): string | null {
  return clean(process.env.NEXT_PUBLIC_APP_URL)
    ?? clean(process.env.VERCEL_PROJECT_PRODUCTION_URL)
    ?? clean(requestOrigin)
    ?? (typeof window !== 'undefined' ? clean(window.location.origin) : null)
}

/** The marketing site's origin (canonical URLs, sitemap, structured data). */
export function siteUrl(requestOrigin?: string | null): string | null {
  return clean(process.env.NEXT_PUBLIC_SITE_URL) ?? appUrl(requestOrigin)
}

/** Absolute URL for a path, or the path itself when no origin is known (still a working relative link). */
export function absolute(path: string, origin: string | null): string {
  const p = path.startsWith('/') ? path : `/${path}`
  return origin ? `${origin}${p}` : p
}

/** Every public route the website links to, in one place. */
export const ROUTES = {
  home: '/',
  pricing: '/pricing',
  demo: '/demo',
  leakageAudit: '/leakage-audit',
  privacy: '/privacy',
  terms: '/terms',
  login: '/login',
  resetPassword: '/reset-password',
  authCallback: '/auth/callback',
  selectOrg: '/select-org',
  /** Self-service sign-up is not live yet: no public link until it is approved and built. */
  signup: null as string | null,
} as const

/** Pages that search engines may index (everything else is noindex). */
export const INDEXABLE_PATHS: string[] = [ROUTES.home, ROUTES.pricing, ROUTES.demo, ROUTES.leakageAudit, ROUTES.privacy, ROUTES.terms]
export const isIndexablePath = (path: string) => INDEXABLE_PATHS.includes(path) || /^\/p\/[a-z0-9-]{1,80}$/.test(path)
