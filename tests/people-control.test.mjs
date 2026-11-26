// tests/people-control.test.mjs — RE by PX staff controlling the people who use customer workspaces, and staff
// accounts: who may do what, the guards, and that every action is audited.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8')
let passed = 0
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`) }
console.log('PEOPLE CONTROL')
const lib = read('lib/platform/people.ts')
test('workspace access: Platform Owner or platform admin; account actions: Platform Owner only; MFA on both routes', () => {
  assert.match(lib, /MEMBER_ADMINS: PlatformRole\[\] = \['super_admin', 'platform_admin'\]/)
  assert.match(lib, /ACCOUNT_ADMINS: PlatformRole\[\] = \['super_admin'\]/)
  assert.match(read('app/api/admin/organisations/[orgId]/members/[memberId]/route.ts'), /authenticatePlatformAdmin\(MEMBER_ADMINS, true\)/)
  assert.match(read('app/api/admin/accounts/[userId]/route.ts'), /authenticatePlatformAdmin\(ACCOUNT_ADMINS, true\)/)
})
test('guards: never yourself, never staff, never the only owner, seats respected', () => {
  assert.match(lib, /You cannot change your own access/); assert.match(lib, /You cannot change your own account/)
  assert.match(lib, /if \(acct\.staff\) return fail/); assert.match(lib, /only owner/)
  assert.match(lib, /All paid seats are in use/); assert.match(lib, /is the only owner of \$\{w\.name\}/)
  assert.match(lib, /The workspace itself is deactivated/)
})
test('suspending moves open leads to the unassigned queue and signs the person out when it was their last workspace', () => {
  assert.match(lib, /update\(\{ assigned_to: null/); assert.match(lib, /revokeSessionsIfNoActiveMembership\(m\.profile_id\)/)
  assert.match(lib, /status: 'deactivated'/)
})
test('blocking signs out everywhere; every action is audited (platform log, and the customer log for workspace access)', () => {
  assert.match(lib, /ban_duration: action === 'block' \? FOREVER : 'none'/); assert.match(lib, /revoke_user_sessions/)
  assert.match(lib, /recordOrgAudit\(\{[\s\S]*actorKind: 'platform'/); assert.equal((lib.match(/logPlatformAction\(/g) ?? []).length, 2)
})
test('a reason is required for every action', () => {
  for (const f of ['app/api/admin/organisations/[orgId]/members/[memberId]/route.ts', 'app/api/admin/accounts/[userId]/route.ts']) assert.match(read(f), /reason: z\.string\(\)\.trim\(\)\.min\(3/, f)
  assert.match(read('components/platform/PeopleActions.tsx'), /disabled=\{busy \|\| reason\.trim\(\)\.length < 3\}/)
})
test('staff: deactivation signs out; only a deactivated person can be removed; never yourself', () => {
  const p = read('lib/platform/portal.ts')
  assert.match(p, /if \(change\.active === false\) await db\.rpc\('revoke_user_sessions'/)
  assert.match(p, /Deactivate this person first, then remove them/); assert.match(p, /You cannot remove yourself/); assert.match(p, /'staff\.removed'/)
})
test('console: People in the nav for Owner and platform admin; People card on each customer page', () => {
  assert.match(read('lib/platform/portal.ts'), /people: \['super_admin', 'platform_admin'\]/)
  assert.match(read('app/platform/layout.tsx'), /can\(role, 'people'\)/)
  assert.match(read('app/platform/organisations/[orgId]/page.tsx'), /listWorkspacePeople\(orgId\)/)
})
test('permanent delete: leaves every workspace, erases name, contact and sign-in; audit keeps only a masked e-mail', () => {
  assert.match(lib, /from\('org_members'\)\.delete\(\)\.eq\('profile_id', profileId\)/)
  assert.match(lib, /full_name: 'Deleted user', phone: null, avatar_url: null/)
  assert.match(lib, /email: `deleted-\$\{userId\}@deleted\.invalid`/); assert.match(lib, /ban_duration: FOREVER/)
  assert.match(lib, /maskEmail\(acct\.email\)/)
})
test('dialog: deactivate (reversible) or permanently delete, with a disclaimer, an "I understand" tick and the typed e-mail', () => {
  const ui = read('components/platform/PeopleActions.tsx')
  assert.match(ui, /title="Deactivate account" tag="Temporary"/); assert.match(ui, /title="Permanently delete account" tag="Can’t be undone"/)
  assert.match(ui, /This will be permanently lost/)
  assert.match(ui, /choice === 'deactivate' \|\| \(understood && typed\.trim\(\)\.toLowerCase\(\) === email\.toLowerCase\(\)\)/)
})
console.log(`\nPeople control: ${passed} checks passed.`)
