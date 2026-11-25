// tests/sign-in-activity.test.mjs — Settings → Sign-in activity (20260090, lib/dal/sign-in-activity.ts). The record
// must never be able to block a sign-in; admins see only their own workspace's people; addresses are partly hidden.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const D = await jiti.import(path.join(root, 'lib/auth/sign-in-display.ts'))
const C = await jiti.import(path.join(root, 'lib/settings/catalog.ts'))
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')

let passed = 0
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`) }
console.log('SIGN-IN ACTIVITY')

test('devices read as people say them', () => {
  assert.equal(D.describeDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'), 'Chrome on Windows')
  assert.equal(D.describeDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'), 'Safari on iPhone')
  assert.equal(D.describeDevice('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36 EdgA/130 Edg/130.0'), 'Edge on Android')
  assert.equal(D.describeDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0; rv:131.0) Gecko/20100101 Firefox/131.0'), 'Firefox on Mac')
  assert.equal(D.describeDevice(null), 'Unknown device')
})

test('addresses are partly hidden', () => {
  assert.equal(D.maskIp('203.0.113.77'), '203.0.113.x')
  assert.equal(D.maskIp('2401:4900:1c3a:5d2e::1'), '2401:4900:1c3a:…')
  assert.equal(D.maskIp(null), '—')
  assert.equal(D.maskIp('not-an-ip'), '—')
})

test('the migration: never blocks a sign-in; server-only; history kept 180 days', () => {
  const sql = read('supabase/migrations/20260090_sign_in_activity.sql')
  assert.match(sql, /EXCEPTION WHEN OTHERS THEN\s+NULL;/, 'errors inside the trigger are swallowed')
  assert.match(sql, /AFTER INSERT OR UPDATE OR DELETE ON auth\.sessions/)
  assert.match(sql, /ALTER TABLE public\.sign_in_events ENABLE ROW LEVEL SECURITY/)
  assert.match(sql, /REVOKE ALL ON public\.sign_in_events FROM PUBLIC, anon, authenticated/)
  assert.doesNotMatch(sql, /TO authenticated/)
  assert.match(sql, /interval '180 days'/)
})

test('only owners and admins, only their workspace’s people', () => {
  const page = read('app/(dashboard)/[orgSlug]/settings/sign-ins/page.tsx')
  assert.match(page, /if \(!isAdmin\) redirect/)
  assert.match(read('lib/dal/sign-in-activity.ts'), /from\('org_members'\)[^\n]*\.eq\('org_id', orgId\)/)
  assert.match(read('lib/dal/sign-in-activity.ts'), /\.in\('auth_user_id', \[\.\.\.byAuth\.keys\(\)\]\)/)
  const entry = C.SETTINGS.flatMap((g) => g.pages).find((p) => p.key === 'sign-ins')
  assert.equal(entry.audience, 'admins')
  assert.deepEqual(C.searchSettings(C.settingsFor('owner', 'developer'), 'login history').map((p) => p.key), ['sign-ins'])
  assert.deepEqual(C.searchSettings(C.settingsFor('manager', 'developer'), 'login history'), [], 'managers cannot open it')
})

console.log(`\nSign-in activity: ${passed} checks passed.`)
