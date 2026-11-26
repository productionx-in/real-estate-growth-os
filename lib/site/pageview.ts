// lib/site/pageview.ts — what the public website's page-view beacon may record (20260105). Browser-safe, no I/O.
// Only public website pages are accepted, so a customer workspace, microsite or form can never be tracked here.
// Nothing identifies a person: no cookie, no IP address, no user agent string; the visit id lives in one tab.
import { SITE_PAGES } from '@/lib/marketing/site-pages'

export const PUBLIC_PATHS: ReadonlySet<string> = new Set(['/', '/contact', '/privacy', '/terms', '/refund-policy', ...SITE_PAGES.map((p) => p.path)])

export type Device = 'mobile' | 'tablet' | 'desktop'

export interface PageviewInput {
  visitId: string
  seq: number
  path: string
  prevPath: string | null
  referrerHost: string | null
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
  device: Device
}

const clip = (v: unknown, n: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null)

/** Path without query, hash or trailing slash; null unless it is a public website page. */
export function publicPath(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.startsWith('/')) return null
  const p = raw.split(/[?#]/)[0].replace(/\/+$/, '') || '/'
  return PUBLIC_PATHS.has(p) ? p : null
}

/** The referring site's host, or null for direct visits and moves within our own site. */
export function referrerHost(raw: unknown, ownHost: string | null): string | null {
  if (typeof raw !== 'string' || !raw) return null
  try {
    const h = new URL(raw).hostname.toLowerCase().replace(/^www\./, '')
    if (!h || (ownHost && h === ownHost.toLowerCase().replace(/^www\./, ''))) return null
    return h.slice(0, 120)
  } catch { return null }
}

export function deviceOf(userAgent: string | null): Device {
  const ua = userAgent ?? ''
  if (/iPad|Tablet|Android(?!.*Mobile)/i.test(ua)) return 'tablet'
  if (/Mobi|iPhone|Android/i.test(ua)) return 'mobile'
  return 'desktop'
}

export const isBot = (userAgent: string | null) => !userAgent || /bot|crawl|spider|slurp|preview|headless|lighthouse|monitor|curl|wget|python|axios/i.test(userAgent)

/** Validates a beacon body. Returns null for anything that should not be stored. */
export function parsePageview(body: unknown, ctx: { userAgent: string | null; ownHost: string | null }): PageviewInput | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  const visitId = typeof b.v === 'string' && /^[a-z0-9]{8,32}$/.test(b.v) ? b.v : null
  const path = publicPath(b.p)
  const seq = Number(b.n)
  if (!visitId || !path || !Number.isInteger(seq) || seq < 1 || seq > 500) return null
  const prev = b.f == null ? null : publicPath(b.f)
  return {
    visitId, seq, path,
    prevPath: prev === path ? null : prev,
    referrerHost: seq === 1 ? referrerHost(b.r, ctx.ownHost) : null,
    utmSource: seq === 1 ? clip(b.us, 80)?.toLowerCase() ?? null : null,
    utmMedium: seq === 1 ? clip(b.um, 80)?.toLowerCase() ?? null : null,
    utmCampaign: seq === 1 ? clip(b.uc, 120) : null,
    device: deviceOf(ctx.userAgent),
  }
}
