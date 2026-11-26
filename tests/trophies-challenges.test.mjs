// tests/trophies-challenges.test.mjs — gamification stage C (migration 20260099): weekly challenges and monthly
// achievements in the built-in list, progress counted within the current week or month, trophies labelled and shown,
// and the database safeguards (awarded once, only after the period, only to people who sell, server-only).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const R = await jiti.import(path.join(root, 'lib/performance/rules.ts'))
const T = await jiti.import(path.join(root, 'lib/dal/trophies.ts'))
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
let passed = 0
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`) }
console.log('TROPHIES AND CHALLENGES')

test('weekly challenges and monthly achievements are built in, each with a week or month window', () => {
  const week = R.BUILTIN_ACHIEVEMENTS.filter((a) => a.window === 'week'), month = R.BUILTIN_ACHIEVEMENTS.filter((a) => a.window === 'month')
  assert.ok(week.length >= 4); assert.ok(month.length >= 3)
  assert.ok(week.every((a) => a.title.startsWith('Weekly challenge: ')))
  assert.equal(new Set(R.BUILTIN_ACHIEVEMENTS.map((a) => a.key)).size, R.BUILTIN_ACHIEVEMENTS.length)
})
test('trophy periods read naturally', () => {
  assert.equal(T.periodLabel({ periodKind: 'week', periodStart: '2026-11-16' }), 'Week of 16 Nov')
  assert.equal(T.periodLabel({ periodKind: 'month', periodStart: '2026-10-01' }), 'October 2026')
})
test('progress on a weekly or monthly one counts only this week or month, and shows it as done once won', () => {
  const dal = read('lib/dal/performance.ts')
  assert.match(dal, /week: periodWindow\('week', now, tz\), month: periodWindow\('month', now, tz\)/)
  assert.match(dal, /const have = \(totals\[base\.window\]/)
  assert.match(dal, /progress: doneThisPeriod \? 1 :/)
})
test('pages: challenges, this month and the trophy cabinet; winners only where the board is visible', () => {
  const page = read('app/(dashboard)/[orgSlug]/performance/achievements/page.tsx')
  for (const id of ['cabinet', 'challenges', 'monthly']) assert.match(page, new RegExp(`id="${id}"`))
  const lb = read('app/(dashboard)/[orgSlug]/performance/leaderboard/page.tsx')
  assert.match(lb, /const winners = managers \|\| everyoneSees \? await latestWinners\(org\.id\) : null/)
})
test('database: awarded once per place and per winner, only after the period, only to sellers, server-only, daily', () => {
  const sql = read('supabase/migrations/20260099_trophies_and_challenges.sql')
  assert.match(sql, /UNIQUE \(org_id, period_kind, period_start, scope, place\)/)
  assert.match(sql, /uq_trophy_person ON public\.performance_trophies \(org_id, period_kind, period_start, profile_id\) WHERE scope = 'person'/)
  assert.match(sql, /uq_trophy_team ON public\.performance_trophies \(org_id, period_kind, period_start, team_id\) WHERE scope = 'team'/)
  assert.match(sql, /IF v_to > now\(\) THEN RAISE EXCEPTION 'period_not_over'/)
  assert.match(sql, /public\.member_can_take_leads\(p_org, t\.profile_id, m\.role\)/)
  assert.match(sql, /ALTER TABLE public\.performance_trophies ENABLE ROW LEVEL SECURITY/)
  assert.match(sql, /REVOKE ALL ON public\.performance_trophies FROM PUBLIC, anon, authenticated/)
  assert.match(sql, /cron\.schedule\('regrow-award-trophies'/)
})

test('perf_rewards is copied verbatim from 20260098 apart from the level-up block', () => {
  const fn = (s) => { const a = s.indexOf('CREATE OR REPLACE FUNCTION public.perf_rewards()'); return s.slice(a, s.indexOf('END $$;', a)) }
  const cut = (f) => f.slice(0, f.indexOf('  -- Level up:')).replace('  v_before INTEGER;\n', '')
  const prev = fn(read('supabase/migrations/20260098_shared_deal_credit.sql')), next = fn(read('supabase/migrations/20260099_trophies_and_challenges.sql'))
  assert.equal(cut(next), cut(prev))
  assert.match(next, /NOT EXISTS \(SELECT 1 FROM public\.notifications n WHERE n\.recipient_profile_id = NEW\.profile_id/)
  assert.ok(!/v_before/.test(next))
})

console.log(`\nTrophies and challenges: ${passed} checks passed.`)
