// tests/db-integration/p10-saved-views.test.mjs — saved views (migration 20260050 + lib/dal/saved-views.ts) and the
// lead filters (lib/leads/view-filters.ts) against the local Supabase stack: who sees and changes which view,
// cross-tenant refusal, the RLS read policy as a signed-in member, and filters on real leads.
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

async function main() {
  if (!globalThis.WebSocket) globalThis.WebSocket = class UnusedRealtimeTransport {}
  const jiti = createJiti(import.meta.url, { alias: { '@': root } })
  const views = await jiti.import(path.join(root, 'lib/dal/saved-views.ts'))
  const vf = await jiti.import(path.join(root, 'lib/leads/view-filters.ts'))
  const { createServiceClient } = await jiti.import(path.join(root, 'lib/supabase/server.ts'))
  const pg = await import('pg')
  const db = new (pg.default || pg).Client({ connectionString: DATABASE_URL })
  await db.connect()
  const one = async (s, p) => (await db.query(s, p)).rows[0]
  const mkUser = async (n) => {
    const id = crypto.randomUUID()
    await db.query(`INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
      VALUES ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),now(),now(),'{}',$3)`, [id, `${n}-${RUN}@regrow.test`, JSON.stringify({ full_name: n })])
    return { authId: id, profileId: (await one('SELECT id FROM public.profiles WHERE auth_user_id=$1', [id])).id }
  }
  /** Reads saved_views through RLS as a signed-in member. */
  const readAs = async (authId, orgId) => {
    await db.query('BEGIN')
    try {
      await db.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: authId, role: 'authenticated' })])
      await db.query('SET LOCAL ROLE authenticated')
      const rows = (await db.query('SELECT name FROM public.saved_views WHERE org_id=$1 ORDER BY name', [orgId])).rows.map((r) => r.name)
      let insertError = null
      await db.query('SAVEPOINT s')
      try { await db.query(`INSERT INTO public.saved_views (org_id, owner_id, name) VALUES ($1, auth_profile_id(), 'sneaky')`, [orgId]) }
      catch (e) { insertError = e.message; await db.query('ROLLBACK TO SAVEPOINT s') }
      return { rows, insertError }
    } finally { await db.query('ROLLBACK') }
  }

  console.log('P10 — SAVED VIEWS & LEAD FILTERS')
  const org = (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,'developer') RETURNING id`, [`Views ${RUN}`, `views-${RUN}`])).id
  const other = (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,'developer') RETURNING id`, [`Views2 ${RUN}`, `views2-${RUN}`])).id
  try {
    const meera = await mkUser('Meera Manager')
    const ravi = await mkUser('Ravi Manager')
    const asha = await mkUser('Asha Exec')
    const kiran = await mkUser('Kiran Exec')
    const outsider = await mkUser('Olu Outsider')
    for (const [u, role] of [[meera, 'manager'], [ravi, 'manager'], [asha, 'sales_exec'], [kiran, 'sales_exec']]) {
      await db.query(`INSERT INTO public.org_members (org_id, profile_id, role) VALUES ($1,$2,$3)`, [org, u.profileId, role])
    }
    await db.query(`INSERT INTO public.org_members (org_id, profile_id, role) VALUES ($1,$2,'manager')`, [other, outsider.profileId])
    const as = (u, role) => ({ profileId: u.profileId, role })
    const M = as(meera, 'manager'), R = as(ravi, 'manager'), A = as(asha, 'sales_exec'), K = as(kiran, 'sales_exec'), O = as(outsider, 'manager')

    let ashaView, teamView
    await test('a sales executive saves a personal view; filters are cleaned before they are stored', async () => {
      const r = await views.createView(org, A, { name: '  My hot leads ', layout: 'board', filters: { priority: ['high'], evil: '1', status: 'new,nope' }, shared: false })
      assert.equal(r.success, true, r.error)
      ashaView = r.data
      assert.equal(ashaView.name, 'My hot leads')
      const stored = await one('SELECT filters, layout FROM public.saved_views WHERE id=$1', [ashaView.id])
      assert.deepEqual([stored.filters, stored.layout], [{ status: ['new'], priority: ['high'] }, 'board'])
    })
    await test('a sales executive cannot share a view — refused by the API rule and by the database', async () => {
      const r = await views.createView(org, A, { name: 'Team?', layout: 'list', filters: {}, shared: true })
      assert.deepEqual([r.success, r.status], [false, 403])
      await assert.rejects(db.query(`INSERT INTO public.saved_views (org_id, owner_id, name, shared) VALUES ($1,$2,'direct',true)`, [org, asha.profileId]), /only managers can share/)
      const u = await views.updateView(org, ashaView.id, A, { shared: true })
      assert.deepEqual([u.success, u.status], [false, 403])
    })
    await test('a manager shares a view: everyone in the workspace sees it; personal views stay private', async () => {
      const r = await views.createView(org, M, { name: 'Overdue — team', layout: 'list', filters: { focus: 'overdue' }, shared: true })
      assert.equal(r.success, true, r.error)
      teamView = r.data
      const forKiran = await views.listViews(org, K)
      assert.deepEqual(forKiran.map((v) => [v.name, v.mine, v.editable]), [['Overdue — team', false, false]])
      const forMeera = await views.listViews(org, M)
      assert.deepEqual(forMeera.map((v) => v.name), ['Overdue — team'], 'a manager does not see a sales executive\'s personal view')
      assert.equal(await views.getView(org, ashaView.id, M), null)
      const forAsha = await views.listViews(org, A)
      assert.deepEqual(forAsha.map((v) => v.name), ['My hot leads', 'Overdue — team'], 'own views first')
    })
    await test('only its maker or a manager can change a shared view; a private view of someone else is "not found"', async () => {
      const byExec = await views.updateView(org, teamView.id, K, { name: 'Mine now' })
      assert.deepEqual([byExec.success, byExec.status], [false, 403])
      const delByExec = await views.deleteView(org, teamView.id, K)
      assert.deepEqual([delByExec.success, delByExec.status], [false, 403])
      const byOtherManager = await views.updateView(org, teamView.id, R, { name: 'Overdue (team)' })
      assert.equal(byOtherManager.success, true, byOtherManager.error)
      const peek = await views.updateView(org, ashaView.id, R, { name: 'peek' })
      assert.deepEqual([peek.success, peek.status], [false, 404])
      const peekDel = await views.deleteView(org, ashaView.id, M)
      assert.deepEqual([peekDel.success, peekDel.status], [false, 404])
    })
    await test('another organisation cannot see, change or delete these views', async () => {
      assert.deepEqual(await views.listViews(other, O), [])
      assert.equal(await views.getView(other, teamView.id, O), null)
      for (const r of [await views.updateView(other, teamView.id, O, { name: 'x' }), await views.deleteView(other, teamView.id, O)]) {
        assert.deepEqual([r.success, r.status], [false, 404])
      }
      await assert.rejects(db.query(`INSERT INTO public.saved_views (org_id, owner_id, name) VALUES ($1,$2,'cross')`, [org, outsider.profileId]),
        /not an active member/)
      await assert.rejects(db.query(`UPDATE public.saved_views SET org_id=$1 WHERE id=$2`, [other, teamView.id]), /cannot change/)
    })
    await test('RLS: a signed-in member reads only their own and shared views, and cannot write directly', async () => {
      const k = await readAs(kiran.authId, org)
      assert.deepEqual(k.rows, ['Overdue (team)'])
      assert.match(k.insertError ?? '', /permission denied/)
      const a = await readAs(asha.authId, org)
      assert.deepEqual(a.rows, ['My hot leads', 'Overdue (team)'])
      const o = await readAs(outsider.authId, org)
      assert.deepEqual(o.rows, [], 'a member of another organisation reads nothing')
      await db.query(`UPDATE public.org_members SET status='suspended' WHERE org_id=$1 AND profile_id=$2`, [org, kiran.profileId])
      assert.deepEqual((await readAs(kiran.authId, org)).rows, [], 'a suspended member reads nothing')
      await db.query(`UPDATE public.org_members SET status='active' WHERE org_id=$1 AND profile_id=$2`, [org, kiran.profileId])
    })
    await test('names are unique per person (ignoring case and spaces); there is a limit per person', async () => {
      const dup = await views.createView(org, A, { name: 'my HOT leads', layout: 'list', filters: {}, shared: false })
      assert.deepEqual([dup.success, dup.status], [false, 409])
      const sameNameOtherPerson = await views.createView(org, K, { name: 'My hot leads', layout: 'list', filters: {}, shared: false })
      assert.equal(sameNameOtherPerson.success, true)
      for (let i = 0; i < vf.MAX_VIEWS_PER_PERSON - 1; i++) {
        await db.query(`INSERT INTO public.saved_views (org_id, owner_id, name) VALUES ($1,$2,$3)`, [org, kiran.profileId, `v${i}`])
      }
      const over = await views.createView(org, K, { name: 'one too many', layout: 'list', filters: {}, shared: false })
      assert.deepEqual([over.success, over.status], [false, 400])
    })
    await test('a shared view keeps working after its maker changes role', async () => {
      await db.query(`UPDATE public.org_members SET role='sales_exec' WHERE org_id=$1 AND profile_id=$2`, [org, meera.profileId])
      const r = await views.updateView(org, teamView.id, R, { filters: { focus: 'waiting' } })
      assert.equal(r.success, true, r.error)
      await db.query(`UPDATE public.org_members SET role='manager' WHERE org_id=$1 AND profile_id=$2`, [org, meera.profileId])
    })
    await test('deleting a view removes only the view', async () => {
      const before = (await one('SELECT count(*)::int n FROM public.leads WHERE org_id=$1', [org])).n
      const r = await views.deleteView(org, ashaView.id, A)
      assert.equal(r.success, true)
      assert.equal(await one('SELECT id FROM public.saved_views WHERE id=$1', [ashaView.id]), undefined)
      assert.equal((await one('SELECT count(*)::int n FROM public.leads WHERE org_id=$1', [org])).n, before)
    })

    // ── Filters on real leads ───────────────────────────────────────────────────────────────────────
    const svc = createServiceClient()
    const mkLead = async (name, phone, assigned, extra = {}) => {
      const id = (await one(`INSERT INTO public.leads (org_id, name, phone, email, source, status, priority, assigned_to)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`, [org, name, phone, extra.email ?? null, extra.source ?? 'website', extra.status ?? 'new', extra.priority ?? 'medium', assigned])).id
      if (assigned === null) await db.query('UPDATE public.leads SET assigned_to=NULL WHERE id=$1', [id]) // undo auto-assignment
      return id
    }
    const p = () => `9${crypto.randomInt(100000000, 999999999)}`
    const l1 = await mkLead('Priya Sharma', p(), asha.profileId, { email: `priya-${RUN}@buyer.test`, priority: 'high' })
    const l2 = await mkLead('Rahul Verma', p(), kiran.profileId, { status: 'qualified', source: 'meta_ads' })
    const l3 = await mkLead('प्रिया नायर', p(), null, { source: 'referral' })
    const ids = async (filters, viewer) => {
      const q = vf.applyLeadFilters(svc.from('leads').select('id').eq('org_id', org), filters, viewer, new Date())
      const { data, error } = await q
      assert.equal(error, null, error?.message)
      return new Set(data.map((d) => d.id))
    }
    await test('filters on real leads: status, source, priority, unassigned, search by name / email / Hindi name', async () => {
      assert.deepEqual(await ids({ status: ['qualified'] }, M), new Set([l2]))
      assert.deepEqual(await ids({ source: ['meta_ads', 'referral'] }, M), new Set([l2, l3]))
      assert.deepEqual(await ids({ priority: ['high'] }, M), new Set([l1]))
      assert.deepEqual(await ids({ assignee: 'none' }, M), new Set([l3]))
      assert.deepEqual(await ids({ q: 'priya' }, M), new Set([l1]))
      assert.deepEqual(await ids({ q: `priya-${RUN}@buyer` }, M), new Set([l1]))
      assert.deepEqual(await ids({ q: 'प्रिया' }, M), new Set([l3]))
    })
    await test('a sales executive opening a "whole team" or "someone else\'s" filter still gets only their own leads', async () => {
      assert.deepEqual(await ids({}, A), new Set([l1]))
      assert.deepEqual(await ids({ assignee: kiran.profileId }, A), new Set([l1]))
      assert.deepEqual(await ids({ assignee: 'none' }, A), new Set([l1]))
    })
    await test('hostile search text is neutralised: no error, no widening', async () => {
      const everything = await ids({}, M)
      for (const q of ['x",id.neq."', 'a,b),or(id.not.is.null', '%', '*', '%%', "') OR 1=1 --"]) {
        const got = await ids({ q }, M)
        assert.ok(![...got].some((id) => ![l1, l2, l3].includes(id)), `"${q}" stays inside the organisation`)
        if (vf.cleanSearch(q) === undefined) {
          assert.deepEqual(got, everything, `"${q}" has nothing searchable, so it is ignored (same as no search)`)
        } else {
          assert.ok(got.size <= 1, `"${q}" is searched literally, not as filter syntax`)
        }
      }
    })

    console.log(`\nP10 saved views: ${passed} checks passed.`)
  } finally {
    for (const id of [org, other]) await db.query('DELETE FROM public.organisations WHERE id=$1', [id]).catch(() => {})
    await db.end()
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
