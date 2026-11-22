// tests/db-integration/p42-plot-map-publishing.test.mjs — review and publishing (20260083,
// lib/dal/plot-map-publishing.ts) end to end on the local Supabase stack: a draft with overlaps cannot be submitted;
// approval needs QA; publishing switches the map (team and public) to the version, live statuses come from inventory,
// a newer version supersedes the old one without touching its plots, buyers never get internal ids, and a lapsed
// add-on stops everything.
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
  const P = await jiti.import(path.join(root, 'lib/dal/plot-map-publishing.ts'))
  const S = await jiti.import(path.join(root, 'lib/dal/plot-map-shapes.ts'))
  const L = await jiti.import(path.join(root, 'lib/dal/plot-layouts.ts'))
  const pg = await import('pg')
  const sql = new (pg.default || pg).Client({ connectionString: DATABASE_URL }); await sql.connect()
  const one = async (s, p) => (await sql.query(s, p)).rows[0]

  console.log('P42 — PLOT MAP PUBLISHING')
  const org = (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,'developer') RETURNING id`, [`Publish ${RUN}`, `publish-${RUN}`])).id
  const project = (await one(`INSERT INTO public.projects (org_id, name, slug, category) VALUES ($1,'Green Enclave',$2,'plotted_developments') RETURNING id`, [org, `gp-${RUN}`])).id
  const unit = async (n, status = 'available') => (await one(`INSERT INTO public.inventory_items (org_id, project_id, unit_number, category, area_value, area_unit, plot_area, total_price, status, internal_notes)
    VALUES ($1,$2,$3,'plotted_developments',2400,'sqft',2400,5000000,$4,'internal: do not show') RETURNING id`, [org, project, n, status])).id
  const [u1, u2] = [await unit('N1'), await unit('N2', 'on_hold')]
  const actor = (await one(`SELECT id FROM public.profiles LIMIT 1`))?.id ?? null
  await sql.query(`INSERT INTO public.project_addons (org_id, project_id, addon, status) VALUES ($1,$2,'plot_maps','active')`, [org, project])
  const layout = (await one(`INSERT INTO public.plot_layouts (org_id, project_id, name) VALUES ($1,$2,'Phase 1') RETURNING id`, [org, project])).id
  const doc = crypto.randomUUID()
  await sql.query(`INSERT INTO public.plot_map_documents (id, org_id, project_id, layout_id, kind, file_name, byte_size, storage_path, status, sha256, page_count, pages)
    VALUES ($1,$2,$3,$4,'pdf','a.pdf',100,$5,'ready',$6,1,'[{"page":1,"width":842,"height":595,"rotate":0}]')`,
    [doc, org, project, layout, `org/${org}/project/${project}/documents/${doc}/original.pdf`, 'a'.repeat(64)])
  const version = async (n) => {
    const id = crypto.randomUUID()
    await sql.query(`INSERT INTO public.plot_map_versions (id, org_id, project_id, layout_id, document_id, version_no, page, render_status, image_width, image_height, image_path, thumb_path)
      VALUES ($1,$2,$3,$4,$5,$6,1,'ready',1000,700,$7,$8)`,
      [id, org, project, layout, doc, n, `org/${org}/project/${project}/versions/${id}/page.png`, `org/${org}/project/${project}/versions/${id}/thumb.png`])
    return id
  }
  const v1 = await version(1)

  await test('a draft with overlapping plots cannot be submitted; a clean one can', async () => {
    await S.saveShapes(org, v1, actor, [
      { label: 'N1', kind: 'rect', points: sq(0, 0), unitId: u1 },
      { label: 'N2', kind: 'polygon', points: sq(0.05, 0.05), unitId: u2 },
    ])
    const bad = await P.versionAction(org, v1, actor, 'submit', null)
    assert.equal(bad.success, false); assert.match(bad.error, /overlap/)
    await S.saveShapes(org, v1, actor, [
      { label: 'N1', kind: 'rect', points: sq(0, 0), unitId: u1 },
      { label: 'N2', kind: 'polygon', points: sq(0.1, 0), unitId: u2 },
      { label: 'X9', kind: 'polygon', points: sq(0.5, 0.5), unitId: null },
    ])
    assert.deepEqual((await P.versionAction(org, v1, actor, 'submit', null)).data, { status: 'in_review' })
  })

  await test('approval needs a QA pass; sending back needs a reason and makes it editable again', async () => {
    const early = await P.versionAction(org, v1, actor, 'approve', null)
    assert.equal(early.success, false); assert.match(early.error, /QA pass/)
    assert.equal((await P.versionAction(org, v1, actor, 'reject', '')).status, 400)
    assert.equal((await P.versionAction(org, v1, actor, 'reject', 'Plot N2 is drawn too wide')).data.status, 'rejected')
    assert.equal((await S.getEditorData(org, v1)).editable, true)
    await P.versionAction(org, v1, actor, 'submit', null)
    await P.versionAction(org, v1, actor, 'qa_pass', 'Checked against the approved layout')
    assert.equal((await P.versionAction(org, v1, actor, 'approve', null)).data.status, 'approved')
  })

  let token
  await test('publishing switches the map to the version; statuses come live from inventory', async () => {
    assert.equal((await P.versionAction(org, v1, actor, 'publish', null)).data.status, 'published')
    const row = await one('SELECT published_version_id, status FROM public.plot_layouts WHERE id=$1', [layout])
    assert.deepEqual([row.published_version_id, row.status], [v1, 'published'])
    const live = await L.getLiveLayout(org, layout)
    assert.equal(live.versionId, v1); assert.equal(live.viewBox, '0 0 1000 700')
    assert.deepEqual(Object.keys(live.plots).sort(), ['N1', 'N2'], 'only confirmed links become plots with details')
    assert.equal(live.geometry.shapes.length, 3, 'the unlinked plot is still drawn')
    assert.equal(live.plots.N2.status, 'on_hold')
    assert.equal(live.imagePath, undefined, 'storage paths never leave the server for the team page either')
    token = (await L.updateLayout(org, layout, actor, { share: true })).data.shareToken
  })

  await test('buyers: available / reserved / sold only, no prices unless chosen, no internal ids, no notes', async () => {
    const pub = await L.openSharedLayout(token)
    assert.equal(pub.image.href, `/api/public/plot-maps/${token}/image`)
    assert.deepEqual([pub.plots.N1.status, pub.plots.N2.status], ['available', 'reserved'])
    assert.equal(pub.plots.N1.price, null)
    assert.equal(pub.plots.N1.unitId, '')
    const sent = { ...pub }; delete sent.orgId; delete sent.imagePath // what the page could ever pass on
    assert.ok(!JSON.stringify(sent).includes('do not show') && !JSON.stringify(sent).includes(u1))
    await sql.query(`UPDATE public.inventory_items SET status='booked' WHERE id=$1`, [u1])
    assert.equal((await L.openSharedLayout(token)).plots.N1.status, 'sold', 'a booking shows at once')
  })

  await test('a newer version supersedes the old one, which keeps its plots and links', async () => {
    const v2 = await version(2)
    await S.saveShapes(org, v2, actor, [{ label: 'N1', kind: 'rect', points: sq(0.2, 0.2), unitId: u1 }])
    for (const a of ['submit', 'qa_pass', 'approve', 'publish']) assert.equal((await P.versionAction(org, v2, actor, a, null)).success, true, a)
    const st = (await sql.query('SELECT id, status FROM public.plot_map_versions WHERE layout_id=$1 ORDER BY version_no', [layout])).rows
    assert.deepEqual(st.map((r) => r.status), ['superseded', 'published'])
    assert.equal(Number((await one('SELECT count(*) n FROM public.plot_map_shapes WHERE version_id=$1 AND unit_id IS NOT NULL', [v1])).n), 2)
    assert.equal((await L.openSharedLayout(token)).versionId, v2)
    assert.equal((await P.versionAction(org, v1, actor, 'publish', null)).success, false, 'history cannot be republished')
    const hist = (await P.listReviews(org, project)).filter((r) => r.versionId === v1).map((r) => r.action)
    assert.ok(hist.includes('superseded') && hist.includes('rejected'))
  })

  await test('a lapsed add-on stops review, publishing and the public map', async () => {
    await sql.query(`UPDATE public.project_addons SET status='suspended', status_reason='test' WHERE project_id=$1`, [project])
    const v3 = await version(3).catch((e) => e)
    assert.ok(v3 instanceof Error && /not active/.test(v3.message), 'no new version')
    assert.equal(await L.openSharedLayout(token), null)
    await sql.query(`UPDATE public.project_addons SET status='active' WHERE project_id=$1`, [project])
  })

  await test('clients cannot read reviews or call the review function', async () => {
    for (const role of ['anon', 'authenticated']) {
      await sql.query('BEGIN')
      try {
        await sql.query(`SET LOCAL ROLE ${role}`)
        for (const q of ['SELECT * FROM public.plot_map_reviews', `SELECT public.plot_map_version_action('${org}','${v1}',NULL,'publish',NULL)`]) {
          await sql.query('SAVEPOINT s'); await assert.rejects(sql.query(q), /permission denied/, `${role}: ${q}`); await sql.query('ROLLBACK TO SAVEPOINT s')
        }
      } finally { await sql.query('ROLLBACK') }
    }
  })

  await sql.query('DELETE FROM public.project_addons WHERE org_id=$1', [org])
  await sql.end()
  console.log(`\nP42 plot map publishing: ${passed} checks passed.`)
}
main().catch((e) => { console.error(e); process.exit(1) })
