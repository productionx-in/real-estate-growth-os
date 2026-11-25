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
const periods = await jiti.import(path.join(root, 'lib/reports/periods.ts'))
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

test('status names: renamed per workspace, trimmed, at most 24 characters, never two the same; blanks keep the standard name', () => {
  const ok = w.normaliseSection('inventory', { holdHours: 0, areaUnitBuilt: 'sqft', areaUnitLand: 'sqyd', statusLabels: { blocked: '  Landowner   share ', on_hold: '' } })
  assert.deepEqual(ok.errors, {})
  assert.equal(ok.value.statusLabels.blocked, 'Landowner share')
  assert.equal(ok.value.statusLabels.on_hold, 'On hold', 'blank → standard name')
  assert.deepEqual(Object.keys(ok.value.statusLabels).sort(), ['available', 'blocked', 'booked', 'on_hold', 'sold'], 'only the five fixed statuses')
  const extra = w.normaliseSection('inventory', { holdHours: 0, areaUnitBuilt: 'sqft', areaUnitLand: 'sqyd', statusLabels: { reserved: 'Reserved' } })
  assert.equal(extra.value.statusLabels.reserved, undefined, 'no new statuses can be invented')
  assert.ok(w.normaliseSection('inventory', { holdHours: 0, areaUnitBuilt: 'sqft', areaUnitLand: 'sqyd', statusLabels: { sold: 'x'.repeat(25) } }).errors['statusLabels.sold'])
  assert.ok(w.normaliseSection('inventory', { holdHours: 0, areaUnitBuilt: 'sqft', areaUnitLand: 'sqyd', statusLabels: { booked: 'available' } }).errors['statusLabels.booked'], 'case-insensitive duplicate')
  assert.deepEqual(w.settingsFromRow({ inventory: { holdHours: 24 } }).inventory.statusLabels, w.DEFAULT_STATUS_LABELS, 'stored rows from before keep the standard names')
  const statuses = read('lib/validations/inventory.ts').match(/new_status: z\.enum\(\[([^\]]+)\]/)[1].match(/'(\w+)'/g).map((x) => x.slice(1, -1))
  assert.deepEqual([...w.UNIT_STATUSES].sort(), statuses.sort(), 'the same five statuses the inventory API accepts')
})

test('status names reach every inventory screen through the workspace provider', () => {
  assert.match(read('app/(dashboard)/[orgSlug]/layout.tsx'), /statusLabels: inv\.statusLabels/)
  for (const f of ['components/inventory/InventoryStatusBadge.tsx', 'components/inventory/InventoryStatusDialog.tsx', 'components/inventory/InventoryVisualView.tsx',
    'components/inventory/InventoryViewManager.tsx', 'components/inventory/OrgInventoryExplorer.tsx', 'components/inventory/InventoryDetailDrawer.tsx', 'components/plots/PlotMap.tsx', 'components/plots/ShapeEditor.tsx']) {
    assert.match(read(f), /useStatusLabels\(\)/, f)
    assert.doesNotMatch(read(f), /'On Hold'|>On Hold</, f)
  }
})

test('hold time is a whole number of hours from 0 to 720; area units come from the inventory form’s list', () => {
  assert.deepEqual(w.normaliseSection('inventory', { holdHours: 48, areaUnitBuilt: 'sqft', areaUnitLand: 'guntas' }), { value: { holdHours: 48, areaUnitBuilt: 'sqft', areaUnitLand: 'guntas', statusLabels: w.DEFAULT_STATUS_LABELS }, errors: {} })
  assert.ok(w.normaliseSection('inventory', { holdHours: 0, areaUnitBuilt: 'sqm', areaUnitLand: 'sqyd' }).errors.areaUnitBuilt)
  const formUnits = read('lib/validations/inventory.ts').match(/area_unit: z\.enum\(\[([^\]]+)\]/)[1].match(/'(\w+)'/g).map((x) => x.slice(1, -1))
  assert.deepEqual(Object.keys(w.AREA_UNITS).sort(), formUnits.sort(), 'every setting value is one the inventory form accepts')
  for (const bad of [-1, 721, 1.5, 'x', null]) assert.ok(w.normaliseSection('inventory', { holdHours: bad }).errors.holdHours, String(bad))
  assert.equal(w.describeHold(0), 'Holds stay until someone releases them'); assert.equal(w.describeHold(48), '2 days'); assert.equal(w.describeHold(36), '36 hours')
})

test('report settings: a month 1–12 and a week that starts on Sunday or Monday', () => {
  assert.deepEqual(w.normaliseSection('reports', { fyStartMonth: 1, weekStartsOn: 0 }), { value: { fyStartMonth: 1, weekStartsOn: 0 }, errors: {} })
  for (const bad of [0, 13, 4.5, null]) assert.ok(w.normaliseSection('reports', { fyStartMonth: bad, weekStartsOn: 1 }).errors.fyStartMonth, String(bad))
  assert.ok(w.normaliseSection('reports', { fyStartMonth: 4, weekStartsOn: 3 }).errors.weekStartsOn)
})

