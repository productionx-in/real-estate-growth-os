// tests/db-integration/p46-lead-segments.test.mjs — lead segments (20260087, lib/dal/segments.ts) on the local Supabase
// stack: dynamic segments match their filters live; fixed lists hold hand-picked leads; templates create the described
// filters; only owners, admins and managers manage segments (app and database); a reader always sees only their own
// lead scope inside a segment; another organisation's leads can never join a list; signed-in clients can read their
// organisation's segment names but never list members; archiving a lead drops it from lists.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('FATAL: Supabase env required.'); process.exit(1) }
const RUN = crypto.randomBytes(4).toString('hex')
const PASSWORD = 'Segment-Test-' + crypto.randomBytes(8).toString('hex')
let passed = 0
async function test(name, fn) { try { await fn(); passed++; console.log(`  ✓ ${name}`) } catch (e) { console.error(`  ✗ ${name}`); throw e } }

async function main() {
  if (!globalThis.WebSocket) globalThis.WebSocket = class UnusedRealtimeTransport {}
  const jiti = createJiti(import.meta.url, { alias: { '@': root } })
  const S = await jiti.import(path.join(root, 'lib/dal/segments.ts'))
  const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const pg = await import('pg')
  const db = new (pg.default || pg).Client({ connectionString: DATABASE_URL }); await db.connect()
  const one = async (s, p) => (await db.query(s, p)).rows[0]
  const authIds = [], orgIds = []
  const mkOrg = async (name) => { const id = (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,'developer') RETURNING id`, [`${name} ${RUN}`, `${name.toLowerCase()}-${RUN}`])).id; orgIds.push(id); return id }
  const mkUser = async (name, org, role) => {
    const email = `${name.toLowerCase()}-${RUN}@repx.test`
    const { data, error } = await service.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } })
    if (error) throw error
    authIds.push(data.user.id)
    const id = (await one('SELECT id FROM public.profiles WHERE auth_user_id=$1', [data.user.id])).id
    await db.query(`INSERT INTO public.org_members (org_id, profile_id, role) VALUES ($1,$2,$3)`, [org, id, role])
    return { profileId: id, role, email }
  }
  const lead = async (org, name, o = {}) => (await one(
    `INSERT INTO public.leads (org_id, name, phone, source, status, priority, assigned_to) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [org, name, `9${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`, o.source ?? 'website', o.status ?? 'new', o.priority ?? 'medium', o.assigned ?? null])).id
  const ok = (r) => { assert.equal(r.success, true, r.error); return r.data }
  const refused = (r, status, re) => { assert.equal(r.success, false, 'expected a refusal'); if (status) assert.equal(r.status, status, r.error); if (re) assert.match(r.error, re) }

  console.log('P46 — LEAD SEGMENTS')
  const org = await mkOrg('Seaview'), other = await mkOrg('Rival')
  try {
    const owner = await mkUser('SvOwner', org, 'owner'), manager = await mkUser('SvMgr', org, 'manager')
    const exec = await mkUser('SvExec', org, 'sales_exec'), ro = await mkUser('SvRo', org, 'readonly')
    const rivalOwner = await mkUser('RvOwner', other, 'owner')
    const hot1 = await lead(org, 'Asha Hot', { priority: 'high', status: 'qualified', assigned: exec.profileId })
    const hot2 = await lead(org, 'Bala Hot', { priority: 'high', status: 'new' })
    const lost = await lead(org, 'Chitra Lost', { status: 'lost', source: '99acres' })
    const booked = await lead(org, 'Dev Booked', { status: 'booked', priority: 'high' })
    const rivalLead = await lead(other, 'Rival Buyer', { priority: 'high' })

    let hot, list
    await test('only owners, admins and managers create segments (app and database)', async () => {
      refused(await S.createSegment(org, exec, { kind: 'dynamic', template: 'hot_open' }), 403)
      refused(await S.createSegment(org, ro, { kind: 'dynamic', template: 'hot_open' }), 403)
      await assert.rejects(db.query(`INSERT INTO public.lead_segments (org_id, name, kind, filters, created_by) VALUES ($1,'x','dynamic','{"status":["new"]}',$2)`, [org, exec.profileId]), /only owners, admins and managers/)
      hot = ok(await S.createSegment(org, manager, { kind: 'dynamic', template: 'hot_open' }))
      assert.equal(hot.name, 'Hot and open')
      assert.deepEqual(hot.filters.priority, ['high'])
      refused(await S.createSegment(org, owner, { kind: 'dynamic', template: 'hot_open' }), 409, /already a segment with that name/)
      refused(await S.createSegment(org, owner, { kind: 'dynamic', template: 'nope' }), 400, /unknown template/i)
      refused(await S.createSegment(org, owner, { kind: 'dynamic', name: 'Everyone', filters: { assignee: 'me' } }), 400, /at least one filter/i)
    })

    await test('a dynamic segment matches its filters live; new matching leads join on their own', async () => {
      const ids = async (viewer) => (await S.segmentLeads(org, hot, viewer)).leads.map((l) => l.id).sort()
      assert.deepEqual(await ids(owner), [hot1, hot2].sort(), 'high priority and still open (booked is closed)')
      const hot3 = await lead(org, 'Esha Hot', { priority: 'high', status: 'contacted' })
      assert.equal((await S.segmentLeads(org, hot, owner)).total, 3)
      const counts = Object.fromEntries((await S.listSegments(org, owner)).map((s) => [s.name, s.count]))
      assert.equal(counts['Hot and open'], 3)
      await db.query('DELETE FROM public.leads_all WHERE id=$1', [hot3])
    })

    await test('inside any segment a sales executive sees only their own leads', async () => {
      // Lead routing may also hand new leads to the executive; compare with who the leads actually belong to.
      const theirs = (await db.query(`SELECT id FROM public.leads WHERE org_id=$1 AND assigned_to=$2 AND priority='high' AND status <> ALL('{booked,lost,junk}')`, [org, exec.profileId])).rows.map((r) => r.id).sort()
      assert.ok(theirs.includes(hot1))
      const seen = (await S.segmentLeads(org, hot, exec)).leads.map((l) => l.id).sort()
      assert.deepEqual(seen, theirs)
      assert.equal((await S.listSegments(org, exec)).find((s) => s.id === hot.id).count, theirs.length)
      await db.query('UPDATE public.leads_all SET assigned_to = $2 WHERE id = $1', [hot2, owner.profileId])
      assert.ok(!(await S.segmentLeads(org, hot, exec)).leads.some((l) => l.id === hot2), 'someone else’s lead never shows')
    })

    await test('fixed lists: hand-picked leads of the same organisation only; duplicates ignored; removable', async () => {
      list = ok(await S.createSegment(org, owner, { kind: 'fixed', name: 'Diwali offer' }))
      assert.equal(list.added, 0)
      assert.deepEqual(ok(await S.addToList(org, owner, list.id, [lost, booked])), { added: 2 })
      assert.deepEqual(ok(await S.addToList(org, owner, list.id, [lost])), { added: 0 }, 'already in the list')
      refused(await S.addToList(org, owner, list.id, [rivalLead]), 404, /lead not found/i)
      refused(await S.addToList(org, exec, list.id, [hot1]), 403)
      refused(await S.addToList(org, owner, hot.id, [lost]), 400, /only fixed lists/i)
      refused(await S.addToList(other, rivalOwner, list.id, [rivalLead]), 404, /segment not found/i)
      await assert.rejects(db.query(`INSERT INTO public.lead_segment_members (segment_id, org_id, lead_id) VALUES ($1,$2,$3)`, [list.id, org, rivalLead]), /another organisation/)
      await assert.rejects(db.query(`INSERT INTO public.lead_segment_members (segment_id, org_id, lead_id) VALUES ($1,$2,$3)`, [hot.id, org, lost]), /only be added to a fixed list/)
      assert.deepEqual((await S.segmentLeads(org, list, owner)).leads.map((l) => l.id).sort(), [lost, booked].sort())
      await db.query('UPDATE public.leads_all SET assigned_to = $2 WHERE id = ANY($1)', [[lost, booked], owner.profileId])
      assert.equal((await S.segmentLeads(org, list, exec)).total, 0, 'neither lead is assigned to the executive')
      assert.deepEqual((await S.listsForLead(org, lost)).map((l) => [l.name, l.member]), [['Diwali offer', true]])
      assert.deepEqual(ok(await S.removeFromList(org, owner, list.id, [booked])), { removed: 1 })
    })

    await test('a fixed list can start as a snapshot of matching leads, and does not grow afterwards', async () => {
      const snap = ok(await S.createSegment(org, owner, { kind: 'fixed', name: 'High priority snapshot', snapshotFilters: { priority: ['high'] } }))
      assert.equal(snap.added, 3, 'hot1, hot2 and the booked lead; never the rival organisation’s')
      await lead(org, 'Farah Later', { priority: 'high' })
      assert.equal((await S.segmentLeads(org, snap, owner)).total, 3)
    })

    await test('archiving a lead hides it from lists; another organisation cannot read or change our segments', async () => {
      await db.query('UPDATE public.leads_all SET deleted_at = now() WHERE id=$1', [lost])
      assert.equal((await S.segmentLeads(org, list, owner)).total, 0)
      assert.equal(await S.getSegment(other, list.id), null)
      refused(await S.updateSegment(other, rivalOwner, list.id, { name: 'Mine now' }), 404)
      refused(await S.deleteSegment(other, rivalOwner, hot.id), 404)
      assert.equal((await S.listSegments(other, rivalOwner)).length, 0)
      refused(await S.updateSegment(org, owner, list.id, { filters: { status: ['new'] } }), 400, /fixed list has no filters/i)
      const renamed = ok(await S.updateSegment(org, owner, hot.id, { name: 'Hot leads', filters: { priority: ['high'], status: ['new'] } }))
      assert.equal(renamed.template, null, 'an edited template is no longer the template')
      await assert.rejects(db.query(`UPDATE public.lead_segments SET kind='fixed', filters='{}' WHERE id=$1`, [hot.id]), /cannot change/)
    })

    await test('signed-in clients: their organisation’s segment names only; members and writes refused', async () => {
      if (!ANON_KEY) { console.log('    (skipped: no anon key in the environment)'); return }
      const client = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
      const { error: signInError } = await client.auth.signInWithPassword({ email: exec.email, password: PASSWORD })
      assert.ifError(signInError)
      const { data: names } = await client.from('lead_segments').select('org_id, name')
      assert.ok(names.length >= 1 && names.every((n) => n.org_id === org), 'own organisation only')
      const { data: members, error: memErr } = await client.from('lead_segment_members').select('lead_id')
      assert.ok(memErr || (members ?? []).length === 0, 'no member rows through the API')
      const { error: insErr } = await client.from('lead_segments').insert({ org_id: org, name: 'Sneaky', kind: 'dynamic', filters: { status: ['new'] } })
      assert.ok(insErr, 'clients cannot create segments')
      const rival = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
      await rival.auth.signInWithPassword({ email: rivalOwner.email, password: PASSWORD })
      const { data: rivalSees } = await rival.from('lead_segments').select('id')
      assert.equal((rivalSees ?? []).length, 0, 'another organisation sees none of ours')
    })

    await test('deleting a segment never deletes its leads', async () => {
      ok(await S.deleteSegment(org, owner, list.id))
      assert.ok(await one('SELECT id FROM public.leads_all WHERE id=$1', [booked]))
      assert.equal(Number((await one('SELECT count(*) n FROM public.lead_segment_members WHERE segment_id=$1', [list.id])).n), 0)
    })
  } finally {
    for (const id of orgIds) {
      await db.query('DELETE FROM public.lead_segments WHERE org_id=$1', [id]).catch((e) => console.error('cleanup', e.message))
      await db.query('DELETE FROM public.leads_all WHERE org_id=$1', [id]).catch((e) => console.error('cleanup', e.message))
      await db.query('DELETE FROM public.org_members WHERE org_id=$1', [id]).catch(() => {})
      await db.query('DELETE FROM public.organisations WHERE id=$1', [id]).catch((e) => console.error('cleanup', e.message))
    }
    for (const id of authIds) await service.auth.admin.deleteUser(id).catch(() => {})
    await db.end()
  }
  console.log(`\nLead segments: ${passed} checks passed.`)
}

main().catch((e) => { console.error(e); process.exit(1) })
