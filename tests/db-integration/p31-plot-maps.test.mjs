// tests/db-integration/p31-plot-maps.test.mjs — interactive plot maps (migration 20260072, lib/dal/plot-layouts.ts)
// against the local Supabase stack: tenant isolation, the per-project add-on gate (20260080) in the app and the
// database, publishing and public links, live statuses, entitlement history.
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

const LAYOUT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200">
  <rect x="0" y="95" width="400" height="10" fill="#cccccc"/>
  <rect id="N1" x="0" y="0" width="90" height="90"/><rect id="N2" x="100" y="0" width="90" height="90"/>
  <rect id="N-3" x="200" y="0" width="90" height="90"/><rect id="X9" x="300" y="0" width="90" height="90"/>
  <script>alert(1)</script></svg>`

async function main() {
  if (!globalThis.WebSocket) globalThis.WebSocket = class UnusedRealtimeTransport {}
  const jiti = createJiti(import.meta.url, { alias: { '@': root } })
  const maps = await jiti.import(path.join(root, 'lib/dal/plot-layouts.ts'))
  const { getProjectAddon } = await jiti.import(path.join(root, 'lib/plots/addons.ts'))
  const pg = await import('pg')
  const sql = new (pg.default || pg).Client({ connectionString: DATABASE_URL }); await sql.connect()
  const one = async (s, p) => (await sql.query(s, p)).rows[0]

  console.log('P31 — INTERACTIVE PLOT MAPS')
  const org = (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,'developer') RETURNING id`, [`Plots ${RUN}`, `plots-${RUN}`])).id
  const other = (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,'developer') RETURNING id`, [`Other ${RUN}`, `plots2-${RUN}`])).id
  const project = (await one(`INSERT INTO public.projects (org_id, name, slug, category) VALUES ($1,'Green Enclave',$2,'plotted_developments') RETURNING id`, [org, `ge-${RUN}`])).id
  const otherProject = (await one(`INSERT INTO public.projects (org_id, name, slug, category) VALUES ($1,'Elsewhere',$2,'plotted_developments') RETURNING id`, [other, `else-${RUN}`])).id
  const unit = async (p, o, n, status = 'available', price = 5000000) => (await one(`INSERT INTO public.inventory_items (org_id, project_id, unit_number, category, area_value, area_unit, plot_area, facing, total_price, status, internal_notes)
    VALUES ($1,$2,$3,'plotted_developments',2400,'sqft',2400,'East',$4,$5,'internal: do not show') RETURNING id`, [o, p, n, price, status])).id
  const u1 = await unit(project, org, 'N1'); const u2 = await unit(project, org, 'N2', 'on_hold'); const u3 = await unit(project, org, 'N3', 'sold'); await unit(project, org, 'S1')
  const foreign = await unit(otherProject, other, 'N1')
  const manager = (await one(`SELECT id FROM public.profiles LIMIT 1`))?.id ?? null

  const state = async (p = project) => (await one(`SELECT public.project_addon_state($1,'plot_maps') s`, [p])).s
  await test('not purchased by default: the app and the database both refuse to create a map', async () => {
    assert.equal((await getProjectAddon(org, project, 'plot_maps')).state, 'not_purchased')
    assert.equal(await state(), 'not_purchased')
    await assert.rejects(sql.query(`INSERT INTO public.plot_layouts (org_id, project_id, name, view_box, geometry) VALUES ($1,$2,'x','0 0 1 1','{}')`, [org, project]), /add-on is not active/)
    const r = await maps.saveLayout(org, project, manager, { name: 'Phase 1', svg: LAYOUT })
    assert.equal(r.success, false)
  })

  await test('pending does not grant; activation is per project and recorded in the history', async () => {
    await sql.query(`INSERT INTO public.project_addons (org_id, project_id, addon, status) VALUES ($1,$2,'plot_maps','pending')`, [org, project])
    assert.equal(await state(), 'pending')
    await assert.rejects(sql.query(`INSERT INTO public.plot_layouts (org_id, project_id, name, view_box, geometry) VALUES ($1,$2,'x','0 0 1 1','{}')`, [org, project]), /add-on is not active/)
    await sql.query(`UPDATE public.project_addons SET status='active' WHERE project_id=$1`, [project])
    assert.equal(await state(), 'active')
    assert.equal(await state(otherProject), 'not_purchased', 'another project of any workspace is unaffected')
    const ev = (await sql.query(`SELECT from_status, to_status FROM public.project_addon_events WHERE project_id=$1 ORDER BY created_at, to_status`, [project])).rows
    assert.deepEqual(ev.map((e) => `${e.from_status}->${e.to_status}`), ['null->pending', 'pending->active'])
    assert.ok((await one(`SELECT activated_at FROM public.project_addons WHERE project_id=$1`, [project])).activated_at)
    await assert.rejects(sql.query(`INSERT INTO public.project_addons (org_id, project_id, addon, status) VALUES ($1,$2,'plot_maps','active')`, [other, project]), /another organisation/)
    await assert.rejects(sql.query(`UPDATE public.project_addons SET project_id=$2 WHERE project_id=$1`, [project, otherProject]), /cannot change/)
  })

  let layoutId
  await test('upload: the drawing becomes geometry only, plots link to this project’s units, the rest is reported', async () => {
    const r = await maps.saveLayout(org, project, manager, { name: 'Phase 1', svg: LAYOUT })
    assert.equal(r.success, true, r.error)
    layoutId = r.data.id
    assert.deepEqual(r.data.report.links.map((l) => l.unitNumber).sort(), ['N1', 'N2', 'N3'])
    assert.deepEqual(r.data.report.unmatchedShapes, ['X9']); assert.deepEqual(r.data.report.unitsWithoutShape, ['S1'])
    const stored = await one('SELECT geometry::text g, status FROM public.plot_layouts WHERE id=$1', [layoutId])
    assert.ok(!/script|alert/i.test(stored.g), 'no markup stored'); assert.equal(stored.status, 'draft')
  })

  await test('tenant isolation: another organisation’s project or unit can never be linked (app and database)', async () => {
    const r = await maps.saveLayout(other, project, manager, { name: 'Hijack', svg: LAYOUT })
    assert.deepEqual([r.success, r.status], [false, 404])
    await assert.rejects(sql.query(`INSERT INTO public.plot_layout_links (layout_id, org_id, shape_key, unit_id) VALUES ($1,$2,'Z1',$3)`, [layoutId, org, foreign]), /another organisation or project/)
    await assert.rejects(sql.query(`INSERT INTO public.plot_layouts (org_id, project_id, name, view_box, geometry) VALUES ($1,$2,'x','0 0 1 1','{}')`, [other, project]), /another organisation/)
    assert.equal(await maps.getLiveLayout(other, layoutId), null)
    assert.equal((await maps.updateLayout(other, layoutId, manager, { publish: true })).success, false)
  })

  await test('live statuses come from inventory: a change shows at once, with no copy to update', async () => {
    let live = await maps.getLiveLayout(org, layoutId)
    assert.equal(live.plots.N1.status, 'available'); assert.equal(live.plots['N-3'].status, 'sold')
    await sql.query(`UPDATE public.inventory_items SET status='booked' WHERE id=$1`, [u1])
    live = await maps.getLiveLayout(org, layoutId)
    assert.equal(live.plots.N1.status, 'booked')
    assert.ok(!JSON.stringify(live).includes('do not show'), 'internal notes never reach the map')
  })

  await test('sharing needs a published map; unpublishing turns the link off', async () => {
    assert.equal((await maps.updateLayout(org, layoutId, manager, { share: true })).success, false)
    assert.equal((await maps.updateLayout(org, layoutId, manager, { publish: true })).success, true)
    const shared = await maps.updateLayout(org, layoutId, manager, { share: true })
    assert.equal(shared.data.shareEnabled, true); assert.match(shared.data.shareToken, /^[A-Za-z0-9_-]{43}$/)
    await maps.updateLayout(org, layoutId, manager, { publish: false })
    assert.equal((await one('SELECT share_enabled FROM public.plot_layouts WHERE id=$1', [layoutId])).share_enabled, false)
  })

  await test('public link: buyers see available/reserved/sold and no prices unless chosen', async () => {
    await maps.updateLayout(org, layoutId, manager, { publish: true }); const s = await maps.updateLayout(org, layoutId, manager, { share: true })
    const token = s.data.shareToken
    let pub = await maps.openSharedLayout(token)
    assert.equal(pub.projectName, 'Green Enclave')
    assert.deepEqual([pub.plots.N1.status, pub.plots.N2.status, pub.plots['N-3'].status], ['sold', 'reserved', 'sold'])
    assert.equal(pub.plots.N2.price, null, 'prices hidden by default')
    await maps.updateLayout(org, layoutId, manager, { showPrices: true })
    pub = await maps.openSharedLayout(token)
    assert.equal(Number(pub.plots.N2.price), 5000000)
    assert.ok(await maps.rotateShareLink(org, layoutId))
    assert.equal(await maps.openSharedLayout(token), null, 'the old link dies when a new one is issued')
    assert.equal(await maps.openSharedLayout('not-a-token'), null)
    void u2; void u3
  })

  await test('suspended or expired: the public map dies, nothing can be changed or published, but it can be taken offline', async () => {
    const token = (await maps.updateLayout(org, layoutId, manager, { share: true })).data.shareToken
    assert.ok(await maps.openSharedLayout(token))
    await sql.query(`UPDATE public.project_addons SET status='suspended', status_reason='Unpaid invoice' WHERE project_id=$1`, [project])
    assert.equal(await state(), 'suspended')
    assert.equal(await maps.openSharedLayout(token), null, 'suspended: no public map')
    await assert.rejects(sql.query(`UPDATE public.plot_layouts SET geometry='{"shapes":[]}' WHERE id=$1`, [layoutId]), /add-on is not active/)
    await assert.rejects(sql.query(`UPDATE public.plot_layouts SET show_prices = NOT show_prices WHERE id=$1`, [layoutId]), /add-on is not active/)
    await assert.rejects(sql.query(`INSERT INTO public.plot_layout_links (layout_id, org_id, shape_key, unit_id) VALUES ($1,$2,'S1',(SELECT id FROM public.inventory_items WHERE project_id=$3 AND unit_number='S1'))`, [layoutId, org, project]), /add-on is not active/)
    assert.equal((await maps.updateLayout(org, layoutId, manager, { publish: false })).success, true, 'unpublishing is always allowed')
    await assert.rejects(sql.query(`UPDATE public.plot_layouts SET status='published' WHERE id=$1`, [layoutId]), /add-on is not active/)
    await sql.query(`UPDATE public.project_addons SET status='active', valid_until = now() - interval '1 minute' WHERE project_id=$1`, [project])
    assert.equal(await state(), 'expired')
    assert.equal((await getProjectAddon(org, project, 'plot_maps')).state, 'expired', 'app and database agree')
    await assert.rejects(sql.query(`UPDATE public.plot_layouts SET status='published' WHERE id=$1`, [layoutId]), /add-on is not active/)
    await sql.query(`UPDATE public.project_addons SET valid_until = now() + interval '30 days' WHERE project_id=$1`, [project])
    assert.equal((await maps.updateLayout(org, layoutId, manager, { publish: true })).success, true, 'renewed: works again')
    const ev = (await sql.query(`SELECT to_status, reason FROM public.project_addon_events WHERE project_id=$1 ORDER BY created_at`, [project])).rows
    assert.ok(ev.some((e) => e.to_status === 'suspended' && e.reason === 'Unpaid invoice'), 'suspension recorded with its reason')
  })

  await test('clients cannot read or write the add-on, history or layout tables, nor call the state function', async () => {
    for (const role of ['anon', 'authenticated']) {
      await sql.query('BEGIN')
      try {
        await sql.query(`SET LOCAL ROLE ${role}`)
        for (const q of ['SELECT * FROM public.org_addons', 'SELECT * FROM public.plot_layouts', 'SELECT * FROM public.plot_layout_links',
          'SELECT * FROM public.project_addons', 'SELECT * FROM public.project_addon_events', `SELECT public.project_addon_state('${otherProject}','plot_maps')`,
          `INSERT INTO public.org_addons (org_id, addon, enabled) VALUES ('${other}','plot_maps',true)`,
          `INSERT INTO public.project_addons (org_id, project_id, addon, status) VALUES ('${other}','${otherProject}','plot_maps','active')`]) {
          await sql.query('SAVEPOINT s'); await assert.rejects(sql.query(q), /permission denied/, `${role}: ${q}`); await sql.query('ROLLBACK TO SAVEPOINT s')
        }
      } finally { await sql.query('ROLLBACK') }
    }
  })

  await test('deleting a layout removes its links; the inventory is untouched', async () => {
    assert.ok(await maps.deleteLayout(org, layoutId))
    assert.equal(Number((await one('SELECT count(*) n FROM public.plot_layout_links WHERE layout_id=$1', [layoutId])).n), 0)
    assert.equal(Number((await one('SELECT count(*) n FROM public.inventory_items WHERE project_id=$1', [project])).n), 4)
  })

  for (const id of [org, other]) { await sql.query('DELETE FROM public.org_addons WHERE org_id=$1', [id]); await sql.query('DELETE FROM public.project_addons WHERE org_id=$1', [id]) }
  await sql.end()
  console.log(`\nP31 plot maps: ${passed} checks passed.`)
}
main().catch((e) => { console.error(e); process.exit(1) })
