// tests/legal-pages.test.mjs — the legal and company pages never state an unconfirmed fact. Unknown company details
// and undecided refund terms render as marked placeholders; the pages stay out of search engines until confirmed;
// refund wording promises only what the product does. Module test on the real sources (jiti).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const L = await jiti.import(path.join(root, 'lib/legal.ts'))
const U = await jiti.import(path.join(root, 'lib/site/urls.ts'))
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8')
const PAGES = { '/privacy': 'app/privacy/page.tsx', '/terms': 'app/terms/page.tsx', '/refund-policy': 'app/refund-policy/page.tsx', '/contact': 'app/contact/page.tsx' }
let passed = 0
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`) }

console.log('LEGAL PAGES')

test('no company fact is assumed: unconfirmed values are null and the pages say so', () => {
  if (!L.LEGAL.confirmed) {
    for (const k of ['legalName', 'cin', 'registeredAddress', 'privacyEmail', 'supportEmail', 'salesEmail', 'phone', 'grievanceOfficer', 'jurisdictionCity']) {
      assert.equal(L.LEGAL[k], null, `${k} must stay null until INFYN Group supplies it`)
    }
    assert.ok(L.missingLegalFacts().length >= 7)
  }
  assert.equal(L.legalEntity(), L.LEGAL.legalName ?? 'INFYN Group', 'the trading name is used until the registered name is confirmed')
})

test('page sources contain no hard-coded email, phone, address, CIN or court city', () => {
  for (const f of Object.values(PAGES)) {
    const src = read(f).replace(/^\s*\/\/.*$/gm, '')
    assert.doesNotMatch(src, /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i, `${f}: email`)
    assert.doesNotMatch(src, /\+91[\s-]?\d|\b\d{10}\b/, `${f}: phone`)
    assert.doesNotMatch(src, /\b[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}\b/, `${f}: CIN`)
    assert.doesNotMatch(src, /Private Limited|Pvt\.? Ltd/i, `${f}: legal name`)
    assert.doesNotMatch(src, /courts? (at|of) (Mumbai|Delhi|Bengaluru|Bangalore|Chennai|Hyderabad|Pune|Kolkata)/i, `${f}: jurisdiction`)
  }
})

test('legal pages: noindex until confirmed, canonical set, public, light, linked from the footer', () => {
  const footer = read('components/marketing/MarketingFooter.tsx')
  for (const [p, f] of Object.entries(PAGES)) {
    const src = read(f)
    assert.match(src, /robots: LEGAL\.confirmed \? undefined : \{ index: false/, `${f} noindex until confirmed`)
    assert.match(src, new RegExp(`canonical: '${p.replace('/', '\\/')}'`), `${f} canonical`)
    assert.ok(U.LEGAL_PATHS.includes(p), `${p} in LEGAL_PATHS (public in the proxy)`)
    assert.match(footer, new RegExp(`href: '${p.replace('/', '\\/')}'`), `${p} in the footer`)
  }
  assert.match(read('app/sitemap.ts'), /LEGAL\.confirmed \? LEGAL_PATHS/, 'sitemap lists them only once confirmed')
  assert.match(read('lib/theme/runtime.ts'), /refund-policy/)
})

test('refund policy promises only what the product does; undecided terms are placeholders', () => {
  const src = read('app/refund-policy/page.tsx')
  for (const k of Object.keys(L.REFUND_TERMS)) assert.match(src, new RegExp(`REFUND_TERMS\\.${k}`), `uses REFUND_TERMS.${k}`)
  assert.doesNotMatch(src, /\b\d+\s*(?:–|-|to)\s*\d+\s*(working )?days\b/i, 'no bank timing promises')
  assert.doesNotMatch(src, /100% refund|money-back guarantee|no questions asked/i)
  assert.match(src, /at least 24 hours before each debit/, 'mandate notice matches the product (billing_settings ≥ 24 h)')
  assert.match(src, /other than the person who requested it/, 'approval rule matches the product')
  assert.match(read('app/terms/page.tsx'), /href="\/refund-policy"/, 'Terms point to the refund policy')
})

test('privacy policy lists a payment provider only when it processes data', () => {
  const pending = L.PENDING_SUBPROCESSORS.find((p) => p.name.startsWith('Cashfree'))
  assert.equal(pending.active, false, 'Cashfree is not active yet')
  assert.ok(!L.SUBPROCESSORS.some((s) => s.name.startsWith('Cashfree')))
  assert.match(read('app/privacy/page.tsx'), /PENDING_SUBPROCESSORS\.filter\(\(s\) => s\.active\)/)
})

console.log(`\nLegal pages: ${passed} checks passed.`)
