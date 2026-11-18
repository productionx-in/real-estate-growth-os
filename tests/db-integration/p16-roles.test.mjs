// tests/db-integration/p16-roles.test.mjs — Team lead and Post-sales roles (migrations 20260054–20260055,
// lib/auth/permissions.ts, lib/dal/viewer.ts) against the local Supabase stack.
//   • signed-in clients (row-level security, exactly as a browser): who reads and changes which leads
//   • database triggers: who may assign to whom; post-sales never receives leads; routing teams
//   • server code: the team a team lead sees, and search scoped to it
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) { console.error('FATAL: Supabase env required (URL, anon and service keys).'); process.exit(1) }
const RUN = crypto.randomBytes(4).toString('hex')
const PASSWORD = 'Roles-Test-' + crypto.randomBytes(8).toString('hex')
let passed = 0
async function test(name, fn) { try { await fn(); passed++; console.log(`  ✓ ${name}`) } catch (e) { console.error(`  ✗ ${name}`); throw e } }

class UnusedRealtimeTransport { constructor() { throw new Error('Realtime is not used by these tests') } }
const clientOpts = { auth: { persistSession: false, autoRefreshToken: false }, ...(globalThis.WebSocket ? {} : { realtime: { transport: UnusedRealtimeTransport } }) }
const service = createClient(SUPABASE_URL, SERVICE_KEY, clientOpts)

