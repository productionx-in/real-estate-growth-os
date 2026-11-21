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
  assert.match(r, /authenticatePlatformAdmin\(\['super_admin'\], true\)/); assert.match(r, /rpc\('platform_delete_organisation'/); assert.match(r, /Deactivate it instead/)
  const m = read('supabase/migrations/20260065_platform_delete_organisation.sql')
  for (const t of ['leads', 'projects', 'inventory_items', 'bookings', 'org_subscription_invoices', 'payment_attempts']) assert.match(m, new RegExp(`'${t}'`), t)
  assert.match(m, /REVOKE ALL ON FUNCTION public\.platform_delete_organisation[^;]*FROM PUBLIC, anon, authenticated/)
})
test('organisation page shows each control only to roles allowed to use it', () => {
  const p = read('app/platform/organisations/[orgId]/page.tsx')
  assert.match(p, /\{isSuper && \(\s*<Card className="border-danger\/40">/)
  assert.match(p, /\(isSuper \|\| access\.role === 'finance_admin'\) && sub\?\.status === 'trial'/)
  assert.match(read('components/platform/OrgManage.tsx'), /disabled=\{busy \|\| confirm\.trim\(\) !== name\.trim\(\)/)
})
console.log(`\nOrganisation management: ${passed} checks passed.`)
