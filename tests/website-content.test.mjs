// tests/website-content.test.mjs — the public website's content rules (module test on the real sources):
// every mapped page exists; capability references are real and publishable; titles and descriptions are unique and
// sized for search results; no unapproved prices, invented trust signals or unqualified promises.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8')
const { SITE_PAGES } = await jiti.import(path.join(root, 'lib/marketing/site-pages.ts'))
const { CAPABILITIES } = await jiti.import(path.join(root, 'lib/marketing/capabilities.ts'))
let passed = 0
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`) }

const fileFor = (p) => (p === '/' ? 'app/page.tsx' : `app${p}/page.tsx`)
const pages = ['/', ...SITE_PAGES.map((p) => p.path)].map((p) => ({ path: p, file: fileFor(p), src: read(fileFor(p)) }))

console.log('WEBSITE CONTENT')

test('every page in the site map has a page', () => {
  for (const p of pages) assert.ok(p.src.length > 0, p.file)
})

test('capability ids used on pages exist and are publishable (never not_available)', () => {
  for (const p of pages) {
    for (const m of p.src.matchAll(/ids: \[([^\]]*)\]/g)) {
      for (const id of m[1].match(/'([a-z_]+)'/g)?.map((x) => x.slice(1, -1)) ?? []) {
        assert.ok(CAPABILITIES[id], `${p.file}: unknown capability ${id}`)
        assert.notEqual(CAPABILITIES[id].status, 'not_available', `${p.file}: ${id} is not available`)
      }
    }
  }
})

test('capabilities that need setup or are partial carry a public note', () => {
  for (const c of Object.values(CAPABILITIES)) {
    if (c.status === 'needs_setup' || c.status === 'partial') assert.ok(c.publicNote, c.id)
  }
})

test('product and article pages: unique titles and descriptions, sized for search results', () => {
  const titles = new Map(), descs = new Map()
  for (const p of pages) {
    const t = p.src.match(/metaTitle: '([^']+)'/)?.[1] ?? p.src.match(/\n  title: '([^']+)'/)?.[1]
    const d = p.src.match(/(?:metaDescription|description): ?\n?\s*'([^']+)'/)?.[1]
    if (t) { assert.ok(t.length <= 80, `${p.file} title ${t.length} chars`); assert.ok(!titles.has(t), `duplicate title ${t}`); titles.set(t, p.file) }
    if (d) { assert.ok(d.length >= 70 && d.length <= 200, `${p.file} description ${d.length} chars`); assert.ok(!descs.has(d), `duplicate description in ${p.file}`); descs.set(d, p.file) }
  }
  assert.ok(titles.size >= 12, `titles found: ${titles.size}`)
})

test('no prices on public pages while prices are unpublished', () => {
  // A line may format a price only when it is gated on PRICES_PUBLISHED.
  for (const p of pages) assert.doesNotMatch(p.src.split('\n').filter((l) => !l.includes('PRICES_PUBLISHED')).join('\n'), /₹\s?\d|formatInr\(/, p.file)
  assert.match(read('components/marketing/PricingPlans.tsx'), /!PRICES_PUBLISHED \?/)
  assert.match(read('components/marketing/RoiCalculator.tsx'), /PRICES_PUBLISHED && \(/)
})

test('no invented trust signals or unqualified promises', () => {
  const banned = /aggregateRating|reviewCount|ratingValue|\b(?:#1|number one|best-in-class|award-winning|guarantee[ds]?|trusted by \d|\d+\+? (?:customers|developers|clients))\b|automatic migration|migrates automatically|any CRM|all CRMs|live in a day/i
  for (const f of [...pages.map((p) => p.file), 'components/marketing/JsonLd.tsx', 'components/marketing/ProductPage.tsx', 'lib/marketing/capabilities.ts', 'app/llms.txt/route.ts']) {
    const src = read(f).replace(/^\s*\/\/.*$/gm, '')
    assert.doesNotMatch(src, banned, f)
  }
})

test('one h1 per page template; FAQ answers are visible text, not hidden structured data', () => {
  for (const f of ['components/marketing/ProductPage.tsx', 'components/marketing/ArticlePage.tsx']) assert.equal((read(f).match(/<h1[\s>]/g) ?? []).length, 1, f)
  assert.doesNotMatch(read('components/marketing/JsonLd.tsx').replace(/^\s*\/\/.*$/gm, ''), /FAQPage/)
})

test('internal links on public pages point at real pages', () => {
  const known = new Set(['/', ...SITE_PAGES.map((p) => p.path), '/login', '/privacy', '/terms', '/refund-policy', '/contact'])
  for (const f of [...pages.map((p) => p.file), 'components/marketing/ProductPage.tsx', 'components/marketing/ArticlePage.tsx', 'components/marketing/MarketingHeader.tsx']) {
    for (const m of read(f).matchAll(/(?:href[=:] ?\{?['"`]|href: ')(\/[a-z0-9\-/]*)/g)) {
      assert.ok(known.has(m[1].replace(/\/$/, '') || '/'), `${f}: link to unknown page ${m[1]}`)
    }
  }
})

console.log(`\nWebsite content: ${passed} checks passed.`)
