// tests/settings-hub.test.mjs — the settings hub (lib/settings/catalog.ts and app/(dashboard)/[orgSlug]/settings):
// who sees which settings, search, that every link points at a real page, and that personal settings change only
// the signed-in person's own account.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const c = await jiti.import(path.join(root, 'lib/settings/catalog.ts'))
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8')
let passed = 0
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`) }
const keys = (role) => c.settingsFor(role).flatMap((g) => g.pages.map((p) => p.key))

console.log('SETTINGS HUB')

test('everyone gets their own settings; managers add team and lead set-up; only owners and admins see company settings', () => {
  for (const role of ['sales_exec', 'team_lead', 'post_sales', 'readonly']) assert.deepEqual(keys(role), ['profile', 'security', 'notifications'], role)
  const mgr = keys('manager')
  assert.ok(mgr.includes('team') && mgr.includes('routing') && mgr.includes('documents'))
  for (const k of ['organization', 'billing', 'audit', 'support', 'integrations']) assert.ok(!mgr.includes(k), `manager must not see ${k}`)
  for (const role of ['owner', 'admin']) for (const k of ['organization', 'billing', 'audit', 'integrations', 'profile']) assert.ok(keys(role).includes(k), `${role} ${k}`)
})

test('search matches labels, groups and everyday words; every word must match', () => {
  const all = c.settingsFor('owner')
  assert.deepEqual(c.searchSettings(all, 'password').map((p) => p.key), ['security'])
  assert.deepEqual(c.searchSettings(all, 'WhatsApp').map((p) => p.key), ['integrations'])
  assert.ok(c.searchSettings(all, 'round robin').some((p) => p.key === 'routing'))
  assert.deepEqual(c.searchSettings(all, 'password billing'), [])
  assert.deepEqual(c.searchSettings(c.settingsFor('sales_exec'), 'billing'), [], 'a salesperson cannot find what they cannot open')
})

test('every settings link points at a page that exists', () => {
  for (const g of c.SETTINGS) for (const p of g.pages) {
    const file = path.join(root, 'app/(dashboard)/[orgSlug]', p.path, 'page.tsx')
    assert.ok(fs.existsSync(file), `${p.key} → ${p.path}`)
  }
})

test('the hub is open to every member; organisation settings refuse non-admins on the server', () => {
  assert.doesNotMatch(read('app/(dashboard)/[orgSlug]/settings/page.tsx'), /redirect\(/)
  assert.match(read('app/(dashboard)/[orgSlug]/settings/organization/page.tsx'), /if \(!isAdmin\) redirect\(/)
})

test('profile changes only your own name and phone; password and sign-out act on your own session', () => {
  const api = read('app/api/account/profile/route.ts')
  assert.match(api, /\.update\(\{ full_name: parsed\.data\.fullName, phone: parsed\.data\.phone \|\| null \}\)\s*\.eq\('auth_user_id', user\.id\)/)
  assert.doesNotMatch(api, /createServiceClient/, 'own session only, so RLS applies')
  const sec = read('components/settings/SecurityPanels.tsx')
  assert.match(sec, /passwordProblem\(pw, email\)/, 'the shared password policy')
  assert.match(sec, /signOut\(\{ scope: 'others' \}\)/)
})

test('the account menu offers Settings to everyone; the integration reference moved to the Integration Centre', () => {
  const header = read('components/layout/Header.tsx')
  assert.match(header, /href=\{`\/\$\{orgSlug\}\/settings`\}><Settings aria-hidden \/> Settings/)
  assert.match(read('app/(dashboard)/[orgSlug]/integrations/page.tsx'), /<IntegrationReadinessPanel \/>/)
})

console.log(`\nSettings hub: ${passed} checks passed.`)
