// tests/performance-rules.test.mjs — sales performance rules (lib/performance/rules.ts) and how they line up with the
// database engine (20260094): the same defaults, the same built-in achievements, valid settings only, levels and
// periods computed correctly, celebrations shown as banners.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const R = await jiti.import(path.join(root, 'lib/performance/rules.ts'))
const A = await jiti.import(path.join(root, 'lib/notifications/lead-alerts.ts'))
const sql = fs.readFileSync(path.join(root, 'supabase/migrations/20260094_performance_engine.sql'), 'utf8')

let passed = 0
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`) }
console.log('SALES PERFORMANCE RULES')

test('the database uses the same default points, cap, levels and missions', () => {
  for (const [k, v] of Object.entries(R.XP_EVENTS)) assert.match(sql, new RegExp(`WHEN '${k}' THEN ${v.default}\\b`), k)
  assert.match(sql, /ELSE 20 END/, 'follow-up cap 20')
  for (const l of R.DEFAULT_LEVELS) assert.ok(sql.includes(`{"name":"${l.name}","xp":${l.xp}}`), l.name)
  for (const m of R.DEFAULT_MISSIONS) assert.ok(sql.includes(`"key":"${m.key}","title":"${m.title}","metric":"${m.metric}","count":${m.count},"xp":${m.xp}`), m.key)
})

test('the built-in achievements match the database list exactly', () => {
  for (const a of R.BUILTIN_ACHIEVEMENTS) {
    assert.ok(sql.includes(`('${a.key}',`), a.key)
    const line = sql.split('\n').find((l) => l.includes(`('${a.key}',`))
    assert.ok(line.includes(`'${a.metric}'`) && line.includes(`'${a.window}'`) && new RegExp(`\\b${a.xp}, '${a.icon}'`).test(line), a.key)
  }
  assert.equal((sql.match(/^\s+\('[a-z0-9_]+',\s*'/gm) ?? []).length, R.BUILTIN_ACHIEVEMENTS.length)
})

test('settings: defaults; bad values refused with reasons; stored with the cap where the database reads it', () => {
  assert.deepEqual(R.gamificationFromStored({}), R.DEFAULT_GAMIFICATION)
  const bad = R.normaliseGamification({ xp: { deal_closed: 5000 }, followUpDailyCap: -1, levels: [{ name: 'Only', xp: 10 }], missions: [{ title: '', metric: 'revenue', count: 0 }] })
  assert.ok(bad.errors['xp.deal_closed'] && bad.errors.followUpDailyCap && bad.errors.levels && bad.errors['missions.0'])
  assert.deepEqual(bad.value.levels, R.DEFAULT_LEVELS, 'a bad level list keeps the old one')
  const ok = R.normaliseGamification({ levels: [{ name: 'Pro', xp: 500 }, { name: 'New', xp: 0 }], leaderboard: { visibleTo: 'managers', show: { revenue: true } } })
  assert.deepEqual(ok.errors, {})
  assert.deepEqual(ok.value.levels.map((l) => l.name), ['New', 'Pro'], 'sorted by points')
  assert.equal(ok.value.leaderboard.visibleTo, 'managers')
  assert.equal(ok.value.leaderboard.show.revenue, true)
  assert.deepEqual(R.gamificationToStored(R.DEFAULT_GAMIFICATION).caps, { follow_up_done: 20 })
  assert.equal(R.gamificationFromStored({ caps: { follow_up_done: 7 } }).followUpDailyCap, 7, 'reads back what it stores')
})

test('levels: current, next, progress and points to go', () => {
  assert.equal(R.levelFor(0).level.name, 'Beginner')
  const l = R.levelFor(400)
  assert.equal(l.level.name, 'Rising Star')
  assert.equal(l.next.name, 'Performer')
  assert.equal(l.toNext, 200)
  assert.equal(l.progress, 0.5)
  const top = R.levelFor(99999)
  assert.equal(top.level.name, 'Sales Champion'); assert.equal(top.next, null); assert.equal(top.progress, 1)
})

test('periods follow the workspace time zone (India by default), weeks start on Monday', () => {
  const now = new Date('2026-11-25T20:00:00Z') // 26 Nov, 01:30 in India (a Thursday)
  const day = R.periodWindow('day', now)
  assert.equal(day.from.toISOString(), '2026-11-25T18:30:00.000Z')
  assert.equal(day.to.toISOString(), '2026-11-26T18:30:00.000Z')
  assert.equal(R.periodWindow('week', now).from.toISOString(), '2026-11-22T18:30:00.000Z', 'Monday 23 Nov, India')
  assert.equal(R.periodWindow('month', now).from.toISOString(), '2026-10-31T18:30:00.000Z')
})

test('celebrations appear as banners with their own sound; only owners and admins manage performance', () => {
  assert.equal(A.bannerKind('achievement'), 'win')
  assert.equal(A.soundFor('win', A.DEFAULT_LEAD_ALERTS), 'marimba')
  assert.equal(A.soundFor('win', { ...A.DEFAULT_LEAD_ALERTS, sounds: false }), null)
  assert.equal(A.loudest(['win', 'newLead']), 'newLead', 'a new lead matters more than a badge')
  assert.ok(R.canManagePerformance('owner') && R.canManagePerformance('admin'))
  assert.ok(!R.canManagePerformance('manager') && !R.canManagePerformance('sales_exec'))
})

console.log(`\nSales performance rules: ${passed} checks passed.`)
