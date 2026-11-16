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

test('sales writes: owner, admin, manager, sales_exec allowed; readonly and unknown denied', () => {
  for (const r of ['owner', 'admin', 'manager', 'sales_exec']) assert.equal(perms.canWriteSales(r), true, r)
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

console.log(`\nALL ${passed} PERMISSION TESTS PASSED`)
