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
    const { data, error } = await db.auth.admin.createUser({ email: `${label}-${RUN}@regrow.test`, password: 'Del-Test-' + RUN + 'x9', email_confirm: true, user_metadata: { full_name: label } })
    if (error) throw error
    return { id: data.user.id, profile: (await one('SELECT id FROM public.profiles WHERE auth_user_id=$1', [data.user.id])).id }
  }
  const mkOrg = async (name) => (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,'developer') RETURNING id`, [name, `${name.toLowerCase().replace(/\s+/g, '-')}-${RUN}`])).id
  const del = (org, name, reason, actor) => db.rpc('platform_delete_organisation', { p_org: org, p_confirm_name: name, p_reason: reason, p_actor_user: actor })

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
    assert.ifError(error); assert.equal(data.deleted, false); assert.equal(data.blockers.projects, 1)
    assert.equal(await count('SELECT count(*) n FROM public.organisations WHERE id=$1', [busy]), 1, 'nothing deleted')
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

  await test('clients cannot call it', async () => {
    const r = await one(`SELECT has_function_privilege('anon', 'public.platform_delete_organisation(uuid, text, text, uuid)', 'EXECUTE') a, has_function_privilege('authenticated', 'public.platform_delete_organisation(uuid, text, text, uuid)', 'EXECUTE') b`)
    assert.equal(r.a, false); assert.equal(r.b, false)
  })

  await sql.end()
  console.log(`\nP27 organisation delete: ${passed} checks passed.`)
}
main().catch((e) => { console.error(e); process.exit(1) })
