// tests/db-integration/p25-demo-environment.test.mjs — migration 20260063 (demo environment) against the local
// Supabase stack. Proves the safety rules: an unmarked database refuses demo data and the purge; the marker can only
// be written by the database owner and never with the production reference; is_demo cannot be added to a real
// organisation; the purge removes only tagged demo records and leaves real ones untouched; the platform audit log
// stays append-only for everything else. REAL database, nothing mocked.
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
  const service = createClient(SUPABASE_URL, SERVICE_KEY, clientOpts)
  const pg = await import('pg')
  const db = new (pg.default || pg).Client({ connectionString: DATABASE_URL })
  await db.connect()
  const one = async (s, p) => (await db.query(s, p)).rows[0]
  const rejects = async (s, p, re) => { await assert.rejects(db.query(s, p), re) }
  console.log('P25 — DEMO ENVIRONMENT SAFETY (real database)')

  // Start from an unmarked database, as production is; restore whatever marker existed afterwards.
  const saved = (await db.query('SELECT kind, project_ref, note FROM public.deployment_environment')).rows
  await db.query('DELETE FROM public.deployment_environment')
  const authIds = []
  const mkUser = async (email, demo) => {
    const { data, error } = await service.auth.admin.createUser({ email, password: 'Demo-Test-' + RUN + '9', email_confirm: true, app_metadata: demo ? { regrow_demo: true } : {} })
    if (error) throw error
    authIds.push(data.user.id)
    return { user: data.user.id, profile: (await one('SELECT id FROM public.profiles WHERE auth_user_id=$1', [data.user.id])).id }
  }
  let realOrg
  try {
    await test('unmarked database: no demo organisation, no purge, nothing to report as allowed', async () => {
      assert.equal((await one('SELECT public.demo_environment_allowed() a')).a, false)
      await rejects(`INSERT INTO public.organisations (name, slug, type, is_demo) VALUES ('X','x-${RUN}','developer',true)`, [], /only be created on a database marked/)
      const { error } = await service.rpc('demo_purge')
      assert.match(error?.message ?? '', /not marked as staging/)
    })

    await test('marker: owner-only, one row, production reference refused, service role cannot write it', async () => {
      await rejects(`INSERT INTO public.deployment_environment (kind, project_ref) VALUES ('staging','rtbvzqwwhefyyuhpoznu')`, [], /check constraint/)
      await rejects(`INSERT INTO public.deployment_environment (kind, project_ref) VALUES ('production','abc')`, [], /check constraint/)
      const { error } = await service.from('deployment_environment').insert({ kind: 'local', project_ref: 'local' })
      assert.ok(error, 'service role must not be able to mark a database')
      const anon = await one(`SELECT has_table_privilege('authenticated','public.deployment_environment','SELECT') a, has_table_privilege('service_role','public.deployment_environment','INSERT') b`)
      assert.deepEqual([anon.a, anon.b], [false, false])
      await db.query(`INSERT INTO public.deployment_environment (kind, project_ref, note) VALUES ('local','local','p25')`)
      await rejects(`INSERT INTO public.deployment_environment (kind, project_ref) VALUES ('staging','abcdefghijklmnopqrst')`, [], /duplicate key/)
      assert.equal((await one('SELECT public.demo_environment_allowed() a')).a, true)
    })

    await test('is_demo is fixed at creation: a real organisation can never be re-tagged as demo', async () => {
      realOrg = (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ('Real Co ${RUN}','real-${RUN}','developer') RETURNING id`)).id
      await rejects(`UPDATE public.organisations SET is_demo = true WHERE id = $1`, [realOrg], /cannot be changed/)
      const demo = (await one(`INSERT INTO public.organisations (name, slug, type, is_demo) VALUES ('Demo Co ${RUN}','demo-${RUN}','developer',true) RETURNING id`)).id
      await rejects(`UPDATE public.organisations SET is_demo = false WHERE id = $1`, [demo], /cannot be changed/)
    })

    let realUser, demoUser, demoOrg
    await test('purge removes demo organisations with their records and demo accounts; real ones are untouched', async () => {
      realUser = await mkUser(`real-${RUN}@regrow.test`, false)
      demoUser = await mkUser(`demo-${RUN}@example.test`, true)
      const fakeTag = await mkUser(`tagged-${RUN}@regrow.test`, true) // tagged but not on example.test: not demo
      await db.query(`INSERT INTO public.org_members (org_id, profile_id, role) VALUES ($1,$2,'owner')`, [realOrg, realUser.profile])
      const realLead = (await one(`INSERT INTO public.leads (org_id, name, phone) VALUES ($1,'Real buyer','9000000001') RETURNING id`, [realOrg])).id
      demoOrg = (await one(`SELECT id FROM public.organisations WHERE slug = $1`, [`demo-${RUN}`])).id
      await db.query(`INSERT INTO public.org_members (org_id, profile_id, role) VALUES ($1,$2,'owner')`, [demoOrg, demoUser.profile])
      const proj = (await one(`INSERT INTO public.projects (org_id, name, slug) VALUES ($1,'Demo P','demo-p-${RUN}') RETURNING id`, [demoOrg])).id
      const demoLead = (await one(`INSERT INTO public.leads (org_id, name, phone, project_id) VALUES ($1,'Demo buyer','9000000002',$2) RETURNING id`, [demoOrg, proj])).id
      await db.query(`INSERT INTO public.lead_activities (lead_id, actor_id, type) VALUES ($1,$2,'created')`, [demoLead, demoUser.profile])
      await db.query(`INSERT INTO public.platform_users (user_id, role) VALUES ($1,'support_agent')`, [demoUser.user])
      await db.query(`INSERT INTO public.platform_audit_logs (actor_user_id, actor_role, action, target_entity_type, target_entity_id) VALUES ($1,'support_agent','demo.test','organisation',$2)`, [demoUser.user, demoOrg])
      await db.query(`INSERT INTO public.platform_audit_logs (actor_user_id, actor_role, action, target_entity_type, target_entity_id) VALUES ($1,'support_agent','real.test','organisation',$2)`, [realUser.user, realOrg])

      const { data, error } = await service.rpc('demo_purge')
      assert.ifError(error)
      assert.ok(data.organisations >= 1 && data.users >= 1)
      assert.equal(Number((await one('SELECT count(*) n FROM public.organisations WHERE id=$1', [demoOrg])).n), 0)
      assert.equal(Number((await one('SELECT count(*) n FROM public.leads WHERE id=$1', [demoLead])).n), 0)
      assert.equal(Number((await one('SELECT count(*) n FROM auth.users WHERE id=$1', [demoUser.user])).n), 0)
      // Real records survive.
      assert.equal(Number((await one('SELECT count(*) n FROM public.organisations WHERE id=$1', [realOrg])).n), 1)
      assert.equal(Number((await one('SELECT count(*) n FROM public.leads WHERE id=$1', [realLead])).n), 1)
      assert.equal(Number((await one('SELECT count(*) n FROM auth.users WHERE id = ANY($1)', [[realUser.user, fakeTag.user]])).n), 2, 'tag alone (no example.test address) is not enough')
      assert.equal(Number((await one(`SELECT count(*) n FROM public.platform_audit_logs WHERE action='real.test' AND actor_user_id=$1`, [realUser.user])).n), 1)
    })

    await test('platform audit log stays append-only outside the purge, even for demo actors on a marked database', async () => {
      const d = await mkUser(`demo2-${RUN}@example.test`, true)
      await db.query(`INSERT INTO public.platform_audit_logs (actor_user_id, actor_role, action, target_entity_type, target_entity_id) VALUES ($1,'auditor','demo2.test','organisation',$2)`, [d.user, realOrg])
      await rejects(`DELETE FROM public.platform_audit_logs WHERE actor_user_id = $1`, [d.user], /append-only/)
      await rejects(`UPDATE public.platform_audit_logs SET action='x' WHERE actor_user_id = $1`, [d.user], /immutable/)
      await rejects(`DELETE FROM public.platform_audit_logs WHERE actor_user_id = $1`, [realUser.user], /append-only/)
    })

    await test('purge refuses, removing nothing, when a demo account belongs to a real organisation', async () => {
      const d = await mkUser(`demo3-${RUN}@example.test`, true)
      await db.query(`INSERT INTO public.org_members (org_id, profile_id, role) VALUES ($1,$2,'sales_exec')`, [realOrg, d.profile])
      const { error } = await service.rpc('demo_purge')
      assert.match(error?.message ?? '', /member of a non-demo organisation/)
      assert.equal(Number((await one('SELECT count(*) n FROM auth.users WHERE id=$1', [d.user])).n), 1)
      await db.query('DELETE FROM public.org_members WHERE profile_id=$1', [d.profile])
      const again = await service.rpc('demo_purge')
      assert.ifError(again.error)
      assert.equal(Number((await one('SELECT count(*) n FROM auth.users WHERE id=$1', [d.user])).n), 0)
    })

    await test('functions are not callable by signed-in users or the public', async () => {
      for (const fn of ['demo_purge()', 'demo_environment_allowed()', 'is_demo_auth_user(uuid)']) {
        const r = await one(`SELECT has_function_privilege('authenticated', 'public.${fn}', 'EXECUTE') a, has_function_privilege('anon', 'public.${fn}', 'EXECUTE') b`)
        assert.deepEqual([r.a, r.b], [false, false], fn)
      }
    })
  } finally {
    await db.query(`DELETE FROM public.org_members WHERE org_id=$1`, [realOrg]).catch(() => {})
    await db.query(`DELETE FROM public.leads WHERE org_id=$1`, [realOrg]).catch(() => {})
    await db.query(`DELETE FROM public.organisations WHERE id=$1`, [realOrg]).catch(() => {})
    await db.query('DELETE FROM public.deployment_environment')
    for (const m of saved) await db.query('INSERT INTO public.deployment_environment (kind, project_ref, note) VALUES ($1,$2,$3)', [m.kind, m.project_ref, m.note])
    for (const id of authIds) await service.auth.admin.deleteUser(id).catch(() => {})
    await db.end()
  }
  console.log(`P25: ${passed} checks passed`)
}
main().catch((e) => { console.error(e); process.exit(1) })
