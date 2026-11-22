// tests/team-pages.test.mjs — team pages (Group F): monthly targets (lib/team/targets.ts), the roles grid
// (lib/auth/capabilities.ts) staying in step with the real permission rules, and the team APIs' safeguards.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const t = await jiti.import(path.join(root, 'lib/team/targets.ts'))
const cap = await jiti.import(path.join(root, 'lib/auth/capabilities.ts'))
const perm = await jiti.import(path.join(root, 'lib/auth/permissions.ts'))
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8')
let passed = 0
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`) }

console.log('TEAM PAGES')

test('months are India-time calendar months', () => {
  assert.equal(t.monthKey(new Date('2026-11-30T19:00:00Z')), '2026-12-01', '00:30 IST on 1 Dec is December')
  assert.equal(t.monthKey(new Date('2026-11-30T18:00:00Z')), '2026-11-01')
  assert.equal(t.nextMonthKey('2026-12-01'), '2027-01-01'); assert.equal(t.nextMonthKey('2026-03-01'), '2026-04-01')
  const r = t.monthRange('2026-11-01')
  assert.equal(r.from.toISOString(), '2026-10-31T18:30:00.000Z'); assert.equal(r.to.toISOString(), '2026-11-30T18:30:00.000Z')
  assert.equal(t.isMonthKey('2026-11-01'), true); assert.equal(t.isMonthKey('2026-11-02'), false); assert.equal(t.isMonthKey('2026-13-01'), false)
})

test('targets: blank means none, whole numbers in range only; progress and pace', () => {
  assert.deepEqual(t.normaliseTargets({ siteVisits: '12', bookings: '', bookingValue: 50000000 }).value, { siteVisits: 12, bookings: null, bookingValue: 50000000 })
  assert.ok(t.normaliseTargets({ siteVisits: '-1' }).errors.siteVisits)
  assert.ok(t.normaliseTargets({ bookings: 1.5 }).errors.bookings)
  assert.equal(t.percent(5, 10), 50); assert.equal(t.percent(15, 10), 100); assert.equal(t.percent(3, null), null); assert.equal(t.percent(0, 0), 100)
  assert.equal(t.expectedByNow('2026-11-01', new Date('2026-11-15T18:30:00Z')), 50)
})

test('the roles grid is computed from the rules the server enforces', () => {
  const rowOf = (label) => cap.CAPABILITIES.find((c) => c.label === label)
  for (const r of perm.MEMBER_ROLES) {
    assert.equal(rowOf('Add leads by hand').cells[r].level === 'yes', perm.canCreateLeads(r), r)
    assert.equal(rowOf('Routing rules and speed-to-lead').cells[r].level === 'yes', perm.canManageRouting(r), r)
    assert.equal(rowOf('Receive new leads').cells[r].level === 'yes', perm.ASSIGNABLE_ROLES.includes(r), r)
    assert.equal(rowOf('Work leads (calls, notes, follow-ups, documents)').cells[r].level !== 'no', perm.canWriteSales(r), r)
  }
  assert.equal(rowOf('See leads').cells.sales_exec.note, 'Their own')
  assert.equal(rowOf('Assign and reassign leads').cells.team_lead.level, 'partial')
  // Rows that claim owner/admin only match the routes that enforce them.
  assert.match(read('app/api/leads/[leadId]/route.ts'), /authorizeLeadAccess\(leadId, \['owner', 'admin'\]\)/)
  assert.match(read('app/api/projects/[projectId]/route.ts'), /authorizeProjectAccess\(projectId, \['owner', 'admin', 'manager'\]\)/)
  assert.ok(!cap.CAPABILITIES.some((c) => /ownership/i.test(c.label)), 'no row for a feature that does not exist')
})

test('password-reset e-mail: owners and admins, never yourself, owners only by an owner, rate-limited, audited', () => {
  const r = read('app/api/team/members/reset-password/route.ts')
  assert.match(r, /authorizeOrgAccess\(orgId, \['owner', 'admin'\]\)/)
  assert.match(r, /member\.profile_id === access\.context\.profile\.id/)
  assert.match(r, /member\.role === 'owner' && access\.context\.role !== 'owner'/)
  assert.match(r, /\.eq\('org_id', orgId\)\.eq\('id', memberId\)\.eq\('status', 'active'\)/)
  assert.match(r, /10 \* 60_000/)
  assert.match(r, /'member\.password_reset_sent'/)
  assert.doesNotMatch(r, /generateLink|updateUserById/, 'never sets or exposes a password or link')
})

test('targets API and team page: managers and above, members of this workspace only; no platform-wide user listing', () => {
  const api = read('app/api/team/targets/route.ts')
  assert.match(api, /authorizeOrgAccess\(orgId, \['owner', 'admin', 'manager'\]\)/)
  assert.match(api, /\.eq\('org_id', orgId\)\.eq\('profile_id', profileId\)\.eq\('status', 'active'\)/)
  assert.match(api, /'member\.targets_set'/)
  const page = read('app/(dashboard)/[orgSlug]/team/page.tsx')
  assert.doesNotMatch(page, /listUsers/, 'no longer lists every account on the platform')
  assert.match(read('lib/dal/team.ts'), /admin\.getUserById\(id\)/)
  const m = read('supabase/migrations/20260078_team_targets.sql')
  assert.match(m, /ENABLE ROW LEVEL SECURITY;\s*REVOKE ALL ON public\.member_targets FROM PUBLIC, anon, authenticated;/)
  assert.match(m, /profile is not a member of this organisation/)
  assert.match(read('app/(dashboard)/[orgSlug]/settings/roles/page.tsx'), /if \(!isManager && !isAdmin\) redirect/)
})

console.log(`\nTeam pages: ${passed} checks passed.`)
