// tests/db-integration/p3b-entitlements.test.mjs
// Module switches: default on, switch off/on with a reason, audit, RLS, server-side refusal (real lib code).
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
  const ent = await jiti.import(path.join(root, 'lib/auth/entitlements.ts'))
  const pg = await import('pg')
  const db = new (pg.default || pg).Client({ connectionString: DATABASE_URL })
  await db.connect()
  const one = async (s, p) => (await db.query(s, p)).rows[0]
  const asUser = async (authId, sql, params) => {
    await db.query('BEGIN')
    try {
      await db.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ role: 'authenticated', sub: authId })])
      await db.query('SET LOCAL ROLE authenticated')
      return (await db.query(sql, params)).rows
    } finally { await db.query('ROLLBACK') }
  }
  const mkOrg = async (t) => (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,'developer') RETURNING id`, [`P3b ${t} ${RUN}`, `p3b-${t}-${RUN}`])).id
  const mkMember = async (org, role) => {
    const authId = crypto.randomUUID()
    await db.query(`INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
      VALUES ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),now(),now(),'{}','{}')`, [authId, `${role}-${authId.slice(0, 8)}@repx.test`])
    const p = await one('SELECT id FROM public.profiles WHERE auth_user_id=$1', [authId])
    await db.query('INSERT INTO public.org_members (org_id, profile_id, role) VALUES ($1,$2,$3)', [org, p.id, role])
    return authId
  }
  const set = (org, module, enabled, reason = 'Plan change') =>
    one(`SELECT public.set_module_entitlement($1,$2,$3,$4,NULL,'RE platform team') r`, [org, module, enabled, reason]).then((x) => x.r)

  console.log('P3b — MODULE ENTITLEMENTS')
  const orgs = []
  try {
    const org = await mkOrg('a'); orgs.push(org)
    const other = await mkOrg('b'); orgs.push(other)
    const rep = await mkMember(org, 'sales_exec'), otherOwner = await mkMember(other, 'owner')

    await test('every module is on for a workspace with no switches', async () => {
      assert.deepEqual(await ent.getModules(org), ent.ALL_ON)
      assert.equal(await ent.requireModule(org, 'inventory'), null)
    })
    await test('switching a module off makes the server refuse it (403 MODULE_DISABLED); others unaffected', async () => {
      const r = await set(org, 'inventory', false, 'Moved to Starter plan')
      assert.deepEqual([r.enabled, r.changed], [false, true])
      const res = await ent.requireModule(org, 'inventory')
      assert.equal(res.status, 403)
      assert.equal((await res.json()).code, 'MODULE_DISABLED')
      assert.equal(await ent.requireModule(org, 'sales'), null)
      assert.equal(await ent.requireModule(other, 'inventory'), null, 'another organisation is unaffected')
    })
    await test('switching back on restores it; repeating a state changes nothing and is not re-audited', async () => {
      assert.equal((await set(org, 'inventory', true, 'Upgraded')).changed, true)
      assert.equal(await ent.requireModule(org, 'inventory'), null)
      assert.equal((await set(org, 'inventory', true, 'Again')).changed, false)
      const a = await db.query(`SELECT action, metadata->>'reason' reason FROM public.org_audit_logs WHERE org_id=$1 AND action LIKE 'module.%' ORDER BY created_at, id`, [org])
      assert.deepEqual(a.rows, [{ action: 'module.disabled', reason: 'Moved to Starter plan' }, { action: 'module.enabled', reason: 'Upgraded' }])
    })
    await test('a reason is required; unknown modules and organisations are refused', async () => {
      await assert.rejects(set(org, 'sales', false, ' '), /reason/)
      await assert.rejects(set(org, 'payroll', false), /check constraint/)
      await assert.rejects(set(crypto.randomUUID(), 'sales', false), /not found/)
    })
    await test('RLS: members read their own workspace’s switches only, and cannot change them', async () => {
      await set(other, 'analytics', false)
      await set(org, 'routing', false)
      assert.deepEqual((await asUser(rep, 'SELECT DISTINCT org_id FROM public.org_module_entitlements')).map((r) => r.org_id), [org])
      assert.deepEqual((await asUser(otherOwner, 'SELECT DISTINCT org_id FROM public.org_module_entitlements')).map((r) => r.org_id), [other])
      await assert.rejects(asUser(otherOwner, `UPDATE public.org_module_entitlements SET enabled=true WHERE org_id=$1`, [other]), /permission denied/)
      const fn = await one(`SELECT has_function_privilege('authenticated','public.set_module_entitlement(uuid,text,boolean,text,uuid,text)','EXECUTE') a`)
      assert.equal(fn.a, false)
    })
    console.log(`\nP3b entitlements: ${passed} checks passed.`)
  } finally {
    for (const id of orgs) await db.query('DELETE FROM public.organisations WHERE id=$1', [id]).catch(() => {})
    await db.end()
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
