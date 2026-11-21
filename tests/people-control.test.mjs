// tests/people-control.test.mjs — REGrow staff controlling the people who use customer workspaces, and staff
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
test('guards: never yourself, never staff, never the only owner, seats respected, delete only with no workspace', () => {
  assert.match(lib, /You cannot change your own access/); assert.match(lib, /You cannot change your own account/)
  assert.match(lib, /if \(acct\.staff\) return fail/); assert.match(lib, /only owner/)
  assert.match(lib, /All paid seats are in use/); assert.match(lib, /if \(acct\.workspaces\.length\)/)
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
console.log(`\nPeople control: ${passed} checks passed.`)
