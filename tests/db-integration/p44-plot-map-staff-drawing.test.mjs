// tests/db-integration/p44-plot-map-staff-drawing.test.mjs — option (c) end to end on the local Supabase stack
// (20260085, lib/dal/plot-map-staff.ts): staff cannot draw until the workspace allows it; while allowed they draw
// outlines and numbers but keep the customer's links, drop a link when its plot is renumbered, and never create one;
// withdrawing stops them at once; staff data carries no unit ids; clients cannot touch any of it.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) { console.error('FATAL: Supabase env required.'); process.exit(1) }
const RUN = crypto.randomBytes(4).toString('hex')
let passed = 0
async function test(name, fn) { try { await fn(); passed++; console.log(`  ✓ ${name}`) } catch (e) { console.error(`  ✗ ${name}`); throw e } }
const sq = (x, y, s = 0.1) => [[x, y], [x + s, y], [x + s, y + s], [x, y + s]]

async function main() {
  if (!globalThis.WebSocket) globalThis.WebSocket = class UnusedRealtimeTransport {}
  const jiti = createJiti(import.meta.url, { alias: { '@': root } })
  const T = await jiti.import(path.join(root, 'lib/dal/plot-map-staff.ts'))
  const S = await jiti.import(path.join(root, 'lib/dal/plot-map-shapes.ts'))
  const pg = await import('pg')
  const sql = new (pg.default || pg).Client({ connectionString: DATABASE_URL }); await sql.connect()
  const one = async (s, p) => (await sql.query(s, p)).rows[0]

  console.log('P44 — PLOT MAP STAFF DRAWING')
  const org = (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,'developer') RETURNING id`, [`Draw ${RUN}`, `draw-${RUN}`])).id
  const other = (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,'developer') RETURNING id`, [`Other ${RUN}`, `odraw-${RUN}`])).id
  const project = (await one(`INSERT INTO public.projects (org_id, name, slug, category) VALUES ($1,'Meadow Plots',$2,'plotted_developments') RETURNING id`, [org, `mp-${RUN}`])).id
  const unit = async (n) => (await one(`INSERT INTO public.inventory_items (org_id, project_id, unit_number, category, area_value, area_unit, plot_area, total_price, status)
    VALUES ($1,$2,$3,'plotted_developments',2400,'sqft',2400,5000000,'available') RETURNING id`, [org, project, n])).id
  const [u1, u2] = [await unit('M1'), await unit('M2')]
  const actor = (await one(`SELECT id FROM public.profiles LIMIT 1`))?.id ?? null
  await sql.query(`INSERT INTO public.project_addons (org_id, project_id, addon, status) VALUES ($1,$2,'plot_maps','active')`, [org, project])
  const layout = (await one(`INSERT INTO public.plot_layouts (org_id, project_id, name) VALUES ($1,$2,'Phase 1') RETURNING id`, [org, project])).id
  const doc = crypto.randomUUID(), version = crypto.randomUUID()
  await sql.query(`INSERT INTO public.plot_map_documents (id, org_id, project_id, layout_id, kind, file_name, byte_size, storage_path, status, sha256, page_count, pages)
    VALUES ($1,$2,$3,$4,'pdf','a.pdf',100,$5,'ready',$6,1,'[{"page":1,"width":842,"height":595,"rotate":0}]')`,
    [doc, org, project, layout, `org/${org}/project/${project}/documents/${doc}/original.pdf`, 'c'.repeat(64)])
  await sql.query(`INSERT INTO public.plot_map_versions (id, org_id, project_id, layout_id, document_id, version_no, page, render_status, image_width, image_height, image_path, thumb_path)
    VALUES ($1,$2,$3,$4,$5,1,1,'ready',1000,700,$6,$7)`,
    [version, org, project, layout, doc, `org/${org}/project/${project}/versions/${version}/page.png`, `org/${org}/project/${project}/versions/${version}/thumb.png`])
  // The customer draws and links two plots.
  await S.saveShapes(org, version, actor, [{ label: 'M1', kind: 'rect', points: sq(0, 0), unitId: u1 }, { label: 'M2', kind: 'rect', points: sq(0.2, 0), unitId: u2 }])
  const ids = Object.fromEntries((await sql.query('SELECT label, id FROM public.plot_map_shapes WHERE version_id=$1', [version])).rows.map((r) => [r.label, r.id]))

  await test('without the workspace’s permission staff see nothing and cannot save', async () => {
    assert.equal(await T.staffEditorData(org, version), null)
    assert.equal(await T.staffVersions(org, project), null)
    assert.equal((await T.saveShapesAsStaff(org, version, null, [{ label: 'X1', kind: 'rect', points: sq(0.5, 0.5) }])).status, 403)
  })

  await test('allowing: 1 to 31 days, one at a time, only in the project’s own workspace', async () => {
    assert.equal((await T.grantStaffAccess(org, project, actor, 40)).status, 400)
    assert.equal((await T.grantStaffAccess(other, project, actor, 7)).success, false)
    const g = await T.grantStaffAccess(org, project, actor, 14)
    assert.equal(g.success, true)
    assert.equal((await T.grantStaffAccess(org, project, actor, 7)).status, 409)
  })

  await test('staff data has page and outlines only — links are marked, never which unit', async () => {
    const d = await T.staffEditorData(org, version)
    const text = JSON.stringify(d)
    assert.ok(!text.includes(u1) && !text.includes(u2), 'no unit ids')
    assert.equal(d.shapes.find((s) => s.label === 'M1').unitId, `linked:${ids.M1}`)
    const v = await T.staffVersions(org, project)
    assert.equal(v.versions[0].plots, 2)
  })

  await test('staff draw: links kept by id and number, dropped on renumbering, never created', async () => {
    const r = await T.saveShapesAsStaff(org, version, null, [
      { id: ids.M1, label: 'M1', kind: 'rect', points: sq(0, 0, 0.12) },
      { id: ids.M2, label: 'M9', kind: 'rect', points: sq(0.2, 0) },
      { label: 'M3', kind: 'polygon', points: sq(0.5, 0.5) },
    ])
    assert.equal(r.success, true)
    const rows = Object.fromEntries((await sql.query('SELECT label, unit_id FROM public.plot_map_shapes WHERE version_id=$1', [version])).rows.map((x) => [x.label, x.unit_id]))
    assert.deepEqual(rows, { M1: u1, M9: null, M3: null })
    // Even a forged unit_id straight to the database function is ignored.
    await sql.query(`SELECT public.save_plot_map_shapes_as_staff($1,$2,NULL,$3)`, [org, version, JSON.stringify([
      { id: ids.M1, label: 'M1', kind: 'rect', points: sq(0, 0, 0.12), unit_id: u2 },
      { label: 'M4', kind: 'rect', points: sq(0.7, 0.7), unit_id: u2 },
    ])])
    const after = Object.fromEntries((await sql.query('SELECT label, unit_id FROM public.plot_map_shapes WHERE version_id=$1', [version])).rows.map((x) => [x.label, x.unit_id]))
    assert.deepEqual(after, { M1: u1, M4: null })
  })

  await test('withdrawing stops staff at once; the permission is kept as history and cannot be edited', async () => {
    assert.equal((await T.revokeStaffAccess(org, project, actor)).success, true)
    assert.equal((await T.saveShapesAsStaff(org, version, null, [{ label: 'M1', kind: 'rect', points: sq(0, 0) }])).status, 403)
    assert.equal(await T.staffEditorData(org, version), null)
    await assert.rejects(sql.query(`UPDATE public.plot_map_staff_access SET expires_at = expires_at + interval '1 day' WHERE project_id=$1`, [project]), /not edited/)
    assert.equal(Number((await one('SELECT count(*) n FROM public.plot_map_staff_access WHERE project_id=$1', [project])).n), 1)
  })

  await test('a lapsed add-on stops staff drawing even with an open permission', async () => {
    assert.equal((await T.grantStaffAccess(org, project, actor, 7)).success, true)
    await sql.query(`UPDATE public.project_addons SET status='suspended', status_reason='test' WHERE project_id=$1`, [project])
    assert.equal((await one('SELECT public.plot_map_staff_access_active($1) a', [project])).a, false)
    await sql.query(`UPDATE public.project_addons SET status='active' WHERE project_id=$1`, [project])
  })

  await test('clients cannot read permissions or call the staff functions', async () => {
    for (const role of ['anon', 'authenticated']) {
      await sql.query('BEGIN')
      try {
        await sql.query(`SET LOCAL ROLE ${role}`)
        for (const q of ['SELECT * FROM public.plot_map_staff_access', `SELECT public.plot_map_staff_access_active('${project}')`,
          `SELECT public.save_plot_map_shapes_as_staff('${org}','${version}',NULL,'[]')`]) {
          await sql.query('SAVEPOINT s'); await assert.rejects(sql.query(q), /permission denied/, `${role}: ${q}`); await sql.query('ROLLBACK TO SAVEPOINT s')
        }
      } finally { await sql.query('ROLLBACK') }
    }
  })

  await sql.query('DELETE FROM public.project_addons WHERE org_id=$1', [org])
  await sql.end()
  console.log(`\nP44 plot map staff drawing: ${passed} checks passed.`)
}
main().catch((e) => { console.error(e); process.exit(1) })
