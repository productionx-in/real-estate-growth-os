// tests/performance-ui.test.mjs — Performance pages and APIs (lib/dal/performance.ts, app/api/performance/*,
// app/(dashboard)/[orgSlug]/performance/*): counting from the ledger, which target applies to whom, period windows,
// and the security wiring (every write is owner/admin, audited; pages hide what roles may not see).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const D = await jiti.import(path.join(root, 'lib/dal/performance.ts'))
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')

let passed = 0
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`) }
console.log('PERFORMANCE PAGES AND APIS')

const ev = (profile_id, kind, units = 1, xp = 0, value = 0) => ({ profile_id, kind, units, xp, value, occurred_at: '2026-11-25T10:00:00Z', detail: null })

test('counting: contacts, deals net of reversals, revenue net of cancellations, points', () => {
  const t = D.tally([
    ev('a', 'lead_assigned'), ev('a', 'first_contact', 1, 10), ev('a', 'deal_closed', 1, 100), ev('a', 'deal_reversed', -1, -100),
    ev('a', 'deal_closed', 1, 100), ev('a', 'revenue', 0, 0, 5000000), ev('a', 'revenue', 0, 0, -5000000), ev('a', 'revenue', 0, 0, 9000000),
    ev('a', 'mission', 1, 20), ev('b', 'follow_up_done', 1, 5),
  ])
  assert.deepEqual(t.get('a'), { assigned: 1, contacted: 1, follow_ups: 0, meetings: 0, closed: 1, revenue: 9000000, xp: 130, missions: 1, targets: 0 })
  assert.equal(t.get('b').follow_ups, 1)
})

test('which target applies: personal over team over everyone; dates and retired targets respected', () => {
  const base = { amount: 10, period: 'month', ends_on: null, archived_at: null, updated_at: '2026-11-01', team_id: null, profile_id: null }
  const all = [
    { ...base, id: 'e', scope: 'everyone', metric: 'contacted', amount: 50, starts_on: '2026-11-01' },
    { ...base, id: 't', scope: 'team', team_id: 'T1', metric: 'contacted', amount: 30, starts_on: '2026-11-01' },
    { ...base, id: 'm', scope: 'member', profile_id: 'asha', metric: 'contacted', amount: 20, starts_on: '2026-11-01' },
    { ...base, id: 'old', scope: 'member', profile_id: 'asha', metric: 'closed', amount: 5, starts_on: '2026-10-01', ends_on: '2026-10-31' },
    { ...base, id: 'gone', scope: 'everyone', metric: 'meetings', amount: 5, starts_on: '2026-11-01', archived_at: '2026-11-20' },
    { ...base, id: 'wk', scope: 'everyone', metric: 'contacted', period: 'week', amount: 12, starts_on: '2026-11-01' },
  ]
  assert.deepEqual(D.targetsFor(all, 'asha', ['T1'], '2026-11-25').map((t) => t.id).sort(), ['m', 'wk'])
  assert.deepEqual(D.targetsFor(all, 'ravi', ['T1'], '2026-11-25').map((t) => t.id).sort(), ['t', 'wk'])
  assert.deepEqual(D.targetsFor(all, 'neha', [], '2026-11-25').map((t) => t.id).sort(), ['e', 'wk'])
})

test('custom-date targets cover whole days in the workspace time zone', () => {
  const w = D.targetWindow({ period: 'custom', starts_on: '2026-11-10', ends_on: '2026-11-20' }, new Date('2026-11-25T00:00:00Z'), 'Asia/Kolkata')
  assert.equal(w.from.toISOString(), '2026-11-09T18:30:00.000Z')
  assert.equal(w.to.toISOString(), '2026-11-20T18:30:00.000Z')
})

test('money reads like people say it', () => {
  assert.equal(D.fmtAmount('revenue', 25000000), '₹2.5 Cr')
  assert.equal(D.fmtAmount('revenue', 850000), '₹8.5 L')
  assert.equal(D.fmtAmount('contacted', 3), '3 leads')
})

test('every write is owner/admin only and audited; points can only be corrected with a reason', () => {
  for (const f of ['app/api/performance/settings/route.ts', 'app/api/performance/targets/route.ts', 'app/api/performance/targets/[targetId]/route.ts', 'app/api/performance/achievements/route.ts', 'app/api/performance/adjust/route.ts']) {
    const s = read(f)
    assert.match(s, /authorizeOrgAccess\([^)]*\['owner', 'admin'\]\)/, f)
    assert.match(s, /auditMember\(/, f)
  }
  assert.match(read('app/api/performance/targets/[targetId]/route.ts'), /\.eq\('org_id', parsed\.data\.orgId\)/, 'a target is changed only inside its workspace')
  const adj = read('app/api/performance/adjust/route.ts')
  assert.match(adj, /reason: z\.string\(\)\.trim\(\)\.min\(5\)/)
  assert.match(adj, /p_units: 0/, 'a correction changes points, never counts')
})

test('pages: read-only and post-sales see none; only managers look at others; colleagues see what the workspace allows', () => {
  for (const f of ['app/(dashboard)/[orgSlug]/performance/page.tsx', 'app/(dashboard)/[orgSlug]/performance/leaderboard/page.tsx', 'app/(dashboard)/[orgSlug]/performance/achievements/page.tsx']) {
    assert.match(read(f), /role === 'readonly' \|\| role === 'post_sales'\) notFound\(\)/, f)
  }
  assert.match(read('app/(dashboard)/[orgSlug]/performance/page.tsx'), /if \(!isManagement\(role\)\) notFound\(\)/)
  const lb = read('app/(dashboard)/[orgSlug]/performance/leaderboard/page.tsx')
  assert.match(lb, /const show = managers \? \{ xp: true, contacted: true, closed: true, revenue: true, target: true \} : settings\.leaderboard\.show/)
  assert.match(lb, /managers \|\| everyoneSees \? rows : rows\.filter\(\(r\) => r\.profileId === profile\.id\)/)
  assert.match(read('app/(dashboard)/[orgSlug]/performance/manage/page.tsx'), /if \(!canManagePerformance\(role\)\) redirect/)
})

console.log(`\nPerformance pages and APIs: ${passed} checks passed.`)
