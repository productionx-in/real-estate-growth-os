// lib/integrations/website/attribution.ts
// Cleans what a public web page tells us about where a visitor came from (UTM tags, ad click IDs, landing
// page, referrer). Everything here arrives from the open internet, so every value is length-capped, URLs
// must be http(s), and unknown keys are dropped.

export const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const
export const CLICK_ID_KEYS = ['gclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid', 'li_fat_id', 'ttclid'] as const

export type Touch = Partial<Record<(typeof UTM_KEYS)[number] | (typeof CLICK_ID_KEYS)[number], string>> & {
  landing?: string
  referrer?: string
  at?: string
}

/** A short single-line string, or null. */
export function cleanText(v: unknown, max = 200): string | null {
  if (typeof v !== 'string' && typeof v !== 'number') return null
  const s = String(v).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim()
  return s ? s.slice(0, max) : null
}

/** Only http(s) URLs survive — never javascript:, data: or anything a browser would execute when clicked. */
export function safeHttpUrl(v: unknown, max = 1000): string | null {
  if (typeof v !== 'string' || v.length > 4000) return null
  try {
    const u = new URL(v.trim())
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    u.username = ''
    u.password = ''
    const out = u.toString()
    return out.length <= max ? out : null
  } catch {
    return null
  }
}

export function cleanTouch(raw: unknown, now = new Date()): Touch | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  const t: Touch = {}
  for (const k of [...UTM_KEYS, ...CLICK_ID_KEYS]) {
    const v = cleanText(r[k], 200)
    if (v) t[k] = v
  }
  const landing = safeHttpUrl(r.landing)
  if (landing) t.landing = landing
  const referrer = safeHttpUrl(r.referrer)
  if (referrer) t.referrer = referrer
  if (typeof r.at === 'string') {
    const at = new Date(r.at)
    if (!Number.isNaN(at.getTime()) && at.getTime() <= now.getTime() + 5 * 60_000 && at.getTime() > now.getTime() - 400 * 86_400_000) {
      t.at = at.toISOString()
    }
  }
  return Object.keys(t).length ? t : null
}

/** Which click ID (if any) shows the visit came from a paid ad, e.g. { gclid: '…' } → 'google_ads'. */
export function adPlatform(t: Touch | null): string | null {
  if (!t) return null
  if (t.gclid || t.gbraid || t.wbraid) return 'google_ads'
  if (t.fbclid) return 'meta_ads'
  if (t.msclkid) return 'microsoft_ads'
  if (t.li_fat_id) return 'linkedin_ads'
  if (t.ttclid) return 'tiktok_ads'
  return null
}

const AD_PLATFORM_LABELS: Record<string, string> = {
  google_ads: 'Google Ads', meta_ads: 'Meta (Facebook/Instagram)', microsoft_ads: 'Microsoft Ads',
  linkedin_ads: 'LinkedIn Ads', tiktok_ads: 'TikTok Ads',
}

export interface VisitDetail {
  label: string
  value: string
  /** Set only for http(s) links. */
  href?: string
}

/**
 * What a lead's stored source details say about the visit, for the lead page. Reads the stored JSON
 * defensively (it came from a public web page) and links only http(s) URLs.
 */
export function visitDetails(sourceMetadata: unknown): VisitDetail[] {
  const m = (sourceMetadata && typeof sourceMetadata === 'object' ? sourceMetadata : {}) as Record<string, unknown>
  const first = cleanTouch(m.first_touch)
  const last = cleanTouch(m.last_touch) ?? first
  const rows: VisitDetail[] = []
  const add = (label: string, v: unknown) => { const t = cleanText(v, 200); if (t) rows.push({ label, value: t }) }
  const link = (label: string, v: unknown) => { const u = safeHttpUrl(v); if (u) rows.push({ label, value: u, href: u }) }

  const platform = typeof m.ad_platform === 'string' ? AD_PLATFORM_LABELS[m.ad_platform] : undefined
  if (platform) rows.push({ label: 'Came from an ad', value: platform })
  add('UTM source', last?.utm_source ?? m.utm_source)
  add('UTM medium', last?.utm_medium ?? m.utm_medium)
  add('UTM campaign', last?.utm_campaign ?? m.utm_campaign)
  add('UTM term', last?.utm_term ?? m.utm_term)
  add('UTM content', last?.utm_content ?? m.utm_content)
  link('Referred by', last?.referrer ?? m.referrer_url)
  if (first?.landing && first.landing !== last?.landing) link('First visit landed on', first.landing)
  if (first?.at) rows.push({ label: 'First visit', value: new Date(first.at).toISOString().slice(0, 10) })
  if (typeof m.pages_viewed === 'number' && m.pages_viewed > 0) rows.push({ label: 'Pages viewed', value: String(Math.floor(m.pages_viewed)) })
  add('Page title', m.page_title)
  return rows
}