async function main() {
  if (!globalThis.WebSocket) globalThis.WebSocket = class UnusedRealtimeTransport {}
  const jiti = createJiti(import.meta.url, { alias: { '@': root } })
  const viewerDal = await jiti.import(path.join(root, 'lib/dal/viewer.ts'))
  const search = await jiti.import(path.join(root, 'lib/dal/search.ts'))
  const pg = await import('pg')
  const db = new (pg.default || pg).Client({ connectionString: DATABASE_URL })
  await db.connect()
  const one = async (s, p) => (await db.query(s, p)).rows[0]
  const authIds = []

  const mkUser = async (name) => {
    const email = `${name.toLowerCase()}-${RUN}@regrow.test`
    const { data, error } = await service.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } })
    if (error) throw error
    authIds.push(data.user.id)
    const profileId = (await one('SELECT id FROM public.profiles WHERE auth_user_id=$1', [data.user.id])).id
    return { email, profileId }
  }
  const signIn = async (u) => {
    const c = createClient(SUPABASE_URL, ANON_KEY, clientOpts)
    const { error } = await c.auth.signInWithPassword({ email: u.email, password: PASSWORD })
    if (error) throw error
    return c
  }

  console.log('P16 — TEAM LEAD AND POST-SALES ROLES')
  const org = (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,'developer') RETURNING id`, [`Roles ${RUN}`, `roles-${RUN}`])).id
  try {
    const manager = await mkUser('Meera'), lead = await mkUser('Tara'), asha = await mkUser('Asha'), kiran = await mkUser('Kiran')
    const ravi = await mkUser('Ravi'), post = await mkUser('Pooja'), viewer = await mkUser('Vik')
    await db.query(`INSERT INTO public.org_members (org_id, profile_id, role) VALUES
      ($1,$2,'manager'),($1,$3,'team_lead'),($1,$4,'sales_exec'),($1,$5,'sales_exec'),($1,$6,'sales_exec'),($1,$7,'post_sales'),($1,$8,'readonly')`,
      [org, manager.profileId, lead.profileId, asha.profileId, kiran.profileId, ravi.profileId, post.profileId, viewer.profileId])
    // Tara leads "North" (Asha, Kiran). Ravi is in "South"; an inactive team that includes Ravi must not count.
    const north = (await one(`INSERT INTO public.teams (org_id, name) VALUES ($1,'North') RETURNING id`, [org])).id
    const south = (await one(`INSERT INTO public.teams (org_id, name) VALUES ($1,'South') RETURNING id`, [org])).id
    const old = (await one(`INSERT INTO public.teams (org_id, name, is_active) VALUES ($1,'Old',false) RETURNING id`, [org])).id
    await db.query(`INSERT INTO public.team_members (org_id, team_id, profile_id) VALUES ($1,$2,$3),($1,$2,$4),($1,$2,$5),($1,$6,$7),($1,$8,$3),($1,$8,$7)`,
      [org, north, lead.profileId, asha.profileId, kiran.profileId, south, ravi.profileId, old])

    const mkLead = async (name, owner, status = 'new') => {
      const id = (await one(`INSERT INTO public.leads (org_id, name, phone, source, status) VALUES ($1,$2,$3,'website',$4) RETURNING id`,
        [org, name, `98${crypto.randomInt(10000000, 99999999)}`, status])).id
      await db.query('UPDATE public.leads SET assigned_to=$1 WHERE id=$2', [owner, id])
      return id
    }
    const tLead = await mkLead('Priya (Tara)', lead.profileId)
    const aLead = await mkLead('Prakash (Asha)', asha.profileId)
    const kLead = await mkLead('Prem (Kiran)', kiran.profileId)
    const rLead = await mkLead('Pradeep (Ravi)', ravi.profileId)
    const booked = await mkLead('Pallavi (booked)', ravi.profileId, 'booked')
    const ids = (rows) => (rows ?? []).map((r) => r.id).sort()

    await test('team: a team lead’s team is their active teams only (an inactive team does not count)', async () => {
      const team = await viewerDal.teamProfileIdsOf(org, lead.profileId)
      assert.deepEqual(team.sort(), [lead.profileId, asha.profileId, kiran.profileId].sort())
      assert.deepEqual(await viewerDal.teamProfileIdsOf(org, manager.profileId), [manager.profileId], 'not in a team → only themselves')
    })

    await test('reading (signed in): team lead sees their team’s leads; post-sales booked customers; others unchanged', async () => {
      const read = async (u) => ids((await (await signIn(u)).from('leads').select('id').eq('org_id', org)).data)
      assert.deepEqual(await read(lead), [tLead, aLead, kLead].sort(), 'team lead: own + teammates, not South, not booked-by-Ravi')
      assert.deepEqual(await read(post), [booked], 'post-sales: booked customers only')
      assert.deepEqual(await read(asha), [aLead], 'sales executive: still only their own')
      assert.equal((await read(manager)).length, 5, 'manager: everything')
      assert.equal((await read(viewer)).length, 0, 'viewer: no direct database reads (pages read through the server), unchanged')
    })

    await test('activities follow the same rule for the new roles', async () => {
      await db.query(`INSERT INTO public.lead_activities (lead_id, actor_id, type, note) VALUES ($1,$3,'note_added','a'),($2,$4,'note_added','r')`,
        [aLead, rLead, asha.profileId, ravi.profileId])
      const rows = (await (await signIn(lead)).from('lead_activities').select('lead_id').in('lead_id', [aLead, rLead])).data
      assert.deepEqual([...new Set(rows.map((r) => r.lead_id))], [aLead])
    })

    await test('changing leads (signed in): a team lead only their team’s; post-sales only booked; a note is theirs only where they work', async () => {
      const tl = await signIn(lead)
      const ok = await tl.from('leads').update({ priority: 'high' }).eq('id', kLead).select('id')
      assert.equal(ok.data?.length, 1, 'teammate’s lead: allowed')
      const no = await tl.from('leads').update({ priority: 'high' }).eq('id', rLead).select('id')
      assert.equal(no.data?.length ?? 0, 0, 'another team’s lead: refused')
      const ps = await signIn(post)
      assert.equal((await ps.from('leads').update({ priority: 'high' }).eq('id', booked).select('id')).data?.length, 1)
      assert.equal((await ps.from('leads').update({ priority: 'high' }).eq('id', aLead).select('id')).data?.length ?? 0, 0)
      const note = await tl.from('lead_activities').insert({ lead_id: rLead, actor_id: lead.profileId, type: 'note_added', note: 'x' })
      assert.ok(note.error, 'cannot add a note to another team’s lead')
      assert.ok(!(await tl.from('lead_activities').insert({ lead_id: aLead, actor_id: lead.profileId, type: 'note_added', note: 'ok' })).error)
    })

    await test('assignment (signed in): a team lead reassigns within the team only', async () => {
      const tl = await signIn(lead)
      const within = await tl.from('leads').update({ assigned_to: kiran.profileId }).eq('id', aLead).select('id')
      assert.ok(!within.error && within.data?.length === 1, `within the team: ${within.error?.message}`)
      const out = await tl.from('leads').update({ assigned_to: ravi.profileId }).eq('id', kLead).select('id')
      assert.ok(out.error, 'to someone outside the team: refused')
      const hist = await tl.from('lead_assignments').insert({ lead_id: aLead, assigned_to: kiran.profileId, assigned_by: lead.profileId })
      assert.ok(!hist.error, `assignment history within the team: ${hist.error?.message}`)
      const histOut = await tl.from('lead_assignments').insert({ lead_id: aLead, assigned_to: ravi.profileId, assigned_by: lead.profileId })
      assert.ok(histOut.error, 'assignment history to an outsider: refused')
    })

    await test('post-sales and viewers are never given leads, by anyone; post-sales cannot join a routing team', async () => {
      await assert.rejects(db.query('UPDATE public.leads SET assigned_to=$1 WHERE id=$2', [post.profileId, rLead]), /cannot be assigned/)
      await assert.rejects(db.query('UPDATE public.leads SET assigned_to=$1 WHERE id=$2', [viewer.profileId, rLead]), /cannot be assigned/)
      await assert.rejects(db.query(`INSERT INTO public.team_members (org_id, team_id, profile_id) VALUES ($1,$2,$3)`, [org, north, post.profileId]), /routing_integrity/)
      const ps = await signIn(post)
      const r = await ps.from('leads').update({ assigned_to: post.profileId }).eq('id', booked).select('id')
      assert.ok(r.error, 'post-sales cannot take a lead themselves either')
    })

    await test('search (server): a team lead finds their team’s leads, not another team’s', async () => {
      const v = await viewerDal.resolveLeadViewer(org, 'team_lead', lead.profileId)
      const found = (await search.searchWorkspace(org, v, 'pr')).leads.map((l) => l.id).sort()
      assert.deepEqual(found, [aLead, kLead, tLead].sort())
      const pv = await viewerDal.resolveLeadViewer(org, 'post_sales', post.profileId)
      assert.deepEqual((await search.searchWorkspace(org, pv, 'pa')).leads.map((l) => l.id), [booked])
    })

    console.log(`\nP16 roles: ${passed} checks passed.`)
  } finally {
    await db.query('DELETE FROM public.leads WHERE org_id=$1', [org]).catch(() => {})
    await db.query('DELETE FROM public.organisations WHERE id=$1', [org]).catch(() => {})
    for (const id of authIds) await service.auth.admin.deleteUser(id).catch(() => {})
    await db.end()
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
