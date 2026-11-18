// tests/permissions.test.mjs
// Unit tests that import the REAL production module lib/auth/permissions.ts (via jiti, which
// transpiles TypeScript at load time and resolves the "@/..." alias), plus a source-level guard
// that every membership lookup used for authorisation requires an active membership.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const perms = await jiti.import(path.join(root, 'lib/auth/permissions.ts'))

let passed = 0
function test(name, fn) {
  fn()
  passed++
  console.log(`  ✓ ${name}`)
}

console.log('PERMISSIONS (real lib/auth/permissions.ts)')

test('only an active membership grants access', () => {
  assert.equal(perms.isActiveMembership('active'), true)
  for (const s of ['deactivated', 'suspended', 'pending', '', null, undefined, 'ACTIVE', ' active']) {
    assert.equal(perms.isActiveMembership(s), false, `status ${JSON.stringify(s)} must not grant access`)
  }
})

test('sales writes: owner, admin, manager, sales_exec (and team_lead, post_sales) allowed; readonly and unknown denied', () => {
  for (const r of ['owner', 'admin', 'manager', 'sales_exec', 'team_lead', 'post_sales']) assert.equal(perms.canWriteSales(r), true, r)
  for (const r of ['readonly', null, undefined, '', 'superuser']) assert.equal(perms.canWriteSales(r), false, String(r))
})

test('channel-partner management: owner, admin, manager only', () => {
  for (const r of ['owner', 'admin', 'manager']) assert.equal(perms.canManageChannelPartners(r), true, r)
  for (const r of ['sales_exec', 'readonly', null, undefined]) assert.equal(perms.canManageChannelPartners(r), false, String(r))
})

// ---------------------------------------------------------------------------
// Source guards (regression protection for patterns that the type system cannot catch)
// ---------------------------------------------------------------------------
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name)
    return d.isDirectory() ? walk(p) : p.endsWith('.ts') || p.endsWith('.tsx') ? [p] : []
  })
}

test('every org_members lookup in app/api filters status = active', () => {
  const offenders = []
  for (const file of walk(path.join(root, 'app/api'))) {
    const lines = fs.readFileSync(file, 'utf8').split('\n')
    lines.forEach((line, i) => {
      if (!line.includes(".from('org_members')")) return
      const chain = lines.slice(i, i + 6).join('\n')
      if (chain.includes('.insert(')) return // creating a membership, not checking one
      if (!chain.includes(".eq('status', 'active')")) offenders.push(`${path.relative(root, file)}:${i + 1}`)
    })
  }
  assert.deepEqual(offenders, [], `membership lookups without an active-status filter:\n${offenders.join('\n')}`)
})

test("no deny-list status checks (=== / !== 'deactivated') remain in auth paths", () => {
  const offenders = []
  for (const dir of ['app/api', 'lib/dal', 'lib/auth']) {
    for (const file of walk(path.join(root, dir))) {
      const src = fs.readFileSync(file, 'utf8')
      if (/status\s*[!=]==\s*'deactivated'/.test(src)) offenders.push(path.relative(root, file))
    }
  }
  assert.deepEqual(offenders, [], `use isActiveMembership() instead in:\n${offenders.join('\n')}`)
})

test('every sales write handler passes an explicit role list', () => {
  const offenders = []
  for (const file of walk(path.join(root, 'app/api/sales'))) {
    const src = fs.readFileSync(file, 'utf8')
    if (/authorizeSalesRequest\(body\.orgId\s*\)/.test(src)) offenders.push(path.relative(root, file))
  }
  assert.deepEqual(offenders, [], `write handlers without a role list:\n${offenders.join('\n')}`)
})

// ── Roles and lead visibility ─────────────────────────────────────────────────────────────────────
const ME = 'me-0000', MATE = 'mate-0000', OTHER = 'other-000'
const v = (role, team) => ({ role, profileId: ME, ...(team ? { teamProfileIds: team } : {}) })
const L = (assigned_to, status = 'new') => ({ assigned_to, status })

