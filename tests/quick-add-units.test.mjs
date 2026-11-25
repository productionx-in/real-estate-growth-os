// tests/quick-add-units.test.mjs — "Add many units" (lib/inventory/quick-add.ts, QuickAddUnitsModal, the import route).
// Numbering ranges and floor-wise numbering, the 1000-unit cap, shared details on every row, and the generated rows
// passing the same validator a spreadsheet import uses (including duplicates already in the project).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const Q = await jiti.import(path.join(root, 'lib/inventory/quick-add.ts'))
const V = await jiti.import(path.join(root, 'lib/import/validator.ts'))
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
const IDENTITY = new Proxy({}, { get: (_, k) => k })

let passed = 0
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`) }
console.log('QUICK-ADD UNITS')

test('a range numbers units with the prefix, optionally zero-padded', () => {
  const a = Q.generateUnits({ mode: 'range', prefix: 'Plot ', start: 1, end: 3, pad: false })
  assert.equal(a.error, null)
  assert.deepEqual(a.units.map((u) => u.unit_number), ['Plot 1', 'Plot 2', 'Plot 3'])
  const b = Q.generateUnits({ mode: 'range', prefix: 'V-', start: 8, end: 10, pad: true })
  assert.deepEqual(b.units.map((u) => u.unit_number), ['V-08', 'V-09', 'V-10'])
})

test('floor-wise numbering: tower, ground floor as G, floor and tower recorded', () => {
  const r = Q.generateUnits({ mode: 'floors', tower: 'A', floorFrom: 0, floorTo: 1, perFloor: 2, separator: '-' })
  assert.equal(r.error, null)
  assert.deepEqual(r.units.map((u) => u.unit_number), ['A-G01', 'A-G02', 'A-101', 'A-102'])
  assert.ok(r.units.every((u) => u.tower_name === 'A'))
  assert.deepEqual(r.units.map((u) => u.floor_number), [0, 0, 1, 1])
  const noTower = Q.generateUnits({ mode: 'floors', tower: '', floorFrom: 12, floorTo: 12, perFloor: 1, separator: '-' })
  assert.deepEqual(noTower.units.map((u) => u.unit_number), ['1201'])
  assert.equal(noTower.units[0].tower_name, undefined)
})

test('bad input and more than 1000 units are refused with a plain reason', () => {
  assert.match(Q.generateUnits({ mode: 'range', prefix: '', start: 5, end: 2, pad: false }).error, /same or larger/)
  assert.match(Q.generateUnits({ mode: 'range', prefix: '', start: 1, end: 1001, pad: false }).error, /1000/)
  assert.equal(Q.generateUnits({ mode: 'range', prefix: '', start: 1, end: 1000, pad: false }).units.length, 1000)
  assert.match(Q.generateUnits({ mode: 'floors', tower: 'A', floorFrom: 1, floorTo: 60, perFloor: 20, separator: '-' }).error, /1200 units/)
  assert.match(Q.generateUnits({ mode: 'floors', tower: 'A', floorFrom: 1, floorTo: 2, perFloor: 0, separator: '-' }).error, /per floor/)
  assert.match(Q.generateUnits({ mode: 'range', prefix: '', start: 1.5, end: 3, pad: false }).error, /number/)
})

test('shared details go on every row; blanks are left out; the unit’s own values win', () => {
  const rows = Q.buildRows([{ unit_number: 'Plot 1' }, { unit_number: 'Plot 2' }], { area_value: ' 1200 ', area_unit: 'sqft', facing: '', total_price: '2500000' })
  assert.deepEqual(rows[0], { area_value: '1200', area_unit: 'sqft', total_price: '2500000', unit_number: 'Plot 1' })
  assert.equal(rows.length, 2)
  assert.ok(!('facing' in rows[1]))
})

test('generated rows pass the import validator, which still catches numbers already in the project', () => {
  const units = Q.generateUnits(Q.defaultSpec('plotted_developments')).units.slice(0, 5)
  const rows = Q.buildRows(units, { area_value: '1200', area_unit: 'sqyd' })
  const ok = V.validateImportRows({ rawRows: rows, columnMapping: IDENTITY, projectCategory: 'plotted_developments', projectId: '00000000-0000-0000-0000-000000000001' })
  assert.equal(ok.invalidRowsCount, 0, JSON.stringify(ok.allErrors))
  assert.equal(ok.validRowsCount, 5)
  const clash = V.validateImportRows({ rawRows: rows, columnMapping: IDENTITY, projectCategory: 'plotted_developments', projectId: '00000000-0000-0000-0000-000000000001', existingUnitNumbers: new Set(['plot 2']) })
  assert.equal(clash.duplicateInProjectCount, 1)
})

test('every category starts with sensible numbering, and the preview is short', () => {
  assert.equal(Q.defaultSpec('apartments').mode, 'floors')
  for (const c of ['plotted_developments', 'villas_gated_communities', 'commercial_sale', 'mixed_use']) assert.equal(Q.generateUnits(Q.defaultSpec(c)).error, null, c)
  const u = Q.generateUnits({ mode: 'range', prefix: 'Plot ', start: 1, end: 50, pad: false }).units
  assert.equal(Q.previewNumbers(u), 'Plot 1, Plot 2, Plot 3 … Plot 50')
  assert.equal(Q.previewNumbers(u.slice(0, 2)), 'Plot 1, Plot 2')
})

test('wiring: managers get "Add many", generated imports are recorded, a new project opens it', () => {
  const view = read('components/inventory/InventoryViewManager.tsx')
  assert.match(view, /QuickAddUnitsModal/)
  assert.match(view, /addUnits/)
  assert.match(read('components/projects/ProjectForm.tsx'), /\?addUnits=1/)
  assert.match(read('app/api/inventory/import/route.ts'), /'generated'/)
  assert.match(read('supabase/migrations/20260092_import_history_generated.sql'), /'generated'/)
  assert.match(read('components/inventory/QuickAddUnitsModal.tsx'), /\/api\/inventory\/import/)
})

console.log(`\nQuick-add units: ${passed} checks passed.`)
