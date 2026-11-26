// tests/db-integration/p7-function-grants.test.mjs
// Migration 20260048: server-only functions are not callable through the public API, while the server, sign-in
// (custom access token hook) and row-level-security helpers keep working.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const API = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
if (!API || !KEY || !ANON) { console.error('FATAL: Supabase URL, service role key and anon key are required.'); process.exit(1) }
let passed = 0
async function test(name, fn) { try { await fn(); passed++; console.log(`  ✓ ${name}`) } catch (e) { console.error(`  ✗ ${name}`); throw e } }
const rpc = (fn, args, key, bearer = key) => fetch(`${API}/rest/v1/rpc/${fn}`, {
  method: 'POST', headers: { apikey: key, Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args),
})

async function main() {
  const pg = await import('pg')
  const db = new (pg.default || pg).Client({ connectionString: DATABASE_URL })
  await db.connect()
  const RUN = crypto.randomBytes(4).toString('hex')
  console.log('P7 — FUNCTION GRANTS')
  try {
    await test('anonymous callers cannot touch rate-limit buckets', async () => {
      const r = await rpc('increment_rate_limit', { p_key: `attack-${RUN}`, p_window_bucket: 1, p_window_ms: 60000 }, ANON)
      assert.ok([401, 403, 404].includes(r.status), `status ${r.status}: ${await r.text()}`)
      assert.equal((await db.query('SELECT count(*)::int n FROM public.rate_limit_buckets WHERE bucket_key=$1', [`attack-${RUN}`])).rows[0].n, 0)
    })
    await test('the server can still count rate limits', async () => {
      const r = await rpc('increment_rate_limit', { p_key: `server-${RUN}`, p_window_bucket: 1, p_window_ms: 60000 }, KEY)
      const body = await r.text()
      assert.equal(r.status, 200, body)
      assert.equal(JSON.parse(body), 1)
      await db.query('DELETE FROM public.rate_limit_buckets WHERE bucket_key=$1', [`server-${RUN}`])
    })
    await test('anonymous callers cannot probe invitation tokens', async () => {
      const r = await rpc('verify_invitation_token', { p_raw_token: 'x'.repeat(64) }, ANON)
      assert.ok([401, 403, 404].includes(r.status), `status ${r.status}`)
    })
    await test('anonymous callers cannot reserve seats', async () => {
      const r = await rpc('reserve_employee_seat_atomic', {
        p_org_id: crypto.randomUUID(), p_email: 'x@repx.test', p_role: 'sales_exec', p_expires_at: new Date(Date.now() + 864e5).toISOString(),
      }, ANON)
      assert.ok([401, 403, 404].includes(r.status), `status ${r.status}`)
    })
    await test('signed-in users still sign in and the RLS helpers still answer for them', async () => {
      const email = `grants-${RUN}@repx.test`, password = `Pw-${RUN}-1234567`
      const created = await fetch(`${API}/auth/v1/admin/users`, {
        method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, email_confirm: true }),
      })
      assert.ok(created.ok, await created.text())
      const token = await fetch(`${API}/auth/v1/token?grant_type=password`, {
        method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
      })
      assert.equal(token.status, 200, 'sign-in (and the custom access token hook) works')
      const { access_token } = await token.json()
      const r = await rpc('auth_has_role_in_org', { check_org_id: crypto.randomUUID(), allowed_roles: ['owner'] }, ANON, access_token)
      const body = await r.text()
      assert.equal(r.status, 200, body)
      assert.equal(JSON.parse(body), false)
    })
    await test('trigger and server-only functions are not executable by signed-in users', async () => {
      const q = await db.query(`SELECT
        has_function_privilege('authenticated','public.increment_rate_limit(text,bigint,bigint)','EXECUTE') a,
        has_function_privilege('authenticated','public.verify_invitation_token(text)','EXECUTE') b,
        has_function_privilege('authenticated','public.enforce_onboarding_request_field_immutability()','EXECUTE') c,
        has_function_privilege('authenticated','public.reserve_employee_seat_atomic(uuid,text,member_role,timestamptz)','EXECUTE') d`)
      assert.deepEqual(q.rows[0], { a: false, b: false, c: false, d: true })
    })
    await test('flagged functions now have a fixed search path', async () => {
      const q = await db.query(`SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname IN ('update_updated_at_column','auth_app_role','is_manager','is_admin','custom_access_token_hook',
          'prevent_audit_log_mutation','prevent_bootstrap_state_mutation','check_project_org_immutable','check_connection_org_immutable','check_mapping_same_org')
          AND NOT coalesce(array_to_string(p.proconfig, ',') LIKE '%search_path=%pg_catalog%', false)`)
      assert.deepEqual(q.rows, [])
    })
    console.log(`\nP7 function grants: ${passed} checks passed.`)
  } finally { await db.end() }
}
main().catch((e) => { console.error(e); process.exit(1) })
