// tests/team-structure.test.mjs — team structure (lib/teams/structure.ts, migration 20260097): team totals, ranking,
// team achievements, input checks, and that the pages and API follow the workspace switch and the roles.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const T = await jiti.import(path.join(root, 'lib/teams/structure.ts'))
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
let passed = 0
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`) }
console.log('TEAM STRUCTURE')

const per = new Map([
  ['a', { assigned: 10, contacted: 8, closed: 2, deals: 2, revenue: 2e7, xp: 300, meetings: 3, follow_ups: 5 }],
  ['b', { assigned: 5, contacted: 5, closed: 1, deals: 1, revenue: 5e6, xp: 100, meetings: 1, follow_ups: 2 }],
  ['c', { assigned: 4, contacted: 2, closed: 3, deals: 3, revenue: 1e6, xp: 90, meetings: 0, follow_ups: 0 }],
])

test('a team’s numbers are the sum of its members’ recorded work; a person counts once; conversion follows', () => {
  const t = T.teamTotals(['a', 'b', 'a'], per)
  assert.equal(t.members, 2); assert.equal(t.closed, 3); assert.equal(t.revenue, 2.5e7); assert.equal(t.xp, 400)
  assert.equal(t.conversionPct, 20)
  assert.equal(T.teamTotals([], per).conversionPct, null)
})

test('ranking: deals closed, then revenue, then points per person (size alone does not win); ties share a rank', () => {
  const big = { name: 'Big', totals: T.teamTotals(['a', 'b'], per) }      // 3 closed, ₹2.5 Cr
  const small = { name: 'Small', totals: T.teamTotals(['c'], per) }       // 3 closed, ₹10 L
  const twin = { name: 'Twin', totals: T.teamTotals(['c'], per) }
  const r = T.rankTeams([small, twin, big])
  assert.deepEqual(r.map((x) => [x.name, x.rank]), [['Big', 1], ['Small', 2], ['Twin', 2]])
  assert.equal(r[0].xpPerMember, 200)
})

test('team achievements unlock from all-time totals and show progress', () => {
  const a = T.teamAchievements(T.teamTotals(['a', 'b', 'c'], per))
  const by = Object.fromEntries(a.map((x) => [x.key, x]))
  assert.ok(by.team_first_booking.unlocked); assert.ok(!by.team_10_bookings.unlocked); assert.equal(by.team_10_bookings.progress, 0.6)
  assert.ok(by.team_1cr.unlocked, '₹2.6 Cr booked'); assert.ok(!by.team_10cr.unlocked)
})

test('input checks: a name, unique ids, at most 50 projects; leaders come from managing roles', () => {
  const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
  const ok = T.normaliseTeam({ name: '  Skyline   team ', memberIds: [id(1), id(1), id(2), 'x'], projectIds: [id(3)], leaderProfileId: id(4) })
  assert.equal(ok.error, null); assert.equal(ok.value.name, 'Skyline team'); assert.deepEqual(ok.value.memberIds, [id(1), id(2)])
  assert.ok(T.normaliseTeam({ name: '' }).error)
  assert.ok(T.normaliseTeam({ name: 'X', projectIds: Array.from({ length: 51 }, (_, i) => id(i + 1)) }).error)
  assert.deepEqual([...T.LEADER_ROLES], ['owner', 'admin', 'manager', 'team_lead'])
  assert.match(read('supabase/migrations/20260097_team_structure.sql'), /IF v_role NOT IN \('owner', 'admin', 'manager', 'team_lead'\) THEN/, 'the database agrees')
})

test('wiring: the API checks the role and the switch; pages appear only with team structure on; leaders see their team', () => {
  for (const f of ['app/api/teams/route.ts', 'app/api/teams/[teamId]/route.ts']) {
    const s = read(f)
    assert.match(s, /authorizeOrgAccess\((parsed\.data\.)?orgId, \[\.\.\.TEAM_MANAGERS\]\)/, f)
    assert.match(s, /\.teamsEnabled\)/, f)
    assert.match(s, /auditMember\(/, f)
    assert.doesNotMatch(s, /^export const /m, `${f}: route files export handlers only`)
  }
  assert.match(read('app/(dashboard)/[orgSlug]/teams/page.tsx'), /if \(!sales\.teamsEnabled\) \{/)
  assert.match(read('app/(dashboard)/[orgSlug]/performance/team/page.tsx'), /sales\.teamsEnabled \? \(await listTeamStructure\(org\.id\)\)/)
  assert.match(read('app/(dashboard)/[orgSlug]/performance/leaderboard/page.tsx'), /const byTeams = sales\.teamsEnabled && sp\.by === 'teams'/)
  assert.match(read('lib/dal/viewer.ts'), /\.eq\('leader_profile_id', profileId\)/, 'a leader sees the teams they lead')
  assert.match(read('supabase/migrations/20260097_team_structure.sql'), /t\.leader_profile_id = p_a AND m\.profile_id = p_b\) OR \(t\.leader_profile_id = p_b AND m\.profile_id = p_a/)
})

console.log(`\nTeam structure: ${passed} checks passed.`)
