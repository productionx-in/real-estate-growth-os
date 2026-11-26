// tests/site-analytics.test.mjs — Website analytics (20260105): the beacon only records public website pages and
// nothing that identifies a person; the console summary counts visits, sources, flows and demo reach correctly;
// only the right staff roles see it; Vercel Web Analytics is mounted once in the root layout.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const P = await jiti.import(path.join(root, 'lib/site/pageview.ts'))
const A = await jiti.import(path.join(root, 'lib/platform/site-analytics.ts'))
const portal = await jiti.import(path.join(root, 'lib/platform/portal.ts'))
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')

let passed = 0
const test = async (name, fn) => { await fn(); passed++; console.log(`  ✓ ${name}`) }
console.log('WEBSITE ANALYTICS')

const ctx = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile', ownHost: 're.productionx.in' }

await test('only public website pages are accepted: never the app, console, microsites or a workspace', () => {
  for (const p of ['/', '/pricing', '/demo', '/real-estate-crm', '/pricing/', '/demo?utm_source=x#top']) assert.ok(P.publicPath(p), p)
  for (const p of ['/platform', '/seaview-demo/leads', '/p/abc', '/forms/x', '/api/site/pv', '/login', '/select-org', 'https://evil.example/', 42, null]) assert.equal(P.publicPath(p), null, String(p))
})

await test('a valid beacon becomes a row; a bad visit id, unknown page or silly sequence is dropped', () => {
  const pv = P.parsePageview({ v: 'abc123def456', n: 1, p: '/', r: 'https://www.google.com/search?q=re', us: 'Meta', um: 'CPC', uc: 'Diwali' }, ctx)
  assert.deepEqual(pv, { visitId: 'abc123def456', seq: 1, path: '/', prevPath: null, referrerHost: 'google.com', utmSource: 'meta', utmMedium: 'cpc', utmCampaign: 'Diwali', device: 'mobile' })
  assert.equal(P.parsePageview({ v: 'ABC!', n: 1, p: '/' }, ctx), null)
  assert.equal(P.parsePageview({ v: 'abc123def456', n: 1, p: '/seaview/leads' }, ctx), null)
  assert.equal(P.parsePageview({ v: 'abc123def456', n: 0, p: '/' }, ctx), null)
  assert.equal(P.parsePageview({ v: 'abc123def456', n: 9999, p: '/' }, ctx), null)
})

await test('source details are kept only for the first page; our own site is not a referrer; private previous pages are dropped', () => {
  const later = P.parsePageview({ v: 'abc123def456', n: 2, p: '/demo', f: '/', r: 'https://google.com', us: 'x' }, ctx)
  assert.deepEqual([later.prevPath, later.referrerHost, later.utmSource], ['/', null, null])
  assert.equal(P.parsePageview({ v: 'abc123def456', n: 1, p: '/', r: 'https://www.re.productionx.in/pricing' }, ctx).referrerHost, null)
  assert.equal(P.parsePageview({ v: 'abc123def456', n: 2, p: '/demo', f: '/seaview/leads' }, ctx).prevPath, null)
})

await test('devices and bots', () => {
  assert.equal(P.deviceOf('Mozilla/5.0 (iPad; CPU OS 17_0)'), 'tablet')
  assert.equal(P.deviceOf('Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile'), 'mobile')
  assert.equal(P.deviceOf('Mozilla/5.0 (Windows NT 10.0)'), 'desktop')
  for (const ua of [null, 'Googlebot/2.1', 'curl/8.0', 'HeadlessChrome']) assert.equal(P.isBot(ua), true, String(ua))
  assert.equal(P.isBot('Mozilla/5.0 (Macintosh) Safari/605'), false)
})

const row = (visit, seq, p, extra = {}) => ({ at: '2026-11-25T06:00:00Z', visit_id: visit, seq, path: p, prev_path: null, referrer_host: null, utm_source: null, utm_medium: null, country: 'IN', device: 'desktop', ...extra })

await test('summary: visits, bounce, demo reach, sources, landing pages, flows and exits', () => {
  const rows = [
    row('a', 1, '/', { referrer_host: 'google.com' }), row('a', 2, '/pricing', { prev_path: '/' }), row('a', 3, '/demo', { prev_path: '/pricing' }),
    row('b', 1, '/', { utm_source: 'meta', utm_medium: 'cpc', device: 'mobile' }), row('b', 2, '/pricing', { prev_path: '/' }),
    row('c', 1, '/real-estate-crm', { referrer_host: 'chatgpt.com', country: null }),
  ]
  const s = A.summarise(rows, 7, new Date('2026-11-26T06:00:00Z'))
  assert.deepEqual([s.visits, s.pageviews, s.pagesPerVisit, s.bounceRate, s.demoVisits, s.demoRate], [3, 6, 2, 33.3, 1, 33.3])
  assert.deepEqual(s.sources.map((x) => x.label).sort(), ['AI assistants', 'Search', 'meta / cpc'])
  assert.deepEqual(s.entries[0], { label: '/', value: 2, demo: 1 })
  assert.deepEqual(s.flows[0], { from: '/', to: '/pricing', value: 2 })
  assert.deepEqual(s.exits.map((x) => [x.label, x.value]), [['/demo', 1], ['/pricing', 1], ['/real-estate-crm', 1]])
  assert.deepEqual(s.countries.map((x) => x.label).sort(), ['IN', 'Unknown'])
  assert.equal(s.daily.length, 7)
  assert.equal(s.daily.find((d) => d.label === '2026-11-25').value, 3)
  assert.equal(s.daily.at(-1).label, '2026-11-26')
})

await test('an empty period is all zeros, never a division by zero', () => {
  const s = A.summarise([], 30)
  assert.deepEqual([s.visits, s.pagesPerVisit, s.bounceRate, s.demoRate, s.daily.length], [0, 0, null, null, 30])
})

await test('staff access: Platform Owner, sales managers and auditors only', () => {
  assert.deepEqual(['super_admin', 'sales_manager', 'auditor', 'sales_rep', 'support_agent', 'finance_admin', 'platform_admin'].filter((r) => portal.can(r, 'website')), ['super_admin', 'sales_manager', 'auditor'])
  const page = read('app/platform/website/page.tsx')
  assert.match(page, /getConsoleAccess\(\)/); assert.match(page, /can\(access\.role as StaffRole, 'website'\)\) notFound\(\)/)
})

await test('wiring: no IP or user agent stored; privacy signals honoured; beacon only on the public site; Vercel Analytics once', () => {
  const route = read('app/api/site/pv/route.ts')
  assert.doesNotMatch(route.split('.insert(')[1], /\bip\b|user_agent|userAgent|ua\b/)
  assert.match(route, /sec-gpc/); assert.match(route, /checkDistributedRateLimit/); assert.match(route, /status: 204/)
  assert.match(read('components/marketing/SiteBeacon.tsx'), /globalPrivacyControl/)
  assert.doesNotMatch(read('components/marketing/SiteBeacon.tsx'), /localStorage|document\.cookie/)
  assert.match(read('components/marketing/MarketingShell.tsx'), /<SiteBeacon \/>/)
  const layout = read('app/layout.tsx')
  assert.match(layout, /from '@vercel\/analytics\/next'/); assert.equal(layout.match(/<Analytics \/>/g).length, 1)
  const sql = read('supabase/migrations/20260105_site_pageviews.sql')
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/); assert.match(sql, /REVOKE ALL ON public\.site_pageviews FROM PUBLIC, anon, authenticated/)
  assert.doesNotMatch(sql, /\bip\b|inet|user_agent/)
})

console.log(`\nWebsite analytics: ${passed} checks passed.`)
