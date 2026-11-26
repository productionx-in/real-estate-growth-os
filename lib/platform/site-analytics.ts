// lib/platform/site-analytics.ts — Website analytics for RE staff: how visitors arrive, move through the public
// site and reach "Book a demo" (site_pageviews, 20260105). summarise() is pure and unit-tested; loadSiteAnalytics()
// reads with the service client and is only called from the platform console after its own role check.

export interface PageviewRow {
  at: string
  visit_id: string
  seq: number
  path: string
  prev_path: string | null
  referrer_host: string | null
  utm_source: string | null
  utm_medium: string | null
  country: string | null
  device: string
}

export interface Count { label: string; value: number }
export interface Flow { from: string; to: string; value: number }

export interface SiteSummary {
  days: number
  pageviews: number
  visits: number
  pagesPerVisit: number
  bounceRate: number | null
  demoVisits: number
  demoRate: number | null
  daily: Count[]
  sources: Count[]
  entries: (Count & { demo: number })[]
  exits: Count[]
  pages: Count[]
  flows: Flow[]
  countries: Count[]
  devices: Count[]
}

export const DEMO_PATH = '/demo'

const SEARCH = /(^|\.)(google|bing|duckduckgo|yahoo|ecosia|yandex|baidu)\./
const SOCIAL = /(^|\.)(facebook|fb|instagram|linkedin|lnkd|t|x|twitter|youtube|reddit|whatsapp|wa)\.(com|me|co|in)$/
const AI = /(^|\.)(chatgpt|openai|perplexity|claude|gemini|copilot)\./

/** Where a visit came from: its campaign source when tagged, otherwise the kind of referring site. */
export function sourceOf(r: Pick<PageviewRow, 'utm_source' | 'utm_medium' | 'referrer_host'>): string {
  if (r.utm_source) return r.utm_medium ? `${r.utm_source} / ${r.utm_medium}` : r.utm_source
  const h = r.referrer_host
  if (!h) return 'Direct'
  if (SEARCH.test(h)) return 'Search'
  if (AI.test(h)) return 'AI assistants'
  if (SOCIAL.test(h)) return 'Social'
  return h
}

const top = (m: Map<string, number>, n: number): Count[] => [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n).map(([label, value]) => ({ label, value }))
const bump = (m: Map<string, number>, k: string, by = 1) => m.set(k, (m.get(k) ?? 0) + by)
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null)
const istDay = (iso: string) => new Date(new Date(iso).getTime() + 5.5 * 3600e3).toISOString().slice(0, 10)

export function summarise(rows: PageviewRow[], days: number, now = new Date()): SiteSummary {
  const visits = new Map<string, PageviewRow[]>()
  for (const r of rows) { const v = visits.get(r.visit_id); if (v) v.push(r); else visits.set(r.visit_id, [r]) }

  const pages = new Map<string, number>(), flows = new Map<string, number>(), daily = new Map<string, number>()
  const sources = new Map<string, number>(), entries = new Map<string, number>(), entryDemo = new Map<string, number>()
  const exits = new Map<string, number>(), countries = new Map<string, number>(), devices = new Map<string, number>()
  let bounces = 0, demoVisits = 0

  for (const r of rows) {
    bump(pages, r.path)
    if (r.prev_path && r.prev_path !== r.path) bump(flows, `${r.prev_path}\u0000${r.path}`)
  }
  for (const list of visits.values()) {
    list.sort((a, b) => a.seq - b.seq)
    const first = list[0], last = list[list.length - 1]
    const demo = list.some((r) => r.path === DEMO_PATH)
    if (list.length === 1) bounces++
    if (demo) demoVisits++
    bump(daily, istDay(first.at))
    bump(sources, sourceOf(first))
    bump(entries, first.path)
    if (demo) bump(entryDemo, first.path)
    bump(exits, last.path)
    bump(countries, first.country ?? 'Unknown')
    bump(devices, first.device)
  }

  // Every day in the range, so quiet days show as zero rather than disappearing.
  const series: Count[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = istDay(new Date(now.getTime() - i * 864e5).toISOString())
    series.push({ label: d, value: daily.get(d) ?? 0 })
  }

  return {
    days,
    pageviews: rows.length,
    visits: visits.size,
    pagesPerVisit: visits.size ? Math.round((rows.length / visits.size) * 10) / 10 : 0,
    bounceRate: pct(bounces, visits.size),
    demoVisits,
    demoRate: pct(demoVisits, visits.size),
    daily: series,
    sources: top(sources, 10),
    entries: top(entries, 10).map((e) => ({ ...e, demo: entryDemo.get(e.label) ?? 0 })),
    exits: top(exits, 10),
    pages: top(pages, 15),
    flows: top(flows, 12).map(({ label, value }) => { const [from, to] = label.split('\u0000'); return { from, to, value } }),
    countries: top(countries, 8),
    devices: top(devices, 3),
  }
}

type Db = { from: (t: string) => { select: (c: string) => { gte: (c: string, v: string) => { order: (c: string, o: { ascending: boolean }) => { limit: (n: number) => PromiseLike<{ data: PageviewRow[] | null; error: { message: string } | null }> } } } } }

export const RANGES = [7, 30, 90] as const
export const MAX_ROWS = 50_000

export async function loadSiteAnalytics(db: Db, days: number): Promise<{ summary: SiteSummary; truncated: boolean } | { error: string }> {
  const since = new Date(Date.now() - days * 864e5).toISOString()
  const { data, error } = await db.from('site_pageviews')
    .select('at, visit_id, seq, path, prev_path, referrer_host, utm_source, utm_medium, country, device')
    .gte('at', since).order('at', { ascending: false }).limit(MAX_ROWS)
  if (error) return { error: error.message }
  const rows = data ?? []
  return { summary: summarise(rows, days), truncated: rows.length >= MAX_ROWS }
}
