// tests/plot-map-staff.test.mjs — option (c): RE staff draw plot boundaries only after the workspace allows it,
// only for a limited time, never see units and can never link one (20260085, lib/dal/plot-map-staff.ts).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
let passed = 0
const test = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`) }
const sql = read('supabase/migrations/20260085_plot_map_staff_drawing.sql')

console.log('PLOT MAP STAFF DRAWING')

test('the database: a permission is per project, at most 31 days, one open at a time, only withdrawn, never edited', () => {
  assert.match(sql, /expires_at <= granted_at \+ INTERVAL '31 days'/)
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS uq_plot_map_staff_access_open ON public\.plot_map_staff_access \(project_id\) WHERE revoked_at IS NULL/)
  assert.match(sql, /project belongs to another organisation/)
  assert.match(sql, /a permission is not edited/); assert.match(sql, /already withdrawn/)
  assert.match(sql, /TG_OP = 'INSERT' AND public\.project_addon_state\(NEW\.project_id, 'plot_maps'\) <> 'active'/)
})

test('staff saves keep the customer’s links by shape id and number, and can never create one', () => {
  const fn = sql.slice(sql.indexOf('FUNCTION public.save_plot_map_shapes_as_staff'))
  assert.match(fn, /IF NOT public\.plot_map_staff_access_active\(v\.project_id\) THEN/)
  assert.match(fn, /\(e - 'unit_id'\) \|\| jsonb_build_object\('unit_id',/, 'whatever unit_id is sent is dropped')
  assert.match(fn, /WHEN links -> \(e->>'id'\) ->> 'label' = lower\(btrim\(e->>'label'\)\) THEN links -> \(e->>'id'\) -> 'unit' END/)
  assert.match(fn, /RETURN public\.save_plot_map_shapes\(p_org, p_version, p_actor, safe\)/, 'the normal checks (draft only, add-on, ownership) still run')
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.save_plot_map_shapes_as_staff\(UUID, UUID, UUID, JSONB\) FROM PUBLIC, anon, authenticated/)
  assert.match(sql, /ENABLE ROW LEVEL SECURITY[\s\S]*REVOKE ALL ON public\.plot_map_staff_access FROM PUBLIC, anon, authenticated/)
})

test('staff never receive units: the editor data marks links without ids and the editor runs draw-only', () => {
  const dal = read('lib/dal/plot-map-staff.ts')
  const data = dal.slice(dal.indexOf('export async function staffEditorData'), dal.indexOf('export async function saveShapesAsStaff'))
  assert.doesNotMatch(data, /inventory_items|unit_number|total_price/)
  assert.match(data, /unitId: s\.unit_id \? `linked:\$\{s\.id\}` : null/)
  assert.doesNotMatch(dal.slice(dal.indexOf('export async function staffVersions')), /inventory_items|leads/)
  const editor = read('components/plots/ShapeEditor.tsx')
  assert.match(editor, /\.\.\.\(drawOnly \? \{\} : \{ unitId: s\.unitId \}\)/, 'draw-only saves send no unit ids')
  assert.match(editor, /\{drawOnly \? \(/)
  const page = read('app/platform/plot-maps/[orgId]/[projectId]/[versionId]/page.tsx')
  assert.match(page, /<ShapeEditor drawOnly endpoint=/); assert.match(page, /units=\{\[\]\}/)
})

test('routes: owners and admins allow or withdraw (audited); staff need CAN.plotMapSetup and MFA (audited, rate-limited)', () => {
  const ws = read('app/api/plot-maps/staff-access/route.ts')
  assert.match(ws, /authorizeOrgAccess\(orgId, \['owner', 'admin'\]\)/)
  assert.match(ws, /if \(giving\) \{ const a = await requireProjectAddon/, 'withdrawing never needs the add-on')
  assert.match(ws, /plot_map\.staff_drawing_allowed/); assert.match(ws, /plot_map\.staff_drawing_withdrawn/)
  const staff = read('app/api/admin/plot-maps/versions/[versionId]/shapes/route.ts')
  assert.equal((staff.match(/authenticatePlatformAdmin\(\[\.\.\.CAN\.plotMapSetup\], true\)/g) ?? []).length, 2)
  assert.match(staff, /checkDistributedRateLimit/); assert.match(staff, /logPlatformAction/)
  assert.doesNotMatch(staff, /unitId/, 'the staff body has no unit field (strict schema)')
})

console.log(`\nPlot map staff drawing: ${passed} checks passed.`)
