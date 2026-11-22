// tests/db-integration/p41-plot-map-shapes.test.mjs — the plot map editor's saves (20260082,
// lib/dal/plot-map-shapes.ts) against the local Supabase stack: shapes and confirmed links are saved atomically,
// ids and link history survive later saves, invalid drafts are refused by the server, other workspaces' units can
// never be linked, published versions are frozen, a lapsed add-on blocks edits, and clients cannot touch the table.
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
  const S = await jiti.import(path.join(root, 'lib/dal/plot-map-shapes.ts'))
  const pg = await import('pg')
  const sql = new (pg.default || pg).Client({ connectionString: DATABASE_URL }); await sql.connect()
  const one = async (s, p) => (await sql.query(s, p)).rows[0]

  console.log('P41 — PLOT MAP SHAPES')
  const org = (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,'developer') RETURNING id`, [`Shapes ${RUN}`, `shapes-${RUN}`])).id
  const other = (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,'developer') RETURNING id`, [`Other ${RUN}`, `shapes2-${RUN}`])).id
  const project = (await one(`INSERT INTO public.projects (org_id, name, slug, category) VALUES ($1,'Green Enclave',$2,'plotted_developments') RETURNING id`, [org, `gs-${RUN}`])).id
  const otherProject = (await one(`INSERT INTO public.projects (org_id, name, slug, category) VALUES ($1,'Elsewhere',$2,'plotted_developments') RETURNING id`, [other, `gs2-${RUN}`])).id
  const unit = async (p, o, n) => (await one(`INSERT INTO public.inventory_items (org_id, project_id, unit_number, category, area_value, area_unit, plot_area, status)
    VALUES ($1,$2,$3,'plotted_developments',2400,'sqft',2400,'available') RETURNING id`, [o, p, n])).id
  const [u1, u2, u3] = [await unit(project, org, 'N1'), await unit(project, org, 'N2'), await unit(project, org, 'N3')]
  const foreign = await unit(otherProject, other, 'N1')
  const actor = (await one(`SELECT id FROM public.profiles LIMIT 1`))?.id ?? null
  await sql.query(`INSERT INTO public.project_addons (org_id, project_id, addon, status) VALUES ($1,$2,'plot_maps','active')`, [org, project])
  const layout = (await one(`INSERT INTO public.plot_layouts (org_id, project_id, name) VALUES ($1,$2,'Phase 1') RETURNING id`, [org, project])).id
  const doc = crypto.randomUUID(), ver = crypto.randomUUID()
  await sql.query(`INSERT INTO public.plot_map_documents (id, org_id, project_id, layout_id, kind, file_name, byte_size, storage_path, status, sha256, page_count, pages)
    VALUES ($1,$2,$3,$4,'pdf','a.pdf',100,$5,'ready',$6,1,'[{"page":1,"width":842,"height":595,"rotate":0}]')`,
    [doc, org, project, layout, `org/${org}/project/${project}/documents/${doc}/original.pdf`, 'a'.repeat(64)])
  await sql.query(`INSERT INTO public.plot_map_versions (id, org_id, project_id, layout_id, document_id, version_no, page, render_status, image_width, image_height, image_path, thumb_path)
    VALUES ($1,$2,$3,$4,$5,1,1,'ready',4096,2894,$6,$7)`,
    [ver, org, project, layout, doc, `org/${org}/project/${project}/versions/${ver}/page.png`, `org/${org}/project/${project}/versions/${ver}/thumb.png`])

  let ids
  await test('a draft saves its plots and confirmed links in one go; warnings come back with it', async () => {
    const r = await S.saveShapes(org, ver, actor, [
      { label: 'N1', kind: 'rect', points: sq(0, 0), unitId: u1 },
      { label: 'N2', kind: 'polygon', points: sq(0.1, 0), unitId: null },
    ])
    assert.equal(r.success, true, r.error)
    assert.equal(r.data.saved, 2)
    assert.deepEqual(r.data.validation.unlinked, ['N2']); assert.deepEqual(r.data.validation.unmappedUnits.sort(), ['N2', 'N3'])
    assert.equal(r.data.submittable, true)
    const ed = await S.getEditorData(org, ver)
    assert.equal(ed.editable, true); assert.equal(ed.shapes.length, 2); assert.equal(ed.units.length, 3)
    ids = Object.fromEntries(ed.shapes.map((s) => [s.label, s.id]))
    assert.ok(ed.shapes.find((s) => s.label === 'N1').linkedAt)
  })

  await test('later saves keep ids and the original link time; swapping links between plots works', async () => {
    const before = await one('SELECT linked_at FROM public.plot_map_shapes WHERE id=$1', [ids.N1])
    await new Promise((r) => setTimeout(r, 20))
    let r = await S.saveShapes(org, ver, actor, [
      { id: ids.N1, label: 'N1', kind: 'rect', points: sq(0, 0), unitId: u1 },
      { id: ids.N2, label: 'N2', kind: 'polygon', points: sq(0.1, 0), unitId: u2 },
    ])
    assert.equal(r.success, true, r.error)
    assert.equal(String((await one('SELECT linked_at FROM public.plot_map_shapes WHERE id=$1', [ids.N1])).linked_at), String(before.linked_at), 'unchanged link keeps its time')
    r = await S.saveShapes(org, ver, actor, [
      { id: ids.N1, label: 'N1', kind: 'rect', points: sq(0, 0), unitId: u2 },
      { id: ids.N2, label: 'N2', kind: 'polygon', points: sq(0.1, 0), unitId: u1 },
    ])
    assert.equal(r.success, true, r.error)
    const rows = (await sql.query('SELECT id, label, unit_id FROM public.plot_map_shapes WHERE version_id=$1 ORDER BY label', [ver])).rows
    assert.deepEqual(rows.map((x) => [x.id, x.unit_id]), [[ids.N1, u2], [ids.N2, u1]])
  })

  await test('invalid drafts are refused before anything is written', async () => {
    const count = async () => Number((await one('SELECT count(*) n FROM public.plot_map_shapes WHERE version_id=$1', [ver])).n)
    const n = await count()
    for (const [bad, why] of [
      [[{ label: 'N1', kind: 'polygon', points: sq(0, 0), unitId: null }, { label: 'n1', kind: 'polygon', points: sq(0.3, 0), unitId: null }], /more than once/],
      [[{ label: 'N1', kind: 'polygon', points: sq(0, 0), unitId: u1 }, { label: 'N2', kind: 'polygon', points: sq(0.3, 0), unitId: u1 }], /more than one plot/],
      [[{ label: 'N1', kind: 'polygon', points: [[0, 0], [0.1, 0.1], [0.1, 0], [0, 0.1]], unitId: null }], /crosses itself/],
      [[{ label: 'N1', kind: 'polygon', points: sq(0, 0), unitId: foreign }], /not in this project/],
    ]) {
      const r = await S.saveShapes(org, ver, actor, bad)
      assert.equal(r.success, false); assert.match(r.error, why)
    }
    assert.equal(await count(), n, 'nothing changed')
    const ov = await S.saveShapes(org, ver, actor, [
      { id: ids.N1, label: 'N1', kind: 'rect', points: sq(0, 0), unitId: u2 },
      { id: ids.N2, label: 'N2', kind: 'polygon', points: sq(0.05, 0.05), unitId: u1 },
    ])
    assert.equal(ov.success, true, 'overlaps save as a draft…'); assert.equal(ov.data.submittable, false, '…but block review')
  })

  await test('other workspaces cannot read, save or link (app and database)', async () => {
    assert.equal(await S.getEditorData(other, ver), null)
    assert.equal((await S.saveShapes(other, ver, actor, [])).status, 404)
    await assert.rejects(sql.query(`INSERT INTO public.plot_map_shapes (org_id, project_id, version_id, label, points, unit_id, linked_at)
      VALUES ($1,$2,$3,'X','[[0,0],[0.1,0],[0.1,0.1]]',$4, now())`, [org, project, ver, foreign]), /another organisation or project/)
    await assert.rejects(sql.query(`INSERT INTO public.plot_map_shapes (org_id, project_id, version_id, label, points)
      VALUES ($1,$2,$3,'X','[[0,0],[0.1,0],[0.1,0.1]]')`, [other, otherProject, ver]), /another organisation or project/)
  })

  await test('a version under review or published is frozen; a lapsed add-on blocks edits', async () => {
    await sql.query(`UPDATE public.plot_map_versions SET status='in_review' WHERE id=$1`, [ver])
    assert.equal((await S.saveShapes(org, ver, actor, [])).status, 409)
    await assert.rejects(sql.query(`UPDATE public.plot_map_shapes SET label='Z' WHERE version_id=$1`, [ver]), /only a draft/)
    await assert.rejects(sql.query(`DELETE FROM public.plot_map_shapes WHERE version_id=$1`, [ver]), /only a draft/)
    assert.equal((await S.getEditorData(org, ver)).editable, false)
    await sql.query(`UPDATE public.plot_map_versions SET status='draft' WHERE id=$1`, [ver])
    await sql.query(`UPDATE public.project_addons SET status='suspended' WHERE project_id=$1`, [project])
    assert.equal((await S.saveShapes(org, ver, actor, [])).status, 403)
    await sql.query(`UPDATE public.project_addons SET status='active' WHERE project_id=$1`, [project])
  })

  await test('clients can neither read nor write shapes, nor call the save function', async () => {
    for (const role of ['anon', 'authenticated']) {
      await sql.query('BEGIN')
      try {
        await sql.query(`SET LOCAL ROLE ${role}`)
        for (const q of ['SELECT * FROM public.plot_map_shapes', `SELECT public.save_plot_map_shapes('${org}','${ver}',NULL,'[]')`]) {
          await sql.query('SAVEPOINT s'); await assert.rejects(sql.query(q), /permission denied/, `${role}: ${q}`); await sql.query('ROLLBACK TO SAVEPOINT s')
        }
      } finally { await sql.query('ROLLBACK') }
    }
    void u3
  })

  await sql.query('DELETE FROM public.project_addons WHERE org_id = ANY($1)', [[org, other]])
  await sql.end()
  console.log(`\nP41 plot map shapes: ${passed} checks passed.`)
}
main().catch((e) => { console.error(e); process.exit(1) })
