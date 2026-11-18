// tests/navigation.test.mjs — the shared workspace navigation (lib/navigation/nav.ts): who sees which links,
// that switched-off modules disappear, and the phone tab bar. Showing a link is not authorisation (every
// page checks on the server); these checks stop the menu offering pages a role cannot use, or losing ones it can.
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const nav = await jiti.import(path.join(root, 'lib/navigation/nav.ts'))

let passed = 0
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`) }
const keys = (role, type = 'developer', off = []) => nav.navGroups('acme', role, type, off).flatMap((g) => g.items.map((i) => i.key)).sort()

console.log('NAVIGATION')

test('each role keeps exactly the pages it had before the redesign', () => {
  const sort = (a) => [...a].sort()
  assert.deepEqual(keys('owner'), sort(['home', 'today', 'leads', 'visits', 'inbox', 'sales', 'partners', 'routing', 'speed', 'projects', 'inventory', 'documents', 'analytics', 'integrations', 'team', 'settings', 'billing', 'audit', 'support']))
  assert.deepEqual(keys('admin'), keys('owner'))
  assert.deepEqual(keys('manager'), sort(['home', 'today', 'leads', 'visits', 'inbox', 'sales', 'partners', 'routing', 'speed', 'projects', 'inventory', 'documents', 'analytics', 'team']))
  assert.deepEqual(keys('sales_exec'), sort(['home', 'today', 'leads', 'visits', 'inbox', 'sales', 'inventory']))
  assert.deepEqual(keys('readonly'), sort(['home', 'projects', 'inventory', 'documents', 'analytics']))
  assert.deepEqual(keys('manager', 'channel_partner'), sort(['home', 'today', 'leads', 'visits', 'inbox', 'sales', 'partners', 'team']))
  assert.deepEqual(keys('owner', 'channel_partner'), sort(['home', 'today', 'leads', 'visits', 'inbox', 'sales', 'partners', 'team', 'settings', 'billing', 'audit', 'support']))
})

test('new roles: a team lead gets the selling pages; post-sales gets customers, bookings and documents, no pipeline tools', () => {
  const sort = (a) => [...a].sort()
  assert.deepEqual(keys('team_lead'), sort(['home', 'today', 'leads', 'visits', 'inbox', 'sales', 'inventory']))
  assert.deepEqual(keys('post_sales'), sort(['home', 'leads', 'inbox', 'sales', 'documents', 'projects', 'inventory']))
  for (const k of ['routing', 'speed', 'analytics', 'team', 'settings', 'billing', 'audit', 'support', 'integrations']) {
    assert.ok(!keys('team_lead').includes(k) && !keys('post_sales').includes(k), k)
  }
  assert.deepEqual(nav.tabLinks(nav.navGroups('acme', 'post_sales')).map((t) => t.key), ['home', 'leads', 'inbox', 'projects'])
  assert.equal(nav.canCreateLead('post_sales'), false)
})

test('settings, billing, audit log and support access are only offered to owners and admins', () => {
  for (const role of ['manager', 'team_lead', 'sales_exec', 'post_sales', 'readonly']) for (const type of ['developer', 'channel_partner']) {
    for (const k of ['settings', 'billing', 'audit', 'support', 'integrations']) assert.ok(!keys(role, type).includes(k), `${role}/${type} ${k}`)
  }
})

test('a switched-off module hides its pages everywhere (sales covers visits and documents)', () => {
  const k = keys('owner', 'developer', ['sales', 'inventory', 'analytics'])
  for (const gone of ['sales', 'partners', 'visits', 'documents', 'inventory', 'analytics']) assert.ok(!k.includes(gone), gone)
  assert.ok(k.includes('leads') && k.includes('today'))
  assert.equal(nav.navGroups('acme', 'readonly', 'developer', ['inventory', 'analytics', 'sales']).flatMap((g) => g.items).length, 2)
})

test('Home is first; links stay inside the workspace', () => {
  for (const role of ['owner', 'manager', 'sales_exec', 'readonly']) {
    const all = nav.navGroups('acme', role).flatMap((g) => g.items)
    assert.equal(all[0].key, 'home')
    assert.ok(all.every((i) => i.href === '/acme' || i.href.startsWith('/acme/')))
  }
})

test('active link: exact for Home, prefix for sections, never a lookalike path', () => {
  const [home, , leads] = nav.navGroups('acme', 'owner')[0].items
  assert.equal(nav.isActiveLink(home, '/acme'), true)
  assert.equal(nav.isActiveLink(home, '/acme/leads'), false)
  assert.equal(nav.isActiveLink(leads, '/acme/leads/123'), true)
  assert.equal(nav.isActiveLink(leads, '/acme/leadsx'), false)
})

test('phone tab bar: at most four, most used first, only pages the role has', () => {
  const tabs = (role, type, off) => nav.tabLinks(nav.navGroups('acme', role, type, off)).map((t) => t.key)
  assert.deepEqual(tabs('sales_exec'), ['home', 'today', 'leads', 'inbox'])
  assert.deepEqual(tabs('readonly'), ['home', 'projects', 'inventory', 'analytics'])
  assert.deepEqual(tabs('owner', 'developer', ['sales']), ['home', 'today', 'leads', 'inbox'])
})

test('adding leads by hand: everyone but read-only members', () => {
  assert.deepEqual(['owner', 'admin', 'manager', 'sales_exec', 'readonly'].map(nav.canCreateLead), [true, true, true, true, false])
})

console.log(`\nNavigation: ${passed} checks passed.`)
