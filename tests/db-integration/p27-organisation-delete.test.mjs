// tests/db-integration/p27-organisation-delete.test.mjs — permanent deletion of a customer workspace (migration
// 20260065): Platform Owner only, exact name and a reason, refused while it holds business data, atomic, audited,
// and people's sign-in accounts are kept.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('FATAL: Supabase env required (URL and service key).'); process.exit(1) }
const RUN = crypto.randomBytes(4).toString('hex')
let passed = 0
async function test(name, fn) { try { await fn(); passed++; console.log(`  ✓ ${name}`) } catch (e) { console.error(`  ✗ ${name}`); throw e } }
class UnusedRealtimeTransport { constructor() { throw new Error('Realtime is not used by these tests') } }
const clientOpts = { auth: { persistSession: false, autoRefreshToken: false }, ...(globalThis.WebSocket ? {} : { realtime: { transport: UnusedRealtimeTransport } }) }

async function main() {
  const db = createClient(SUPABASE_URL, SERVICE_KEY, clientOpts)
  const pg = await import('pg')
  const sql = new (pg.default || pg).Client({ connectionString: DATABASE_URL }); await sql.connect()
  const one = async (s, p) => (await sql.query(s, p)).rows[0]
  const count = async (s, p) => Number((await one(s, p)).n)
  const mkUser = async (label) => {
    const { data, error } = await db.auth.admin.createUser({ email: `${label}-${RUN}@repx.test`, password: 'Del-Test-' + RUN + 'x9', email_confirm: true, user_metadata: { full_name: label } })
    if (error) throw error
    return { id: data.user.id, profile: (await one('SELECT id FROM public.profiles WHERE auth_user_id=$1', [data.user.id])).id }
  }
  const mkOrg = async (name) => (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,'developer') RETURNING id`, [name, `${name.toLowerCase().replace(/\s+/g, '-')}-${RUN}`])).id
  const del = (org, name, reason, actor, purge) => db.rpc('platform_delete_organisation', { p_org: org, p_confirm_name: name, p_reason: reason, p_actor_user: actor, ...(purge === undefined ? {} : { p_purge_data: purge }) })

  console.log('P27 — DELETE A CUSTOMER WORKSPACE')
  const owner = await mkUser('owner'); await sql.query(`INSERT INTO public.platform_users (user_id, role) VALUES ($1, 'super_admin')`, [owner.id])
  const admin = await mkUser('padmin'); await sql.query(`INSERT INTO public.platform_users (user_id, role) VALUES ($1, 'platform_admin')`, [admin.id])
  const member = await mkUser('member')

  const empty = await mkOrg(`Empty Co ${RUN}`)
  await sql.query(`INSERT INTO public.org_members (org_id, profile_id, role, status) VALUES ($1,$2,'owner','active')`, [empty, member.profile])
  await sql.query(`INSERT INTO public.org_subscriptions (org_id, status, billing_cycle, included_seats, additional_seats) VALUES ($1,'trial','monthly',5,0)`, [empty])

  await test('only an active Platform Owner; the exact name and a reason are required', async () => {
    assert.match((await del(empty, `Empty Co ${RUN}`, 'duplicate', admin.id)).error.message, /only an active Platform Owner/)
    assert.match((await del(empty, 'wrong name', 'duplicate', owner.id)).error.message, /type the workspace name exactly/)
    assert.match((await del(empty, `Empty Co ${RUN}`, 'x', owner.id)).error.message, /reason/)
    assert.equal(await count('SELECT count(*) n FROM public.organisations WHERE id=$1', [empty]), 1)
  })

  await test('refused while the workspace holds business data, naming what blocks it', async () => {
    const busy = await mkOrg(`Busy Co ${RUN}`)
    await sql.query(`INSERT INTO public.projects (org_id, name, slug) VALUES ($1, 'Skyline', $2)`, [busy, `skyline-${RUN}`])
    const { data, error } = await del(busy, `Busy Co ${RUN}`, 'test', owner.id)
    assert.ifError(error); assert.equal(data.deleted, false); assert.equal(data.blockers.projects, 1); assert.equal(data.purgeable, true)
    assert.equal(await count('SELECT count(*) n FROM public.organisations WHERE id=$1', [busy]), 1, 'nothing deleted')
  })

  await test('a test workspace is deleted with its data only when the Owner asks for it (20260066)', async () => {
    const name = `Test Co ${RUN}`
    const org = await mkOrg(name)
    await sql.query(`INSERT INTO public.org_members (org_id, profile_id, role, status) VALUES ($1,$2,'owner','active')`, [org, member.profile])
    const proj = (await one(`INSERT INTO public.projects (org_id, name, slug) VALUES ($1, 'Test Tower', $2) RETURNING id`, [org, `tt-${RUN}`])).id
    await sql.query(`INSERT INTO public.inventory_items (org_id, project_id, unit_number, category, area_value, bhk_config, total_price, status) VALUES
      ($1,$2,'T-1','apartments',1000,'2BHK',9000000,'available'),($1,$2,'T-2','apartments',1200,'3BHK',11000000,'available')`, [org, proj])
    await sql.query(`INSERT INTO public.leads (org_id, name, phone, source, status, assigned_to, project_id) VALUES ($1,'Asha','9000000101','website','new',$2,$3),($1,'Ravi','9000000102','website','qualified',$2,$3)`, [org, member.profile, proj])
    const team = (await one(`INSERT INTO public.teams (org_id, name) VALUES ($1,'Desk') RETURNING id`, [org])).id
    await sql.query(`INSERT INTO public.routing_rules (org_id, name, team_id, priority, sticky_days) VALUES ($1,'All',$2,1,0)`, [org, team])

    const refused = await del(org, name, 'test workspace', owner.id, false)
    assert.ifError(refused.error); assert.equal(refused.data.deleted, false); assert.equal(refused.data.purgeable, true)
    assert.equal(refused.data.blockers.leads, 2); assert.equal(refused.data.blockers.inventory_items, 2)
    assert.equal(await count('SELECT count(*) n FROM public.leads WHERE org_id=$1', [org]), 2, 'nothing removed without the choice')

    const { data, error } = await del(org, name, 'test workspace', owner.id, true)
    assert.ifError(error); assert.equal(data.deleted, true); assert.equal(data.data_purged.leads, 2)
    for (const t of ['organisations', 'leads', 'projects', 'inventory_items', 'org_members', 'routing_rules', 'teams']) {
      const col = t === 'organisations' ? 'id' : 'org_id'
      assert.equal(await count(`SELECT count(*) n FROM public.${t} WHERE ${col}=$1`, [org]), 0, `${t} removed`)
    }
    assert.equal(await count('SELECT count(*) n FROM auth.users WHERE id=$1', [member.id]), 1, 'sign-in account kept')
    const a = await one(`SELECT metadata FROM public.platform_audit_logs WHERE action='organisation.deleted' AND target_entity_id=$1`, [org])
    assert.equal(a.metadata.data_purged.leads, 2); assert.equal(a.metadata.data_purged.projects, 1)
  })

  await test('an empty workspace is deleted with its members and subscription; accounts are kept; audited', async () => {
    const { data, error } = await del(empty, `  Empty Co ${RUN} `, 'Duplicate created by mistake', owner.id)
    assert.ifError(error); assert.equal(data.deleted, true); assert.equal(data.members_removed, 1)
    assert.equal(await count('SELECT count(*) n FROM public.organisations WHERE id=$1', [empty]), 0)
    assert.equal(await count('SELECT count(*) n FROM public.org_members WHERE org_id=$1', [empty]), 0)
    assert.equal(await count('SELECT count(*) n FROM public.org_subscriptions WHERE org_id=$1', [empty]), 0)
    assert.equal(await count('SELECT count(*) n FROM auth.users WHERE id=$1', [member.id]), 1, 'sign-in account kept')
    const a = await one(`SELECT actor_user_id, metadata FROM public.platform_audit_logs WHERE action='organisation.deleted' AND target_entity_id=$1`, [empty])
    assert.equal(a.actor_user_id, owner.id); assert.equal(a.metadata.reason, 'Duplicate created by mistake'); assert.equal(a.metadata.members, 1)
  })

  await test('unpaid invoices go with a test workspace; a paid invoice always blocks (20260067)', async () => {
    const name = `Billed Co ${RUN}`
    const org = await mkOrg(name)
    await sql.query(`INSERT INTO public.org_members (org_id, profile_id, role, status) VALUES ($1,$2,'owner','active')`, [org, member.profile])
    const inv = (await one(`SELECT public.billing_issue_plan_invoice($1, 'leads', 'monthly', $2) AS id`, [org, member.profile])).id
    const r1 = await del(org, name, 'test workspace', owner.id, false)
    assert.ifError(r1.error); assert.equal(r1.data.deleted, false); assert.equal(r1.data.purgeable, true); assert.equal(r1.data.blockers.unpaid_invoices, 1)

    await sql.query(`ALTER TABLE public.org_subscription_invoices DISABLE TRIGGER USER`)
    await sql.query(`UPDATE public.org_subscription_invoices SET status = 'paid' WHERE id = $1`, [inv])
    await sql.query(`ALTER TABLE public.org_subscription_invoices ENABLE TRIGGER USER`)
    const r2 = await del(org, name, 'test workspace', owner.id, true)
    assert.ifError(r2.error); assert.equal(r2.data.deleted, false); assert.equal(r2.data.purgeable, false); assert.equal(r2.data.blockers.paid_invoices, 1)

    await sql.query(`ALTER TABLE public.org_subscription_invoices DISABLE TRIGGER USER`)
    await sql.query(`UPDATE public.org_subscription_invoices SET status = 'void' WHERE id = $1`, [inv])
    await sql.query(`ALTER TABLE public.org_subscription_invoices ENABLE TRIGGER USER`)
    const r3 = await del(org, name, 'test workspace', owner.id, true)
    assert.ifError(r3.error); assert.equal(r3.data.deleted, true)
    assert.equal(await count('SELECT count(*) n FROM public.org_subscription_invoices WHERE org_id=$1', [org]), 0)
  })

  await test('clients cannot call it', async () => {
    const r = await one(`SELECT has_function_privilege('anon', 'public.platform_delete_organisation(uuid, text, text, uuid, boolean)', 'EXECUTE') a, has_function_privilege('authenticated', 'public.platform_delete_organisation(uuid, text, text, uuid, boolean)', 'EXECUTE') b`)
    assert.equal(r.a, false); assert.equal(r.b, false)
  })

  await sql.end()
  console.log(`\nP27 organisation delete: ${passed} checks passed.`)
}
main().catch((e) => { console.error(e); process.exit(1) })
