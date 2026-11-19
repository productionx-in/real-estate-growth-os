// tests/website-claims.test.mjs — the public website must not claim what the product does not do, nor hide what it
// does (docs/marketing/WEBSITE_SEO_AUDIT_2026-11.md §I). Module test: reads the real page sources and price data.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const { PUBLIC_PLANS } = await jiti.import(path.join(root, 'lib/marketing/pricing.ts'))
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8')
let passed = 0
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`) }

const home = read('app/page.tsx')
const features = PUBLIC_PLANS.flatMap((p) => p.features.map((f) => ({ plan: p.id, ...f })))

console.log('WEBSITE CLAIMS')

test('built features are not labelled "coming soon"', () => {
  for (const built of [/follow-up reminders/i, /speed-to-lead/i, /escalat/i]) {
    assert.deepEqual(features.filter((f) => built.test(f.text) && f.soon), [], String(built))
  }
  assert.doesNotMatch(home, /coming next/i)
})

test('unbuilt features are not listed at all (no SSO, no custom roles)', () => {
  assert.deepEqual(features.filter((f) => /single sign-on|custom roles/i.test(f.text)), [])
})

test('sources that need third-party setup are shown separately and say so', () => {
  const ready = home.match(/const SOURCES = \[([^\]]*)\]/)[1]
  for (const needsSetup of ['Meta', 'Google', 'WhatsApp', '99acres', 'MagicBricks', 'Housing.com']) {
    assert.doesNotMatch(ready, new RegExp(needsSetup), `${needsSetup} is not "ready to use"`)
  }
  assert.match(home, /SOURCES_WITH_SETUP/)
  assert.match(home, /need[s]? (your business account|API access)/)
})

test('no unproven speed or setup-time promises', () => {
  assert.doesNotMatch(home, /Live in a day|live in a day/)
})

test('agencies are not promised a free workspace (each organisation has its own plan, DEC-022)', () => {
  assert.doesNotMatch(read('app/pricing/page.tsx'), /free workspace/i)
})

test('demo page does not show unfinished features', () => {
  assert.doesNotMatch(read('components/marketing/DemoRequestForm.tsx'), /being set up/i)
})

test('legal pages exist, are linked from the footer, and stay out of search until confirmed', () => {
  const footer = read('components/marketing/MarketingFooter.tsx')
  assert.match(footer, /href="\/privacy"/); assert.match(footer, /href="\/terms"/)
  for (const f of ['app/privacy/page.tsx', 'app/terms/page.tsx']) assert.match(read(f), /robots: LEGAL\.confirmed \? undefined : \{ index: false/)
  // Every service provider the code uses is named in the Privacy Policy list.
  const legal = read('lib/legal.ts')
  for (const provider of ['Supabase', 'Vercel', 'Resend', 'Razorpay']) assert.match(legal, new RegExp(`name: '${provider}'`))
})

console.log(`\nWebsite claims: ${passed} checks passed.`)
