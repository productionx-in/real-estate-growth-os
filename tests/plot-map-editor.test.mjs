// tests/plot-map-editor.test.mjs — Interactive Plot Map editor (20260082): plot geometry rules (normalised
// coordinates, self-crossing outlines, overlaps vs. shared boundaries), the validation report, confirmed-only links,
// and the server/database rules behind saving a draft.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
const G = await jiti.import(path.join(root, 'lib/plots/geometry.ts'))
const sql = read('supabase/migrations/20260082_plot_map_shapes.sql')
let passed = 0
const test = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`) }
const sq = (x, y, s = 0.1) => [[x, y], [x + s, y], [x + s, y + s], [x, y + s]]
const shape = (label, points, unitId = null, kind = 'polygon') => ({ label, kind, points, unitId })

test('neighbouring plots that share a boundary do not overlap; crossing, nested and identical plots do', () => {
  assert.equal(G.overlaps(sq(0, 0), sq(0.1, 0)), false, 'shared edge')
  assert.equal(G.overlaps(sq(0, 0), sq(0.1, 0.1)), false, 'shared corner')
  assert.equal(G.overlaps(sq(0, 0), sq(0.05, 0.05)), true, 'crossing')
  assert.equal(G.overlaps(sq(0, 0, 0.3), sq(0.1, 0.1, 0.05)), true, 'one inside the other')
  assert.equal(G.overlaps(sq(0, 0), sq(0, 0)), true, 'identical')
  assert.equal(G.overlaps(sq(0, 0), sq(0.5, 0.5)), false, 'far apart')
})

test('a plot outline must be closed, inside the page, not crossing itself and not degenerate', () => {
  assert.equal(G.shapeProblem(shape('N1', sq(0, 0))), null)
  assert.match(G.shapeProblem(shape('N1', [[0, 0], [0.1, 0.1], [0.1, 0], [0, 0.1]])), /crosses itself/)
  assert.match(G.shapeProblem(shape('N1', [[0, 0], [0.5, 0.5], [1, 1]])), /too small/)
  assert.match(G.shapeProblem(shape('N1', [[0, 0], [1.2, 0], [0, 1]])), /outside the page/)
  assert.match(G.shapeProblem(shape('', sq(0, 0))), /needs a number/)
  assert.match(G.shapeProblem(shape('N1', [[0, 0], [0.1, 0], [0.1, 0.1]], null, 'rect')), /rectangle/)
  assert.match(G.shapeProblem(shape('N1', [[0, 0], [0.1, 0]])), /at least 3/)
})

test('the validation report: duplicates and overlaps block review; unlinked plots and unmapped units are warnings', () => {
  const units = [{ id: 'u1', unit_number: 'N1' }, { id: 'u2', unit_number: 'N2' }, { id: 'u3', unit_number: 'N3' }]
  const v = G.validateShapes([
    shape('N1', sq(0, 0), 'u1'), shape('n1 ', sq(0.2, 0)), shape('N2', sq(0.05, 0.05), 'u1'), shape('N9', sq(0.6, 0.6)),
  ], units)
  assert.deepEqual(v.duplicateLabels, ['N1'])
  assert.deepEqual(v.duplicateUnits, ['N1'])
  assert.deepEqual(v.overlaps, [['N1', 'N2']])
  assert.deepEqual(v.unlinked.sort(), ['N9', 'n1'])
  assert.deepEqual(v.unmappedUnits.sort(), ['N2', 'N3'])
  assert.equal(G.isSubmittable(v), false)
  const ok = G.validateShapes([shape('N1', sq(0, 0), 'u1'), shape('N2', sq(0.1, 0), 'u2')], units)
  assert.equal(G.isSubmittable(ok), true, 'an unmapped unit (N3) does not block')
  assert.match(G.validateShapes([shape('N1', sq(0, 0), 'zz')], units).errors[0], /not in this project/)
})

test('stored points are rounded to 6 decimals and labels tidied', () => {
  assert.deepEqual(G.cleanShape(shape('  N  12 ', [[0.1234567, 0], [0.5, 0.33333333], [0, 0.9999999]])), shape('N 12', [[0.123457, 0], [0.5, 0.333333], [0, 1]]))
})

test('only confirmed links are stored: suggestions live in the browser and need a click', () => {
  const ed = read('components/plots/ShapeEditor.tsx')
  assert.match(ed, /initialShapes\.map\(\(s\) => \(\{ \.\.\.s, key: newKey\(\) \}\)\)/, 'loaded as saved, nothing auto-linked')
  assert.match(ed, /found\.length === 1 && !usedUnits\.has\(found\[0\]\.id\)/, 'a suggestion only when one unused unit matches')
  for (const m of ed.matchAll(/unitId: (suggestion\(sel\)!\.id|u\.id)/g)) assert.ok(m, 'set from a button')
  assert.match(ed, /onClick=\{\(\) => commit\(shapes\.map\(\(s\) => \{ const u = suggestion\(s\)/, 'bulk link is an explicit action')
  assert.match(sql, /Suggested matches are never stored/)
  assert.match(sql, /CHECK \(unit_id IS NULL OR linked_at IS NOT NULL\)/)
})

test('saving: server validation first, then one transaction; the database freezes non-drafts and checks units and the add-on', () => {
  const dal = read('lib/dal/plot-map-shapes.ts')
  assert.match(dal, /if \(v\.status !== 'draft' && v\.status !== 'rejected'\)/)
  assert.match(dal, /validateShapes\(clean, units/)
  assert.match(dal, /rpc\('save_plot_map_shapes'/)
  assert.match(sql, /IF v\.status NOT IN \('draft', 'rejected'\) THEN[\s\S]*only a draft version can be edited/)
  assert.match(sql, /plot map shape: unit belongs to another organisation or project/)
  assert.match(sql, /project_addon_state\(r\.project_id, 'plot_maps'\) <> 'active'/)
  assert.match(sql, /uq_plot_map_shapes_label ON public\.plot_map_shapes \(version_id, lower\(btrim\(label\)\)\)/)
  assert.match(sql, /uq_plot_map_shapes_unit ON public\.plot_map_shapes \(version_id, unit_id\) WHERE unit_id IS NOT NULL/)
  assert.match(sql, /BEFORE INSERT OR UPDATE OR DELETE ON public\.plot_map_shapes/)
  assert.match(sql, /ALTER TABLE public\.plot_map_shapes ENABLE ROW LEVEL SECURITY;/)
  assert.match(sql, /REVOKE ALL ON public\.plot_map_shapes FROM PUBLIC, anon, authenticated;/)
  assert.match(sql, /an unchanged link keeps its original person and time/)
})

test('the routes and the editor page run the same gate; saves are rate-limited and audited', () => {
  const r = read('app/api/plot-maps/versions/[versionId]/shapes/route.ts')
  for (const h of r.match(/export async function (GET|PUT)[\s\S]*?\n\}/g)) assert.match(h, /gatePlotMapWrite\(orgId, \(\) => versionProject\(orgId, versionId\)\)/)
  assert.match(r, /z\.tuple\(\[z\.number\(\)\.min\(0\)\.max\(1\), z\.number\(\)\.min\(0\)\.max\(1\)\]\)/, 'normalised coordinates only')
  assert.match(r, /\.strict\(\)/); assert.match(r, /plot_map\.shapes_saved/); assert.match(r, /limit: 30, windowMs: 60_000/)
  const page = read('app/(dashboard)/[orgSlug]/projects/[projectId]/map/versions/[versionId]/page.tsx')
  assert.match(page, /if \(!isManager\) redirect\(mapHref\)/)
  assert.match(page, /if \(addon\.state !== 'active' \|\| !modules\.inventory\) redirect\(mapHref\)/)
  assert.match(page, /if \(!v \|\| v\.project_id !== projectId\) notFound\(\)/)
})

test('the editor never injects HTML and does not read refs while rendering', () => {
  const ed = read('components/plots/ShapeEditor.tsx')
  assert.doesNotMatch(ed, /dangerouslySetInnerHTML/)
  assert.match(ed, /new ResizeObserver/)
})

console.log(`\nPlot map editor: ${passed} checks passed.`)
