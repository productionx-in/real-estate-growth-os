// tests/owner-management.test.mjs — the owner as manager (lib/sales/structure.ts, migration 20260096): the rule, its
// defaults, the copies of the routing functions (identical to their latest versions except for the one condition),
// and that every place that offers or gives leads, and the performance pages, follow the workspace's choice.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const S = await jiti.import(path.join(root, 'lib/sales/structure.ts'))
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
let passed = 0
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`) }
console.log('OWNER AS MANAGER')

test('the rule: owners take leads only while owners sell; read-only and post-sales never; others always', () => {
  const off = { ownerSells: false, teamsEnabled: false }, on = { ownerSells: true, teamsEnabled: false }
  assert.equal(S.canTakeLeads('owner', off), false); assert.equal(S.canTakeLeads('owner', on), true)
  for (const r of ['admin', 'manager', 'team_lead', 'sales_exec']) assert.equal(S.canTakeLeads(r, off), true, r)
  for (const r of ['readonly', 'post_sales', null]) assert.equal(S.canTakeLeads(r, on), false, String(r))
  assert.equal(S.sellsPersonally('owner', off), false)
  for (const r of ['owner', 'admin', 'manager', 'team_lead']) assert.ok(S.watchesTeam(r), r)
  assert.ok(!S.watchesTeam('sales_exec'))
})

test('defaults: nothing stored keeps the old behaviour (as the database does); new workspaces start with the owner managing', () => {
  assert.deepEqual(S.salesFromStored(null), { ownerSells: true, teamsEnabled: false })
  assert.deepEqual(S.salesFromStored({ ownerSells: false }), { ownerSells: false, teamsEnabled: false })
  assert.deepEqual(S.salesFromStored({ ownerSells: 'no', teamsEnabled: 1 }), { ownerSells: true, teamsEnabled: false }, 'junk is ignored')
  assert.deepEqual(S.NEW_WORKSPACE, { ownerSells: false, teamsEnabled: false })
  const mig = read('supabase/migrations/20260096_owner_management_mode.sql')
  assert.match(mig, /coalesce\(\(SELECT \(s\.sales ->> 'ownerSells'\)::boolean FROM public\.org_settings s WHERE s\.org_id = p_org\), true\)/)
  for (const f of ['app/api/orgs/route.ts', 'app/api/admin/organisations/provision/route.ts']) assert.match(read(f), /initSalesStructure\(/, f)
})

test('the migration copies route_new_lead and process_lead_responses exactly, changing only the eligibility condition', () => {
  const fn = (file, name) => {
    const s = read(file); const i = s.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`)
    const tag = s.slice(i).match(/AS (\$[a-z_]*\$)/)[1]; const start = s.indexOf(tag, i) + tag.length
    const end = s.indexOf(tag, start)
    return s.slice(i, end).trim()
  }
  const mig = 'supabase/migrations/20260096_owner_management_mode.sql'
  const OLD = "om.role NOT IN ('readonly', 'post_sales')", NEW = 'public.member_can_take_leads(om.org_id, om.profile_id, om.role)'
  for (const [src, name, n] of [['supabase/migrations/20260055_roles_access.sql', 'route_new_lead', 2], ['supabase/migrations/20260093_lead_alerts.sql', 'process_lead_responses', 1]]) {
    const before = fn(src, name), after = fn(mig, name)
    assert.equal(before.split(OLD).length - 1, n, `${name}: ${n} eligibility checks before`)
    assert.equal(after, before.split(OLD).join(NEW), `${name} differs only in the eligibility condition`)
  }
  // No later migration redefines them (otherwise this copy would be stale).
  const later = fs.readdirSync(path.join(root, 'supabase/migrations')).filter((f) => f.slice(0, 8) > '20260096')
  for (const f of later) assert.doesNotMatch(read(`supabase/migrations/${f}`), /FUNCTION public\.(route_new_lead|process_lead_responses)\(/, f)
})

test('every place that offers or gives leads follows the workspace rule', () => {
  assert.match(read('app/api/leads/assign/route.ts'), /\(await assignableRolesFor\(context\.orgId\)\)\.includes\(target\.role as MemberRole\)/)
  for (const f of ['app/api/leads/import/route.ts', 'app/(dashboard)/[orgSlug]/routing/page.tsx', 'app/(dashboard)/[orgSlug]/leads/[leadId]/page.tsx', 'app/(dashboard)/[orgSlug]/visits/page.tsx', 'lib/dal/action-board.ts']) {
    assert.match(read(f), /\.in\('role', await assignableRolesFor\(/, f)
    assert.doesNotMatch(read(f), /\.in\('role', \[\.\.\.ASSIGNABLE_ROLES\]\)/, f)
  }
  assert.match(read('components/leads/AssignLeadDialog.tsx'), /\(ownerSells \|\| m\.role !== 'owner'\)/)
  assert.match(read('app/(dashboard)/[orgSlug]/layout.tsx'), /takesLeads=\{canTakeLeads\(workspace\.role, sales\)\}/)
  assert.match(read('app/api/settings/sales/route.ts'), /authorizeOrgAccess\(orgId, \['owner', 'admin'\]\)/)
})

test('performance: managers start on the team; an owner who does not sell has no personal page and is off the leaderboard', () => {
  const me = read('app/(dashboard)/[orgSlug]/performance/page.tsx')
  assert.match(me, /if \(!sp\.person && watchesTeam\(role\) && \(!sp\.me \|\| !sellsPersonally\(role, sales\)\)\) redirect\(`\/\$\{orgSlug\}\/performance\/team`\)/)
  const team = read('app/(dashboard)/[orgSlug]/performance/team/page.tsx')
  assert.match(team, /if \(!watchesTeam\(role\)\) notFound\(\)/)
  assert.match(team, /role === 'team_lead' \? await teamProfileIdsOf\(org\.id, profile\.id\) : null/, 'a team lead sees only their team')
  assert.match(read('lib/dal/performance.ts'), /if \(!canTakeLeads\(m\.role as MemberRole, sales\)\) continue/)
  assert.match(read('lib/dal/team-overview.ts'), /if \(!canTakeLeads\(m\.role, sales\)\) continue/)
})


test('org_members has several links to profiles: every embed names the one it means (an unnamed one fails, PGRST201)', () => {
  const walk = (d) => fs.readdirSync(path.join(root, d), { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(d, e.name)] : [])
  const bad = []
  for (const f of ['app', 'components', 'lib'].flatMap(walk)) {
    for (const m of read(f).matchAll(/from\('org_members'\)\s*\.select\(\s*'([^']*)'/g)) if (/(^|[\s,:])profiles\(/.test(m[1])) bad.push(`${f}: ${m[1]}`)
  }
  assert.deepEqual(bad, [], 'use profiles!org_members_profile_id_fkey(...)')
})

console.log(`\nOwner as manager: ${passed} checks passed.`)
