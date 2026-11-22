// tests/visit-matching-settings.test.mjs — Settings → Site visits and Matching rules (20260077), and the assignment
// log: the rules, and that every place that uses them is wired.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const w = await jiti.import(path.join(root, 'lib/settings/workspace.ts'))
const s = await jiti.import(path.join(root, 'lib/matching/score.ts'))
const { buyerMessageWanted } = await jiti.import(path.join(root, 'lib/jobs/site-visit-notify.ts'))
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8')
let passed = 0
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`) }

console.log('SITE VISIT AND MATCHING SETTINGS')

test('visit settings: messages on by default; distance and daily limit within bounds', () => {
  assert.deepEqual(w.DEFAULT_SETTINGS.visits, { buyerConfirmation: true, buyerReminder24h: true, buyerReminder2h: true, checkinRadiusM: 500, maxPerPersonPerDay: 0 })
  assert.deepEqual(w.normaliseSection('visits', { buyerConfirmation: false, buyerReminder24h: true, buyerReminder2h: false, checkinRadiusM: 1000, maxPerPersonPerDay: 4 }).errors, {})
  assert.ok(w.normaliseSection('visits', { checkinRadiusM: 50, maxPerPersonPerDay: 0 }).errors.checkinRadiusM)
  assert.ok(w.normaliseSection('visits', { checkinRadiusM: 500, maxPerPersonPerDay: 25 }).errors.maxPerPersonPerDay)
  assert.ok(w.normaliseSection('visits', { checkinRadiusM: '500', maxPerPersonPerDay: 0 }).errors.checkinRadiusM, 'numbers only')
})

test('buyer messages follow the switches: confirmations, the day-before and the 2-hour reminders separately', () => {
  const on = w.DEFAULT_SETTINGS.visits
  const off = { ...on, buyerConfirmation: false, buyerReminder2h: false }
  assert.equal(buyerMessageWanted(on, { kind: 'confirmation' }), true)
  assert.equal(buyerMessageWanted(off, { kind: 'confirmation' }), false)
  assert.equal(buyerMessageWanted(off, { kind: 'rescheduled' }), false)
  assert.equal(buyerMessageWanted(off, { kind: 'reminder', minutes_before: 1440 }), true)
  assert.equal(buyerMessageWanted(off, { kind: 'reminder', minutes_before: 120 }), false)
})

test('matching rules: the budget margin decides what is suggested; defaults keep today’s behaviour', () => {
  assert.deepEqual(w.DEFAULT_SETTINGS.matching, { overBudgetPct: 10, minScore: 0, maxSuggestions: 8 })
  assert.ok(w.normaliseSection('matching', { overBudgetPct: 30, minScore: 0, maxSuggestions: 8 }).errors.overBudgetPct)
  const r = { budget_min: null, budget_max: 10_000_000, project_id: null, req_configurations: [], req_categories: [], req_locations: [], req_facing: [], req_min_area: null, req_max_area: null }
  const u = { id: 'u', project_id: 'p', status: 'available', category: 'apartments', bhk_config: '3BHK', facing: null, total_price: 10_800_000, carpet_area: null, super_built_up_area: null, area_value: null, project: null }
  assert.ok(s.scoreUnit(r, u), '8% over is within the default 10%')
  assert.equal(s.scoreUnit(r, u, 0.05), null, 'not within 5%')
  assert.equal(s.scoreUnit(r, u, 0), null, 'never over budget')
  assert.ok(s.scoreUnit(r, { ...u, total_price: 10_000_000 }, 0))
})

test('wiring: scheduling and rescheduling respect the daily limit; the job, calendar and matching read the settings', () => {
  const dal = read('lib/dal/site-visits.ts')
  assert.equal((dal.match(/await overDailyLimit\(/g) ?? []).length, 2, 'schedule and reschedule')
  assert.match(dal, /\.in\('status', \[\.\.\.LIVE_STATUSES, 'completed'\]\)/)
  assert.match(read('lib/jobs/site-visit-notify.ts'), /if \(!buyerMessageWanted\(await visitSettings\(db, v!\.org_id\), job\.payload\)\) return/)
  assert.match(read('app/(dashboard)/[orgSlug]/visits/page.tsx'), /v\.checkin_distance_m > checkinRadius/)
  const m = read('lib/dal/matching.ts')
  assert.equal((m.match(/scoreUnit\([^)]*, tolerance\)/g) ?? []).length, 2)
  assert.equal((m.match(/match\.score >= rules\.minScore/g) ?? []).length, 2)
  assert.match(m, /rank\(scored, limit \?\? rules\.maxSuggestions\)/)
})

test('settings and the assignment log are for the right people', () => {
  for (const p of ['visits', 'matching']) assert.match(read(`app/(dashboard)/[orgSlug]/settings/${p}/page.tsx`), /if \(!isAdmin\) redirect/)
  assert.match(read('app/(dashboard)/[orgSlug]/routing/log/page.tsx'), /if \(!canManageRouting\(role\)\) redirect/)
  assert.match(read('lib/dal/routing.ts'), /from\('lead_routing_decisions'\)[\s\S]*?\.eq\('org_id', orgId\)/)
  assert.match(read('app/api/settings/workspace/route.ts'), /'visits', 'matching'/)
  const mig = read('supabase/migrations/20260077_visit_and_matching_settings.sql')
  assert.match(mig, /ADD COLUMN IF NOT EXISTS visits\s+JSONB NOT NULL DEFAULT '\{\}'::jsonb CHECK/)
  assert.match(mig, /ADD COLUMN IF NOT EXISTS matching JSONB NOT NULL DEFAULT '\{\}'::jsonb CHECK/)
})

console.log(`\nSite visit and matching settings: ${passed} checks passed.`)