test('report periods: calendar boundaries at midnight India time, following the financial year and week start', () => {
  const india = { fyStartMonth: 4, weekStartsOn: 1 }
  // 22 Nov 2026, 10:00 IST (a Sunday) = 04:30 UTC
  const now = new Date('2026-11-22T04:30:00Z')
  const iso = (k, s = india) => periods.resolvePeriod(k, s, now).from.toISOString()
  assert.equal(iso('month'), '2026-10-31T18:30:00.000Z', '1 Nov 00:00 IST')
  assert.equal(iso('quarter'), '2026-09-30T18:30:00.000Z', 'Q3 of an April year starts 1 Oct')
  assert.equal(iso('fy'), '2026-03-31T18:30:00.000Z', 'FY 2026–27 starts 1 Apr 2026')
  assert.equal(iso('week'), '2026-11-15T18:30:00.000Z', 'a Monday week started Mon 16 Nov')
  assert.equal(iso('week', { ...india, weekStartsOn: 0 }), '2026-11-21T18:30:00.000Z', 'a Sunday week starts today')
  assert.equal(iso('fy', { fyStartMonth: 1, weekStartsOn: 1 }), '2025-12-31T18:30:00.000Z', 'calendar-year companies')
  assert.match(periods.resolvePeriod('fy', india, now).label, /FY 2026–27/)
  assert.match(periods.resolvePeriod('quarter', india, now).label, /Q3 \(Oct–Dec\)/)
  // Early January in an April year: Q4 started 1 Jan, the year started the previous April.
  const jan = new Date('2027-01-02T00:00:00Z')
  assert.equal(periods.resolvePeriod('quarter', india, jan).from.toISOString(), '2026-12-31T18:30:00.000Z')
  assert.equal(periods.resolvePeriod('fy', india, jan).from.toISOString(), '2026-03-31T18:30:00.000Z')
  // A quarter that crosses the calendar year (financial year starting in November).
  assert.match(periods.resolvePeriod('quarter', { fyStartMonth: 11, weekStartsOn: 1 }, jan).label, /Q1 \(Nov–Jan\)/)
  assert.equal(periods.resolvePeriod('30d', india, now).from.getTime(), now.getTime() - 30 * 86_400_000)
  assert.equal(periods.isPeriod('fy'), true); assert.equal(periods.isPeriod('toString'), false)
})

test('a missing, empty or malformed stored row falls back to the defaults', () => {
  assert.deepEqual(w.settingsFromRow(null), w.DEFAULT_SETTINGS)
  assert.deepEqual(w.settingsFromRow({ leads: {}, inventory: [] }), w.DEFAULT_SETTINGS)
  const s = w.settingsFromRow({ leads: { lostReasons: ['Price'] }, inventory: { holdHours: 'abc' } })
  assert.deepEqual(s.leads.lostReasons, ['Price']); assert.deepEqual(s.leads.junkReasons, w.DEFAULT_SETTINGS.leads.junkReasons)
  assert.equal(s.inventory.holdHours, 0)
  assert.deepEqual(w.settingsFromRow({ inventory: { holdHours: 12 } }).inventory, { holdHours: 12, areaUnitBuilt: 'sqft', areaUnitLand: 'sqyd', statusLabels: w.DEFAULT_STATUS_LABELS }, 'rows saved before a field existed get its default')
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
  for (const page of ['leads', 'inventory', 'reports']) assert.match(read(`app/(dashboard)/[orgSlug]/settings/${page}/page.tsx`), /if \(!isAdmin\) redirect/)
  const keys = (role) => catalog.settingsFor(role).flatMap((g) => g.pages.map((p) => p.key))
  assert.ok(keys('admin').includes('lead-settings') && keys('admin').includes('inventory-settings'))
  assert.ok(!keys('manager').includes('lead-settings') && !keys('sales_exec').includes('inventory-settings'))
  assert.ok(keys('owner').includes('report-settings') && !keys('manager').includes('report-settings'))
})

test('settings are used: Speed to lead uses the report periods, the add-unit form the area units', () => {
  const page = read('app/(dashboard)/[orgSlug]/speed-to-lead/page.tsx')
  assert.match(page, /resolvePeriod\(period, \(await getWorkspaceSettings\(org\.id\)\)\.reports\)/)
  assert.match(read('components/inventory/InventoryForm.tsx'), /prefs\.areaUnitLand : prefs\.areaUnitBuilt/)
  assert.match(read('app/(dashboard)/[orgSlug]/layout.tsx'), /<WorkspacePrefsProvider value=\{\{ areaUnitBuilt: inv\.areaUnitBuilt, areaUnitLand: inv\.areaUnitLand[,} ]/)
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