test('lead scope per role; an unknown role gets the narrowest scope', () => {
  const scope = Object.fromEntries(perms.MEMBER_ROLES.map((r) => [r, perms.leadScopeOf(r)]))
  assert.deepEqual(scope, { owner: 'all', admin: 'all', manager: 'all', team_lead: 'team', sales_exec: 'own', post_sales: 'booked', readonly: 'all' })
  for (const r of [null, undefined, '', 'superuser']) assert.equal(perms.leadScopeOf(r), 'own')
  for (const r of perms.MEMBER_ROLES) assert.ok(perms.ROLE_LABELS[r] && perms.ROLE_DESCRIPTIONS[r], `${r} has a label and a description`)
})

test('seeing a lead: team lead their team (not another team), post-sales booked only, executive own or unassigned', () => {
  const tl = v('team_lead', [ME, MATE])
  assert.deepEqual([L(ME), L(MATE), L(null), L(OTHER)].map((l) => perms.canSeeLead(tl, l)), [true, true, true, false])
  assert.equal(perms.canSeeLead(v('team_lead'), L(MATE)), false, 'no team resolved → only their own')
  assert.deepEqual([L(OTHER, 'booked'), L(ME, 'negotiation'), L(null, 'new')].map((l) => perms.canSeeLead(v('post_sales'), l)), [true, false, false])
  assert.deepEqual([L(ME), L(null), L(OTHER)].map((l) => perms.canSeeLead(v('sales_exec'), l)), [true, true, false])
  for (const r of ['owner', 'admin', 'manager', 'readonly']) assert.equal(perms.canSeeLead(v(r), L(OTHER)), true, r)
})

test('working a lead: never a viewer; unassigned leads only for managers; post-sales booked customers', () => {
  const tl = v('team_lead', [ME, MATE])
  assert.deepEqual([L(ME), L(MATE), L(null), L(OTHER)].map((l) => perms.canWorkLead(tl, l)), [true, true, false, false])
  assert.deepEqual([L(ME), L(null), L(OTHER)].map((l) => perms.canWorkLead(v('sales_exec'), l)), [true, false, false])
  assert.deepEqual([L(OTHER, 'booked'), L(ME, 'new')].map((l) => perms.canWorkLead(v('post_sales'), l)), [true, false])
  assert.equal(perms.canWorkLead(v('readonly'), L(ME)), false)
  assert.equal(perms.canWorkLead(v('manager'), L(null)), true)
})

test('assigning: managers to anyone; a team lead within the team; nobody else; post-sales and viewers never take leads', () => {
  assert.deepEqual(perms.MEMBER_ROLES.filter(perms.canAssignLeads), ['owner', 'admin', 'manager', 'team_lead'])
  assert.equal(perms.canAssignTo(v('manager'), OTHER), true)
  assert.deepEqual([ME, MATE, OTHER].map((id) => perms.canAssignTo(v('team_lead', [ME, MATE]), id)), [true, true, false])
  assert.equal(perms.canAssignTo(v('sales_exec'), ME), false)
  assert.ok(!perms.ASSIGNABLE_ROLES.includes('post_sales') && !perms.ASSIGNABLE_ROLES.includes('readonly'))
  assert.deepEqual(perms.MEMBER_ROLES.filter(perms.canCreateLeads), ['owner', 'admin', 'manager', 'team_lead', 'sales_exec'])
  assert.deepEqual(perms.MEMBER_ROLES.filter(perms.isManagement), ['owner', 'admin', 'manager'])
})

test('no server code restricts by naming a role ("=== \'sales_exec\'"): visibility goes through leadScopeOf/canSeeLead', () => {
  // A check written as "restrict sales executives" silently gives every newer role full access.
  const offenders = []
  for (const dir of ['app', 'lib', 'components']) {
    for (const file of walk(path.join(root, dir))) {
      if (!/\.(ts|tsx)$/.test(file) || file.endsWith(path.join('lib', 'auth', 'permissions.ts')) || file.endsWith(path.join('lib', 'navigation', 'nav.ts'))) continue
      const src = fs.readFileSync(file, 'utf8')
      if (/role\s*[!=]==?\s*'sales_exec'|'sales_exec'\s*[!=]==?\s*\w*role/i.test(src)) offenders.push(path.relative(root, file))
    }
  }
  assert.deepEqual(offenders, [], `use leadScopeOf / canSeeLead / canWorkLead instead in:\n${offenders.join('\n')}`)
})

console.log(`\nALL ${passed} PERMISSION TESTS PASSED`)
