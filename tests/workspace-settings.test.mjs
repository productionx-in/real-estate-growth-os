// tests/workspace-settings.test.mjs — workspace settings (lib/settings/workspace.ts, 20260074): validation, defaults,
// the close-reason check, and that the API, status route and pages are wired the safe way round.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const w = await jiti.import(path.join(root, 'lib/settings/workspace.ts'))
const catalog = await jiti.import(path.join(root, 'lib/settings/catalog.ts'))
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8')
let passed = 0
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`) }

console.log('WORKSPACE SETTINGS')

test('reason lists are trimmed, de-duplicated (ignoring case) and capped', () => {
  const { value, errors } = w.normaliseSection('leads', { lostReasons: ['  Budget  ', 'budget', '', 'Too   far'], junkReasons: ['Spam'], requireReason: true, extra: 1 })
  assert.deepEqual(value, { lostReasons: ['Budget', 'Too far'], junkReasons: ['Spam'], requireReason: true })
  assert.deepEqual(errors, {})
  const many = w.normaliseSection('leads', { lostReasons: Array.from({ length: 25 }, (_, i) => `R${i}`), junkReasons: ['x'.repeat(81)] })
  assert.equal(many.value.lostReasons.length, 20); assert.ok(many.errors.lostReasons); assert.ok(many.errors.junkReasons)
})

test('asking for a reason needs at least one reason in each list', () => {
  assert.ok(w.normaliseSection('leads', { lostReasons: [], junkReasons: ['Spam'], requireReason: true }).errors.requireReason)
  assert.deepEqual(w.normaliseSection('leads', { lostReasons: [], junkReasons: [], requireReason: false }).errors, {})
})

test('hold time is a whole number of hours from 0 to 720', () => {
  assert.deepEqual(w.normaliseSection('inventory', { holdHours: 48 }), { value: { holdHours: 48 }, errors: {} })
  for (const bad of [-1, 721, 1.5, 'x', null]) assert.ok(w.normaliseSection('inventory', { holdHours: bad }).errors.holdHours, String(bad))
  assert.equal(w.describeHold(0), 'Holds stay until someone releases them'); assert.equal(w.describeHold(48), '2 days'); assert.equal(w.describeHold(36), '36 hours')
})

test('a missing, empty or malformed stored row falls back to the defaults', () => {
  assert.deepEqual(w.settingsFromRow(null), w.DEFAULT_SETTINGS)
  assert.deepEqual(w.settingsFromRow({ leads: {}, inventory: [] }), w.DEFAULT_SETTINGS)
  const s = w.settingsFromRow({ leads: { lostReasons: ['Price'] }, inventory: { holdHours: 'abc' } })
  assert.deepEqual(s.leads.lostReasons, ['Price']); assert.deepEqual(s.leads.junkReasons, w.DEFAULT_SETTINGS.leads.junkReasons)
  assert.equal(s.inventory.holdHours, 0)
})

test('closing a lead: the reason must be on the workspace’s list, or “Other” with a note', () => {
  const leads = w.DEFAULT_SETTINGS.leads
  assert.deepEqual(w.checkCloseReason(leads, 'lost', 'bought elsewhere', undefined), { ok: true, reason: 'Bought elsewhere' })
  assert.equal(w.checkCloseReason(leads, 'lost', undefined, undefined).ok, false)
  assert.equal(w.checkCloseReason(leads, 'junk', 'Bought elsewhere', undefined).ok, false, 'a Lost reason is not a Junk reason')
  assert.equal(w.checkCloseReason(leads, 'lost', 'Other', '').ok, false)
  assert.deepEqual(w.checkCloseReason(leads, 'lost', 'Other', 'Moved abroad'), { ok: true, reason: 'Other' })
  assert.deepEqual(w.checkCloseReason({ ...leads, requireReason: false }, 'lost', undefined, undefined), { ok: true, reason: null })
})

test('saving settings: owners and admins only, validated and audited; reading never needs a privilege', () => {
  const api = read('app/api/settings/workspace/route.ts')
  assert.match(api, /authorizeOrgAccess\(orgId, \['owner', 'admin'\]\)/)
  assert.match(api, /normaliseSection\(section/)
  assert.match(api, /auditMember\([^)]*settings\.\$\{section\}_saved/)
  for (const page of ['leads', 'inventory']) assert.match(read(`app/(dashboard)/[orgSlug]/settings/${page}/page.tsx`), /if \(!isAdmin\) redirect/)
  const keys = (role) => catalog.settingsFor(role).flatMap((g) => g.pages.map((p) => p.key))
  assert.ok(keys('admin').includes('lead-settings') && keys('admin').includes('inventory-settings'))
  assert.ok(!keys('manager').includes('lead-settings') && !keys('sales_exec').includes('inventory-settings'))
})

test('the status API checks the close reason on the server and stores it on the lead', () => {
  const route = read('app/api/leads/[leadId]/status/route.ts')
  assert.match(route, /checkCloseReason\(\(await getWorkspaceSettings\(lead\.org_id\)\)\.leads/)
  assert.match(route, /needsReason: true/)
  const dal = read('lib/dal/leads.ts')
  assert.match(dal, /closed_reason: newStatus === 'lost' \|\| newStatus === 'junk' \? closedReason : null/)
  for (const c of ['components/leads/StatusTransitionPanel.tsx', 'components/leads/LeadsBoard.tsx']) assert.match(read(c), /CloseReasonDialog/, c)
})

test('the migration keeps settings server-only, extends the live-leads view and schedules hold releases', () => {
  const m = read('supabase/migrations/20260074_workspace_settings.sql')
  assert.match(m, /ALTER TABLE public\.org_settings ENABLE ROW LEVEL SECURITY;\s*REVOKE ALL ON public\.org_settings FROM PUBLIC, anon, authenticated;/)
  assert.match(m, /ALTER TABLE public\.leads_all\s+ADD COLUMN IF NOT EXISTS closed_reason/)
  assert.match(m, /CREATE OR REPLACE VIEW public\.leads WITH \(security_invoker = true\) AS\s+SELECT \* FROM public\.leads_all WHERE deleted_at IS NULL/)
  assert.match(m, /REVOKE ALL ON FUNCTION public\.release_expired_holds\(\) FROM PUBLIC, anon, authenticated/)
  assert.match(m, /cron\.schedule\('regrow-release-expired-holds', '\*\/10 \* \* \* \*'/)
})

console.log(`\nWorkspace settings: ${passed} checks passed.`)
