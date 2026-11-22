// tests/project-unit-delete.test.mjs — deleting projects and units (lib/dal/deletion.ts, the two DELETE routes and
// the screens): owners and admins only, the name typed to confirm a project, never while real business is attached,
// audited, and offered in the UI only to those the server allows.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const d = await jiti.import(path.join(root, 'lib/dal/deletion.ts'))
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8')
let passed = 0
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`) }

console.log('DELETING PROJECTS AND UNITS')

test('the reasons read naturally', () => {
  assert.equal(d.describeBlockers([{ what: 'booking', count: 2 }]), '2 bookings')
  assert.equal(d.describeBlockers([{ what: 'booking', count: 1 }, { what: 'site visit', count: 3 }, { what: 'deal', count: 1 }]), '1 booking, 3 site visits and 1 deal')
  assert.equal(d.describeBlockers([{ what: 'unit that is booked', count: 1 }]), 'it is booked')
})

test('project delete: owners and admins, exact name, refused with the reasons while anything real is attached, audited', () => {
  const r = read('app/api/projects/[projectId]/route.ts')
  const del = r.slice(r.indexOf('export async function DELETE'))
  assert.match(del, /authorizeProjectAccess\(projectId, \['owner', 'admin'\]\)/)
  assert.match(del, /body\.confirmName\.trim\(\) !== project\.name\.trim\(\)/)
  assert.ok(del.indexOf('projectDeleteBlockers') < del.indexOf(".delete()"), 'checked before deleting')
  assert.match(del, /status: 409/)
  assert.match(del, /\.eq\('id', projectId\)\s*\.eq\('org_id', orgId\)/)
  assert.match(del, /'project\.deleted'/)
  for (const t of ["count('bookings'", "count('deals'", "count('site_visits'", "'on_hold', 'booked', 'sold'", "count('partnership_projects'"]) assert.ok(read('lib/dal/deletion.ts').includes(t), t)
})

test('unit delete: owners and admins, never on hold / booked / sold or with a booking, audited', () => {
  const r = read('app/api/inventory/[inventoryId]/route.ts')
  const del = r.slice(r.indexOf('export async function DELETE'))
  assert.match(del, /authorizeInventoryAccess\(inventoryId, \['owner', 'admin'\]\)/)
  assert.ok(del.indexOf('unitDeleteBlockers') < del.indexOf('.delete()'))
  assert.match(del, /'inventory\.deleted'/)
  assert.doesNotMatch(del, /delError\.message/, 'no raw database errors')
})

test('the screens offer delete only to owners and admins', () => {
  assert.match(read('app/(dashboard)/[orgSlug]/projects/[projectId]/page.tsx'), /\{isAdmin && <DeleteProjectDialog/)
  assert.match(read('app/(dashboard)/[orgSlug]/projects/page.tsx'), /canDelete=\{isAdmin\}/)
  assert.match(read('app/(dashboard)/[orgSlug]/layout.tsx'), /canDeleteInventory: workspace\.isAdmin/)
  assert.match(read('components/inventory/InventoryDetailDrawer.tsx'), /\{canDeleteInventory && \(/)
  assert.match(read('components/projects/DeleteProjectDialog.tsx'), /disabled=\{!matches\}/)
})

console.log(`\nDeleting projects and units: ${passed} checks passed.`)
