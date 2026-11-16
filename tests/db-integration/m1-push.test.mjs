// tests/db-integration/m1-push.test.mjs
// Web Push channel (M1-6) against the local Supabase stack, using the REAL lib/notifications/push.ts.
// The network call (web-push sendNotification) is replaced by a recorder so we can script device responses.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('FATAL: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
  process.exit(1)
}
const RUN = crypto.randomBytes(4).toString('hex')
let passed = 0
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`) } catch (err) { console.error(`  ✗ ${name}`); throw err }
}

async function main() {
  if (!globalThis.WebSocket) globalThis.WebSocket = class UnusedRealtimeTransport {}
  const jiti = createJiti(import.meta.url, { alias: { '@': root } })
  const webpushMod = await jiti.import('web-push')
  const webpush = webpushMod.default ?? webpushMod
  const keys = webpush.generateVAPIDKeys()
  process.env.VAPID_PUBLIC_KEY = keys.publicKey
  process.env.VAPID_PRIVATE_KEY = keys.privateKey
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.regrow.test'
  const push = await jiti.import(path.join(root, 'lib/notifications/push.ts'))

  const calls = []
  let script = () => undefined
  webpush.sendNotification = async (sub, payload) => { calls.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) }); return script(sub) }
  const gone = () => { throw new webpush.WebPushError('gone', 410, {}, '', '') }
  const flaky = () => { throw new webpush.WebPushError('server error', 500, {}, '', '') }

  const pg = await import('pg')
  const db = new (pg.default || pg).Client({ connectionString: DATABASE_URL })
  await db.connect()
  const one = async (sql, p) => (await db.query(sql, p)).rows[0]

  console.log('M1 — WEB PUSH CHANNEL (real lib/notifications/push.ts) AGAINST LOCAL SUPABASE')
  try {
    const uid = crypto.randomUUID()
    await db.query(`INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud)
                    VALUES ($1,'00000000-0000-0000-0000-000000000000',$2,'x',now(),'{"provider":"email"}','{}',now(),now(),'authenticated','authenticated')`, [uid, `push-${RUN}@regrow.test`])
    const profile = (await one('SELECT id FROM public.profiles WHERE auth_user_id=$1', [uid])).id
    const org = (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,'developer') RETURNING id`, [`Push ${RUN}`, `push-${RUN}`])).id
    const ep = (n) => `https://push.example.test/${RUN}/${n}`
    const addSub = (n) => db.query(`INSERT INTO public.push_subscriptions (profile_id, endpoint, p256dh, auth) VALUES ($1,$2,'k','a')`, [profile, ep(n)])
    const notif = { id: crypto.randomUUID(), org_id: org, recipient_profile_id: profile, type: 'lead_assigned', title: 'New lead: Rohan', body: 'Skyline Towers · Meta', lead_id: crypto.randomUUID(), data: {} }

    await test('authenticated users have no direct access to push_subscriptions (server-only table)', async () => {
      const r = await one(`SELECT has_table_privilege('authenticated','public.push_subscriptions','SELECT') s, has_table_privilege('anon','public.push_subscriptions','INSERT') i`)
      assert.deepEqual(r, { s: false, i: false })
    })
    await test('non-https endpoints are rejected by the database', async () => {
      await assert.rejects(db.query(`INSERT INTO public.push_subscriptions (profile_id, endpoint, p256dh, auth) VALUES ($1,'http://evil.test/x','k','a')`, [profile]), /push_subscriptions_endpoint_https/)
    })
    await test('no device → skipped, nothing sent', async () => {
      const r = await push.pushAdapter.deliver(notif)
      assert.deepEqual(r, { status: 'skipped', detail: 'no push subscription' })
      assert.equal(calls.length, 0)
    })
    await test('sends to every device; payload deep-links to the lead in the right workspace', async () => {
      await addSub('a'); await addSub('b')
      const r = await push.pushAdapter.deliver(notif)
      assert.equal(r.status, 'sent')
      assert.equal(calls.length, 2)
      assert.equal(calls[0].payload.url, `https://app.regrow.test/push-${RUN}/leads/${notif.lead_id}`)
      assert.equal(calls[0].payload.title, 'New lead: Rohan')
      const rows = (await db.query(`SELECT last_success_at FROM public.push_subscriptions WHERE profile_id=$1`, [profile])).rows
      assert.ok(rows.every((x) => x.last_success_at))
    })
    await test('an expired device (410) is removed; delivery still counts as sent via the other device', async () => {
      calls.length = 0
      script = (sub) => (sub.endpoint === ep('a') ? gone() : undefined)
      assert.equal((await push.pushAdapter.deliver(notif)).status, 'sent')
      const left = (await db.query(`SELECT endpoint FROM public.push_subscriptions WHERE profile_id=$1`, [profile])).rows.map((x) => x.endpoint)
      assert.deepEqual(left, [ep('b')])
    })
    await test('a transient failure on every device throws (job retries) and counts the failure', async () => {
      script = flaky
      await assert.rejects(push.pushAdapter.deliver(notif), /push: /)
      assert.equal((await one(`SELECT failure_count FROM public.push_subscriptions WHERE endpoint=$1`, [ep('b')])).failure_count, 1)
    })
    await test('a device that keeps failing is dropped after 20 failures', async () => {
      await db.query(`UPDATE public.push_subscriptions SET failure_count=19 WHERE endpoint=$1`, [ep('b')])
      await assert.rejects(push.pushAdapter.deliver(notif))
      assert.equal((await one(`SELECT count(*)::int n FROM public.push_subscriptions WHERE profile_id=$1`, [profile])).n, 0)
    })
    await test('without VAPID keys the channel reports not configured', async () => {
      const saved = process.env.VAPID_PRIVATE_KEY
      delete process.env.VAPID_PRIVATE_KEY
      assert.equal(push.pushAdapter.isConfigured(), false)
      process.env.VAPID_PRIVATE_KEY = saved
      assert.equal(push.pushAdapter.isConfigured(), true)
    })
    await test('deleting the user removes their devices', async () => {
      await addSub('c')
      await db.query('DELETE FROM auth.users WHERE id=$1', [uid])
      assert.equal((await one(`SELECT count(*)::int n FROM public.push_subscriptions WHERE endpoint=$1`, [ep('c')])).n, 0)
    })
  } finally {
    await db.end()
  }
  console.log(`\nALL ${passed} M1 WEB PUSH TESTS PASSED`)
}
main().catch((err) => { console.error('\nTEST SUITE FAILED:', err?.message || err); process.exit(1) })
