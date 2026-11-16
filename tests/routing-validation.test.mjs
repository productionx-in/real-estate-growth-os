// tests/routing-validation.test.mjs
// Imports the REAL lib/validations/routing.ts and lib/auth/permissions.ts, plus a source guard on the
// /api/routing route handlers.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const v = await jiti.import(path.join(root, 'lib/validations/routing.ts'))
const perms = await jiti.import(path.join(root, 'lib/auth/permissions.ts'))

let passed = 0
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`) }
const ORG = '11111111-1111-4111-8111-111111111111'
const TEAM = '22222222-2222-4222-8222-222222222222'

console.log('ROUTING VALIDATION (real lib/validations/routing.ts)')

test('team: defaults timezone to Asia/Kolkata; rejects empty or over-long names', () => {
  const ok = v.TeamCreateSchema.parse({ orgId: ORG, name: '  Luxury desk  ' })
  assert.equal(ok.name, 'Luxury desk')
  assert.equal(ok.timezone, 'Asia/Kolkata')
  assert.equal(v.TeamCreateSchema.safeParse({ orgId: ORG, name: '   ' }).success, false)
  assert.equal(v.TeamCreateSchema.safeParse({ orgId: ORG, name: 'x'.repeat(81) }).success, false)
  assert.equal(v.TeamCreateSchema.safeParse({ orgId: 'not-a-uuid', name: 'A' }).success, false)
})

test('team update requires at least one field', () => {
  assert.equal(v.TeamUpdateSchema.safeParse({ orgId: ORG }).success, false)
  assert.equal(v.TeamUpdateSchema.safeParse({ orgId: ORG, isActive: false }).success, true)
})

test('team member: weight 1–10, positive capacity or null', () => {
  const ok = v.TeamMemberUpsertSchema.parse({ orgId: ORG, profileId: TEAM })
  assert.deepEqual([ok.weight, ok.dailyCapacity, ok.isOnDuty], [1, null, true])
  for (const bad of [{ weight: 0 }, { weight: 11 }, { weight: 1.5 }, { dailyCapacity: 0 }, { dailyCapacity: -3 }]) {
    assert.equal(v.TeamMemberUpsertSchema.safeParse({ orgId: ORG, profileId: TEAM, ...bad }).success, false, JSON.stringify(bad))
  }
})

test('rule: sensible defaults; unknown sources and strategies rejected', () => {
  const ok = v.RuleCreateSchema.parse({ orgId: ORG, name: 'Portal leads', teamId: TEAM, matchSources: ['99acres', 'housing'] })
  assert.deepEqual([ok.strategy, ok.stickyDays, ok.priority, ok.isActive], ['round_robin', 90, 100, true])
  assert.deepEqual(ok.matchProjectIds, [])
  assert.equal(v.RuleCreateSchema.safeParse({ orgId: ORG, name: 'x', teamId: TEAM, matchSources: ['instagram'] }).success, false)
  assert.equal(v.RuleCreateSchema.safeParse({ orgId: ORG, name: 'x', teamId: TEAM, strategy: 'random' }).success, false)
  assert.equal(v.RuleCreateSchema.safeParse({ orgId: ORG, name: 'x', teamId: TEAM, stickyDays: 400 }).success, false)
  assert.equal(v.RuleCreateSchema.safeParse({ orgId: ORG, name: 'x', teamId: TEAM, matchProjectIds: ['nope'] }).success, false)
})

test('validation sources match the database lead_source enum', () => {
  const sql = fs.readFileSync(path.join(root, 'supabase/migrations/20260001_enums.sql'), 'utf8')
  const enumBody = sql.match(/CREATE TYPE lead_source AS ENUM \(([^)]*)\)/s)[1]
  const dbValues = [...enumBody.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort()
  assert.deepEqual([...v.LEAD_SOURCES].sort(), dbValues)
})

test('only owner/admin/manager can manage routing', () => {
  for (const r of ['owner', 'admin', 'manager']) assert.equal(perms.canManageRouting(r), true)
  for (const r of ['sales_exec', 'readonly', null, undefined]) assert.equal(perms.canManageRouting(r), false)
})

test('every /api/routing write handler is role-gated', () => {
  const offenders = []
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])
  for (const file of walk(path.join(root, 'app/api/routing'))) {
    const src = fs.readFileSync(file, 'utf8')
    for (const m of src.matchAll(/export async function (POST|PUT|PATCH|DELETE)[\s\S]*?(?=export async function|$)/g)) {
      if (!/authorizeOrgAccess\([^)]*(ROUTING_ADMIN_ROLES|SALES_WRITE_ROLES)/.test(m[0])) offenders.push(`${path.relative(root, file)} ${m[1]}`)
    }
  }
  assert.deepEqual(offenders, [], offenders.join('\n'))
})

test('duty toggle never trusts a profile id from the request', () => {
  const src = fs.readFileSync(path.join(root, 'app/api/routing/duty/route.ts'), 'utf8')
  assert.match(src, /setOwnDutyStatus\(input\.data\.orgId, auth\.context\.profile\.id/)
  assert.equal(/profileId/.test(fs.readFileSync(path.join(root, 'lib/validations/routing.ts'), 'utf8').match(/DutyToggleSchema[\s\S]*?\}\)/)[0]), false)
})

console.log(`\nALL ${passed} ROUTING VALIDATION TESTS PASSED`)
