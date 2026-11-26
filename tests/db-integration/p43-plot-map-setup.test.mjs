// tests/db-integration/p43-plot-map-setup.test.mjs — Interactive Plot Map set-up tracking (20260084,
// lib/dal/plot-map-setup.ts) on the local Supabase stack: stages come from recorded steps, a customer blocker pauses the
// clock and reaches the workspace (in the app and by e-mail), blockers are never edited and stay in their organisation,
// staff assignment is checked, embedding origins are served only for a live shared map, and clients cannot read any
// of it.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'
import { createClient } from '@supabase/supabase-js'

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
  const D = await jiti.import(path.join(root, 'lib/dal/plot-map-setup.ts'))
  const P = await jiti.import(path.join(root, 'lib/dal/plot-map-publishing.ts'))
  const S = await jiti.import(path.join(root, 'lib/dal/plot-map-shapes.ts'))
  const L = await jiti.import(path.join(root, 'lib/dal/plot-layouts.ts'))
  const J = await jiti.import(path.join(root, 'lib/jobs/customer-emails.ts'))
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  const pg = await import('pg')
  const sql = new (pg.default || pg).Client({ connectionString: DATABASE_URL }); await sql.connect()
  const one = async (s, p) => (await sql.query(s, p)).rows[0]
  const count = async (s, p) => Number((await one(s, p)).n)
  const mkUser = async (label) => {
    const { data, error } = await db.auth.admin.createUser({ email: `${label}-${RUN}@repx.test`, password: `Pw-${RUN}-x9!Long`, email_confirm: true, user_metadata: { full_name: label } })
    if (error) throw error
    return { id: data.user.id, profile: (await one('SELECT id FROM public.profiles WHERE auth_user_id=$1', [data.user.id])).id }
  }

  console.log('P43 — PLOT MAP SET-UP')
  const org = (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,'developer') RETURNING id`, [`Setup ${RUN}`, `setup-${RUN}`])).id
  const other = (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,'developer') RETURNING id`, [`Other ${RUN}`, `other-${RUN}`])).id
  const project = (await one(`INSERT INTO public.projects (org_id, name, slug, category) VALUES ($1,'Sunrise Plots',$2,'plotted_developments') RETURNING id`, [org, `sp-${RUN}`])).id
  const owner = await mkUser('setup-owner')
  await sql.query(`INSERT INTO public.org_members (org_id, profile_id, role, status) VALUES ($1,$2,'owner','active')`, [org, owner.profile])
  const staffer = await mkUser('setup-staff')
  await sql.query('INSERT INTO public.platform_users (user_id, role) VALUES ($1,$2)', [staffer.id, 'support_agent'])
  const u1 = (await one(`INSERT INTO public.inventory_items (org_id, project_id, unit_number, category, area_value, area_unit, plot_area, total_price, status)
    VALUES ($1,$2,'S1','plotted_developments',2400,'sqft',2400,5000000,'available') RETURNING id`, [org, project])).id

  await test('before activation nothing is done; activation is the first recorded step', async () => {
    assert.equal((await D.getSetupView(org, project)).completed, 0)
    await sql.query(`INSERT INTO public.project_addons (org_id, project_id, addon, status, activated_at) VALUES ($1,$2,'plot_maps','active',now())`, [org, project])
    const v = await D.getSetupView(org, project)
    assert.equal(v.completed, 1); assert.equal(v.current.key, 'uploaded'); assert.equal(v.current.owner, 'customer'); assert.equal(v.currentDue, null)
  })

  const layout = (await one(`INSERT INTO public.plot_layouts (org_id, project_id, name) VALUES ($1,$2,'Phase 1') RETURNING id`, [org, project])).id
  const doc = crypto.randomUUID(), version = crypto.randomUUID()
  await test('upload and a checked render complete the next stages; mapping is then with RE and has a due time', async () => {
    await sql.query(`INSERT INTO public.plot_map_documents (id, org_id, project_id, layout_id, kind, file_name, byte_size, storage_path, status, sha256, page_count, pages)
      VALUES ($1,$2,$3,$4,'pdf','a.pdf',100,$5,'ready',$6,1,'[{"page":1,"width":842,"height":595,"rotate":0}]')`,
      [doc, org, project, layout, `org/${org}/project/${project}/documents/${doc}/original.pdf`, 'b'.repeat(64)])
    await sql.query(`INSERT INTO public.plot_map_versions (id, org_id, project_id, layout_id, document_id, version_no, page, render_status, image_width, image_height, image_path, thumb_path, rendered_at)
      VALUES ($1,$2,$3,$4,$5,1,1,'ready',1000,700,$6,$7,now())`,
      [version, org, project, layout, doc, `org/${org}/project/${project}/versions/${version}/page.png`, `org/${org}/project/${project}/versions/${version}/thumb.png`])
    const v = await D.getSetupView(org, project)
    assert.equal(v.completed, 3); assert.equal(v.current.key, 'mapped'); assert.ok(v.currentDue); assert.ok(v.estimate)
  })

  let blocker
  await test('a blocker waiting on the customer pauses the clock, shows the reason and notifies the owner', async () => {
    const bad = await D.raiseBlocker(org, project, staffer.id, { stage: 'mapped', waitingOn: 'customer', reason: 'no' })
    assert.equal(bad.status, 400)
    const r = await D.raiseBlocker(org, project, staffer.id, { stage: 'mapped', waitingOn: 'customer', reason: 'Please upload the approved phase 2 page' })
    assert.equal(r.success, true); blocker = r.data.id
    const v = await D.getSetupView(org, project)
    assert.equal(v.waitingOnCustomer.reason, 'Please upload the approved phase 2 page'); assert.equal(v.currentDue, null); assert.equal(v.overdue, false)
    assert.equal(await count(`SELECT count(*) n FROM public.notifications WHERE recipient_profile_id=$1 AND type='plot_map'`, [owner.profile]), 1)
    const mails = (await J.collectPlotMapEmails(db)).filter((m) => m.orgId === org).map((m) => m.kind).sort()
    assert.deepEqual(mails, ['plot_map_action_needed', 'plot_map_activated'])
  })

  await test('blockers are never edited, stay in their organisation and are resolved once', async () => {
    await assert.rejects(sql.query(`UPDATE public.plot_map_setup_blockers SET reason='edited reason' WHERE id=$1`, [blocker]), /not edited/)
    await assert.rejects(sql.query(`INSERT INTO public.plot_map_setup_blockers (org_id, project_id, stage, waiting_on, reason) VALUES ($1,$2,'mapped','regrow','cross tenant')`, [other, project]), /another organisation/)
    assert.equal((await D.resolveBlocker(other, blocker, staffer.id, null)).status, 404, 'another workspace cannot resolve it')
    assert.equal((await D.resolveBlocker(org, blocker, owner.id, 'Uploaded')).success, true)
    assert.equal((await D.resolveBlocker(org, blocker, owner.id, 'again')).status, 404)
    assert.equal((await D.getSetupView(org, project)).waitingOnCustomer, null)
  })

  await test('assignment only to active RE staff; the queue shows metadata only', async () => {
    assert.equal((await D.assignSetup(org, project, owner.id, staffer.id)).status, 400)
    assert.equal((await D.assignSetup(other, project, staffer.id, staffer.id)).success, false)
    assert.equal((await D.assignSetup(org, project, staffer.id, staffer.id)).success, true)
    const row = (await D.setupQueue()).find((r) => r.projectId === project)
    assert.equal(row.assigneeUserId, staffer.id); assert.equal(row.assignee, 'setup-staff')
    assert.ok(!JSON.stringify(row).includes(u1), 'no inventory ids')
  })

  await test('review steps complete linking, QA, approval and publishing — and the e-mail follows', async () => {
    await S.saveShapes(org, version, owner.profile, [{ label: 'S1', kind: 'rect', points: sq(0, 0), unitId: u1 }])
    for (const a of ['submit', 'qa_pass', 'approve', 'publish']) assert.equal((await P.versionAction(org, version, owner.profile, a, null)).success, true, a)
    const v = await D.getSetupView(org, project)
    assert.equal(v.completed, 8); assert.equal(v.current, null); assert.equal(v.estimate, null)
    assert.ok((await J.collectPlotMapEmails(db)).some((m) => m.orgId === org && m.kind === 'plot_map_published'))
  })

  await test('embedding origins: only for a shared, published map with the add-on active', async () => {
    const bad = await L.updateLayout(org, layout, owner.profile, { embedDomains: ['http://insecure.example.com'] })
    assert.equal(bad.status, 400)
    const ok = await L.updateLayout(org, layout, owner.profile, { embedDomains: ['www.sunrise-example.com', 'https://www.sunrise-example.com'], share: true })
    assert.deepEqual(ok.data.embedDomains, ['https://www.sunrise-example.com'])
    const token = ok.data.shareToken
    const origins = async () => (await one('SELECT public.plot_map_embed_origins($1) o', [token])).o
    assert.deepEqual(await origins(), ['https://www.sunrise-example.com'])
    await sql.query(`UPDATE public.project_addons SET status='suspended', status_reason='test' WHERE project_id=$1`, [project])
    assert.deepEqual(await origins(), [], 'a lapsed add-on serves no origins')
    await sql.query(`UPDATE public.project_addons SET status='active' WHERE project_id=$1`, [project])
    assert.deepEqual((await one(`SELECT public.plot_map_embed_origins('not-a-token') o`)).o, [])
  })

  await test('clients cannot read set-up tables; anon may only ask for embed origins', async () => {
    for (const role of ['anon', 'authenticated']) {
      await sql.query('BEGIN')
      try {
        await sql.query(`SET LOCAL ROLE ${role}`)
        for (const q of ['SELECT * FROM public.plot_map_setup_blockers', 'SELECT * FROM public.plot_map_setup_assignments']) {
          await sql.query('SAVEPOINT s'); await assert.rejects(sql.query(q), /permission denied/, `${role}: ${q}`); await sql.query('ROLLBACK TO SAVEPOINT s')
        }
        await sql.query(`SELECT public.plot_map_embed_origins('x')`)
      } finally { await sql.query('ROLLBACK') }
    }
  })

  await sql.query('DELETE FROM public.project_addons WHERE org_id=$1', [org])
  await sql.query('DELETE FROM public.platform_users WHERE user_id=$1', [staffer.id])
  for (const u of [owner, staffer]) await db.auth.admin.deleteUser(u.id).catch(() => {})
  await sql.end()
  console.log(`\nP43 plot map set-up: ${passed} checks passed.`)
}
main().catch((e) => { console.error(e); process.exit(1) })
