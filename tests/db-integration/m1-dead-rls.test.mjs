// tests/db-integration/m1-dead-rls.test.mjs — migration 20260043: the 17 formerly "dead-policy" tables are
// server-only (no client policies, no client privileges) and still fully usable by the service role.
import assert from 'node:assert/strict'

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const TABLES = ['automation_executions', 'automation_workflow_steps', 'automation_workflows', 'bookings',
  'channel_partner_commissions', 'channel_partners', 'deals', 'developer_api_keys', 'inventory_blockings',
  'lead_touchpoints', 'project_microsites', 'site_visits', 'webhook_delivery_logs', 'webhook_subscriptions',
  'whatsapp_conversations', 'whatsapp_messages', 'whatsapp_templates']
let passed = 0
async function test(name, fn) { try { await fn(); passed++; console.log(`  ✓ ${name}`) } catch (e) { console.error(`  ✗ ${name}`); throw e } }

async function main() {
  const pg = await import('pg')
  const db = new (pg.default || pg).Client({ connectionString: DATABASE_URL })
  await db.connect()
  const one = async (s, p) => (await db.query(s, p)).rows[0]
  console.log('M1-13 — DEAD RLS POLICIES CLOSED (migration 20260043)')
  try {
    await test('no policy compares profile_id with auth.uid()', async () => {
      const r = await one(`SELECT count(*)::int n FROM pg_policies WHERE schemaname='public' AND (qual LIKE '%profile_id = auth.uid()%' OR with_check LIKE '%profile_id = auth.uid()%')`)
      assert.equal(r.n, 0)
    })
    for (const t of TABLES) {
      await test(`${t}: RLS on, anon/authenticated have no privileges, service_role keeps them`, async () => {
        const r = await one(`SELECT c.relrowsecurity rls,
          has_table_privilege('authenticated', c.oid, 'SELECT') a_sel, has_table_privilege('authenticated', c.oid, 'INSERT,UPDATE,DELETE') a_write,
          has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE') anon_any,
          has_table_privilege('service_role', c.oid, 'SELECT') s_sel, has_table_privilege('service_role', c.oid, 'INSERT') s_ins
          FROM pg_class c WHERE c.oid = $1::regclass`, [`public.${t}`])
        assert.deepEqual(r, { rls: true, a_sel: false, a_write: false, anon_any: false, s_sel: true, s_ins: true })
      })
    }
    await test('an authenticated session gets "permission denied", not silent emptiness', async () => {
      await db.query('BEGIN')
      try {
        await db.query(`SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000001"}', true)`)
        await db.query('SET LOCAL ROLE authenticated')
        await assert.rejects(db.query('SELECT 1 FROM public.developer_api_keys LIMIT 1'), /permission denied/)
      } finally { await db.query('ROLLBACK') }
    })
  } finally { await db.end() }
  console.log(`\nALL ${passed} DEAD-RLS CLOSURE TESTS PASSED`)
}
main().catch((e) => { console.error('\nTEST SUITE FAILED:', e?.message || e); process.exit(1) })
