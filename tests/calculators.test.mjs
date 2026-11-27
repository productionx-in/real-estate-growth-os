// tests/calculators.test.mjs — the sales calculators' maths and their workspace settings.
import assert from 'node:assert/strict'
import { createJiti } from 'jiti'
import { readFileSync } from 'node:fs'
const jiti = createJiti(import.meta.url, { alias: { '@': new URL('..', import.meta.url).pathname.replace(/\/$/, '') } })
const F = await jiti.import('../lib/calculators/finance.ts')
const C = await jiti.import('../lib/calculators/settings.ts')
const W = await jiti.import('../lib/settings/workspace.ts')
let n = 0
const test = (name, fn) => { fn(); n++; console.log('  ✓', name) }
console.log('CALCULATORS')

test('EMI: ₹50 L at 8.5% for 20 years is about ₹43,391; 0% spreads evenly', () => {
  assert.equal(Math.round(F.emi(5000000, 8.5, 20)), 43391)
  assert.equal(F.emi(1200000, 0, 10), 10000)
  assert.equal(F.emi(0, 9, 20), 0)
})
test('loan summary: the balance reaches zero and interest = paid − principal', () => {
  const s = F.loanSummary(3000000, 9, 15)
  assert.equal(s.years.length, 15)
  assert.ok(s.years.at(-1).balance < 1)
  assert.ok(Math.abs(s.totalInterest - (s.totalPaid - 3000000)) < 1)
})
test('cost sheet: charges per sq ft scale with area; GST, stamp duty and registration on the agreement value', () => {
  const s = F.costSheet({ area: 1000, rate: 5000, charges: [{ label: 'Parking', kind: 'fixed', amount: 300000 }, { label: 'PLC', kind: 'per_area', amount: 100 }], gstPct: 5, stampDutyPct: 6, registrationPct: 1 })
  assert.equal(s.base, 5000000)
  assert.equal(s.agreementValue, 5400000)
  assert.equal(s.gst, 270000); assert.equal(s.stampDuty, 324000); assert.equal(s.registration, 54000)
  assert.equal(s.total, 6048000)
  assert.equal(s.allInPerArea, 6048)
})
test('affordability: no room for an EMI means no loan; more income, bigger loan', () => {
  assert.equal(F.maxLoan(50000, 30000, 50, 9, 20), 0)
  assert.ok(F.maxLoan(200000, 0, 50, 9, 20) > F.maxLoan(100000, 0, 50, 9, 20))
})
test('area units: 1 acre = 43,560 sq ft = 40 guntas = 100 cents', () => {
  assert.equal(F.convertArea(1, 'acre', 'sqft'), 43560)
  assert.equal(Math.round(F.convertArea(1, 'acre', 'gunta')), 40)
  assert.equal(Math.round(F.convertArea(1, 'acre', 'cent')), 100)
  assert.equal(F.convertArea(9, 'sqft', 'sqyd'), 1)
})
test('settings: out-of-range numbers are refused; blank charges dropped; older rows read as defaults', () => {
  assert.ok(C.normaliseCalculators({ ...C.DEFAULT_CALCULATORS, loanRatePct: 45 }).errors.loanRatePct)
  assert.ok(C.normaliseCalculators({ ...C.DEFAULT_CALCULATORS, gstPct: -1 }).errors.gstPct)
  const v = C.normaliseCalculators({ ...C.DEFAULT_CALCULATORS, charges: [{ label: '  ', kind: 'fixed', amount: 5 }, { label: 'Club', kind: 'per_area', amount: 50 }] }).value
  assert.deepEqual(v.charges, [{ label: 'Club', kind: 'per_area', amount: 50 }])
  assert.deepEqual(C.calculatorsFromStored({}), C.DEFAULT_CALCULATORS)
  assert.deepEqual(W.settingsFromRow({}).calculators, C.DEFAULT_CALCULATORS)
  assert.equal(W.normaliseSection('calculators', { ...C.DEFAULT_CALCULATORS, tenureYears: 25 }).value.tenureYears, 25)
})
test('wiring: saved through the workspace settings API (owners and admins); column added by migration', () => {
  assert.match(readFileSync('app/api/settings/workspace/route.ts', 'utf8'), /'calculators'\]\)/)
  assert.match(readFileSync('supabase/migrations/20260111_calculator_settings.sql', 'utf8'), /ADD COLUMN IF NOT EXISTS calculators JSONB/)
  assert.match(readFileSync('lib/dal/workspace-settings.ts', 'utf8'), /alerts, calculators'/)
})
console.log(`Calculators: ${n} checks passed.`)
