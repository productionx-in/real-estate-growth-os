// tests/org-manage.test.mjs — managing customers from the console: who may rename, extend a trial or delete.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8')
let passed = 0
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`) }
console.log('ORGANISATION MANAGEMENT')
test('rename: Platform Owner or platform admin, MFA, audited; the web address never changes', () => {
  const r = read('app/api/admin/organisations/[orgId]/details/route.ts')
  assert.match(r, /authenticatePlatformAdmin\(\['super_admin', 'platform_admin'\], true\)/); assert.match(r, /action: 'organisation\.renamed'/)
  assert.doesNotMatch(r, /slug:/, 'slug is not updated')
})
test('trial: Platform Owner or finance, MFA, only while on trial, max 90 days, reason audited', () => {
  const r = read('app/api/admin/organisations/[orgId]/trial/route.ts')
  assert.match(r, /\['super_admin', 'finance_admin'\], true/); assert.match(r, /sub\.status !== 'trial'/); assert.match(r, /\.max\(90\)/); assert.match(r, /action: 'subscription\.trial_extended'/)
})
test('delete: Platform Owner only, through the atomic database function, explains blockers', () => {
  const r = read('app/api/admin/organisations/[orgId]/delete/route.ts')
  assert.equal((r.match(/authenticatePlatformAdmin\(\['super_admin'\], true\)/g) ?? []).length, 2, 'GET preview and POST both Owner-only')
  assert.match(r, /rpc\('platform_delete_organisation'/); assert.match(r, /p_purge_data: parsed\.data\.purgeData/); assert.match(r, /Deactivate it instead/)
  const m = read('supabase/migrations/20260066_platform_delete_organisation_purge.sql')
  for (const t of ['leads', 'projects', 'inventory_items', 'bookings', 'org_subscription_invoices', 'payment_attempts']) assert.match(m, new RegExp(`'${t}'`), t)
  assert.match(m, /IF locked <> '\{\}'::jsonb OR \(data_found <> '\{\}'::jsonb AND NOT p_purge_data\)/, 'money records always block; data only with the choice')
  assert.match(m, /REVOKE ALL ON FUNCTION public\.platform_delete_organisation[^;]*FROM PUBLIC, anon, authenticated/)
})
test('organisation page shows each control only to roles allowed to use it', () => {
  const p = read('app/platform/organisations/[orgId]/page.tsx')
  assert.match(p, /\{isSuper && \(\s*<Card className="border-danger\/40">/)
  assert.match(p, /\(isSuper \|\| access\.role === 'finance_admin'\) && sub\?\.status === 'trial'/)
  const ui = read('components/platform/OrgManage.tsx')
  assert.match(ui, /const deleteReady = !locked && understood && confirm\.trim\(\) === name\.trim\(\)/, 'delete needs the "I understand" tick and the exact name; money records block')
  assert.match(ui, /title="Deactivate workspace" tag="Temporary"/); assert.match(ui, /title="Permanently delete workspace" tag="Can’t be undone"/)
  assert.match(ui, /All of this will be permanently lost/)
  assert.match(ui, /status === 404\) return gone\(\)/, 'a lost reply is re-checked before reporting failure')
})
test('unpaid invoices are removable; a paid invoice and payment records always block (20260067)', () => {
  const m = read('supabase/migrations/20260067_delete_organisation_unpaid_invoices.sql')
  assert.match(m, /status <> 'paid'[\s\S]*'unpaid_invoices'/); assert.match(m, /status = 'paid'[\s\S]*'paid_invoices'/)
  assert.match(m, /ARRAY\['org_subscription_payments', 'credit_notes'/)
  assert.match(m, /REVOKE ALL ON FUNCTION public\.platform_delete_organisation[^;]*FROM PUBLIC, anon, authenticated/)
  assert.match(read('lib/platform/people.ts'), /password: unusablePassword\(\)/)
})
console.log(`\nOrganisation management: ${passed} checks passed.`)
