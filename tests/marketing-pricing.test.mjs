// tests/marketing-pricing.test.mjs — price list and ROI maths behind /pricing (real lib/marketing/pricing.ts via jiti).
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const m = await jiti.import(path.join(root, 'lib/marketing/pricing.ts'))

let passed = 0
const test = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`) }
const leads = m.PUBLIC_PLANS.find((p) => p.id === 'leads')
const agencies = m.PUBLIC_PLANS.find((p) => p.id === 'agencies')
const enterprise = m.PUBLIC_PLANS.find((p) => p.id === 'enterprise')

console.log('MARKETING PRICING')
test('REGrow Leads list price matches BUSINESS_MODEL: ₹12,000 incl. 10 users, ₹900 extra, annual = 10 months', () => {
  assert.deepEqual([leads.monthlyInr, leads.includedUsers, leads.extraUserInr, leads.annualInr], [12000, 10, 900, 120000])
})
test('monthly price adds extra users only above the included seats', () => {
  assert.equal(m.monthlyPriceFor(leads, 1), 12000)
  assert.equal(m.monthlyPriceFor(leads, 10), 12000)
  assert.equal(m.monthlyPriceFor(leads, 15), 12000 + 5 * 900)
  assert.equal(m.monthlyPriceFor(agencies, 7), 4999 + 2 * 600)
  assert.equal(m.monthlyPriceFor(enterprise, 200), null)
})
test('every plan maps to a plan code the public onboarding endpoint accepts', () => {
  for (const p of m.PUBLIC_PLANS) assert.ok(['free', 'starter', 'growth', 'enterprise'].includes(p.requestPlanCode), p.id)
  assert.equal(agencies.companyType, 'channel_partner')
})
test('ROI: ₹5L spend, 1,000 leads, 30% leak, 50% recovered, 10 users', () => {
  const r = m.estimateRoi({ monthlySpendInr: 500000, monthlyLeads: 1000, leakagePct: 30, recoveryPct: 50, users: 10 })
  assert.equal(r.costPerLead, 500)
  assert.equal(r.leadsLost, 300)
  assert.equal(r.spendWasted, 150000)
  assert.equal(r.leadsRecovered, 150)
  assert.equal(r.spendRecovered, 75000)
  assert.equal(r.subscription, 12000)
  assert.equal(r.multiple, 6.25)
})
test('ROI clamps nonsense input instead of producing NaN or negatives', () => {
  const r = m.estimateRoi({ monthlySpendInr: -5, monthlyLeads: 0, leakagePct: 250, recoveryPct: NaN, users: 0 })
  for (const v of Object.values(r)) assert.ok(Number.isFinite(v) && v >= 0, JSON.stringify(r))
  assert.equal(r.subscription, 12000)
})
test('features marked soon are labelled, and live ones are not', () => {
  const soon = m.PUBLIC_PLANS.flatMap((p) => p.features.filter((f) => f.soon).map((f) => f.text))
  assert.ok(soon.some((t) => /reminder/i.test(t)), 'follow-up reminders are not live yet and must be marked soon')
  assert.ok(soon.some((t) => /sign-on/i.test(t)))
  assert.ok(!soon.some((t) => /routing/i.test(t)), 'routing is live')
})
test('formatInr uses Indian digit grouping', () => {
  assert.equal(m.formatInr(120000), '₹1,20,000')
})
console.log(`\nALL ${passed} MARKETING PRICING TESTS PASSED`)
