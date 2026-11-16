// tests/db-integration/m1-notifications.test.mjs
// REGrow M1 — notifications outbox, in-app inbox, durable job queue and scheduler (migration 20260039),
// plus the REAL lib/jobs/runner.ts and app/api/jobs/run/route.ts (imported via jiti) against local Supabase.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('FATAL: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (see `supabase status -o env`).')
  process.exit(1)
}
const RUN = crypto.randomBytes(4).toString('hex')

let passed = 0
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`) } catch (err) { console.error(`  ✗ ${name}`); throw err }
}

async function main() {
  // CI runs Node 20 (no native WebSocket); the service client never opens a realtime channel. Production runs Node 22+.
  if (!globalThis.WebSocket) globalThis.WebSocket = class UnusedRealtimeTransport {}
  const jiti = createJiti(import.meta.url, { alias: { '@': root } })
  const { runDueJobs } = await jiti.import(path.join(root, 'lib/jobs/runner.ts'))
  const channels = await jiti.import(path.join(root, 'lib/notifications/channels.ts'))
  const { createServiceClient } = await jiti.import(path.join(root, 'lib/supabase/server.ts'))
  const service = createServiceClient()

  const pg = await import('pg')
  const { Client } = pg.default || pg
  const db = new Client({ connectionString: DATABASE_URL })
  await db.connect()
  const q = (sql, params) => db.query(sql, params)
  const one = async (sql, params) => (await q(sql, params)).rows[0]
  const many = async (sql, params) => (await q(sql, params)).rows

  let inTransaction = false
  async function expectError(sql, params, pattern) {
    await q(inTransaction ? 'SAVEPOINT e' : 'BEGIN')
    try { await q(sql, params); assert.fail(`should have failed: ${sql}`) } catch (err) {
      if (err.code === 'ERR_ASSERTION') throw err
      assert.match(err.message, pattern)
    } finally { await q(inTransaction ? 'ROLLBACK TO SAVEPOINT e' : 'ROLLBACK') }
  }
  async function asUser(authUserId, fn) {
    await q('BEGIN'); inTransaction = true
    try {
      await q(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: authUserId, role: 'authenticated' })])
      await q('SET LOCAL ROLE authenticated')
      return await fn()
    } finally { inTransaction = false; await q('ROLLBACK') }
  }

  let seq = 0
  const phone = () => `97${RUN.replace(/\D/g, '').padEnd(4, '3').slice(0, 4)}${String(++seq).padStart(4, '0')}`
  const mkUser = async (label) => {
    const id = crypto.randomUUID()
    await q(`INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud)
             VALUES ($1, '00000000-0000-0000-0000-000000000000', $2, 'x', now(), '{"provider":"email"}', '{}', now(), now(), 'authenticated', 'authenticated')`,
      [id, `m1n-${label}-${RUN}@regrow.test`])
    const p = await one('SELECT id FROM public.profiles WHERE auth_user_id = $1', [id])
    return { authId: id, profileId: p ? p.id : (await one('INSERT INTO public.profiles (auth_user_id, full_name) VALUES ($1, $2) RETURNING id', [id, label])).id }
  }
  const mkOrg = async (label) => (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1, $2, 'developer') RETURNING id`, [`M1N ${label} ${RUN}`, `m1n-${label}-${RUN}`])).id
  const addMember = (org, u, role, status = 'active') => q(`INSERT INTO public.org_members (org_id, profile_id, role, status) VALUES ($1, $2, $3, $4)`, [org, u.profileId, role, status])
  const notificationsFor = (u) => many(`SELECT * FROM public.notifications WHERE recipient_profile_id = $1 ORDER BY created_at`, [u.profileId])

  console.log('===================================================================')
  console.log('M1 — NOTIFICATIONS, INBOX & JOB QUEUE (migration 20260039) TESTS')
  console.log('===================================================================')

  try {
    // ---------------------------------------------------------------- fixtures
    const org = await mkOrg('routed')
    const owner = await mkUser('owner'); await addMember(org, owner, 'owner')
    const mgr = await mkUser('mgr'); await addMember(org, mgr, 'manager')
    const exMgr = await mkUser('exmgr'); await addMember(org, exMgr, 'manager', 'deactivated')
    const rep = await mkUser('rep'); await addMember(org, rep, 'sales_exec')
    const rep2 = await mkUser('rep2'); await addMember(org, rep2, 'sales_exec')
    const project = (await one(`INSERT INTO public.projects (org_id, name, slug) VALUES ($1, 'Skyline Towers', $2) RETURNING id`, [org, `m1n-p-${RUN}`])).id
    const team = (await one(`INSERT INTO public.teams (org_id, name) VALUES ($1, 'Desk') RETURNING id`, [org])).id
    await q(`INSERT INTO public.team_members (org_id, team_id, profile_id) VALUES ($1, $2, $3)`, [org, team, rep.profileId])
    await q(`INSERT INTO public.routing_rules (org_id, name, team_id, match_project_ids, sticky_days) VALUES ($1, 'Skyline', $2, $3, 0)`, [org, team, [project]])

    // ---------------------------------------------------------------- outbox trigger
    console.log('\nnotification outbox (same transaction as assignment)')
    let routedLead
    await test('a routed lead notifies its new owner and enqueues one dispatch job', async () => {
      routedLead = await one(`INSERT INTO public.leads (org_id, project_id, name, phone, email, source) VALUES ($1, $2, 'Asha Rao', $3, 'asha@example.test', 'meta_ads') RETURNING id, assigned_to, phone`, [org, project, phone()])
      assert.equal(routedLead.assigned_to, rep.profileId)
      const [n] = await notificationsFor(rep)
      assert.equal(n.type, 'lead_assigned')
      assert.equal(n.title, 'New lead: Asha Rao')
      assert.equal(n.body, 'Skyline Towers · meta ads')
      assert.equal(n.lead_id, routedLead.id)
      const jobs = await many(`SELECT kind, status, payload FROM public.scheduled_jobs WHERE payload->>'notification_id' = $1`, [n.id])
      assert.deepEqual(jobs.map((j) => [j.kind, j.status]), [['notification.dispatch', 'pending']])
    })
    await test("notification text never contains the buyer's phone or email", async () => {
      const [n] = await notificationsFor(rep)
      const text = `${n.title} ${n.body} ${JSON.stringify(n.data)}`
      assert.ok(!text.includes(routedLead.phone) && !text.includes('asha@example.test'))
    })
    await test('a manual reassignment notifies the new owner', async () => {
      await q(`UPDATE public.leads SET assigned_to = $1 WHERE id = $2`, [rep2.profileId, routedLead.id])
      const [n] = await notificationsFor(rep2)
      assert.equal(n.title, 'Lead reassigned to you: Asha Rao')
    })
    await test('assigning a lead to yourself does not notify you', async () => {
      await q('BEGIN')
      try {
        await q(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: rep2.authId, role: 'authenticated' })])
        const before = (await notificationsFor(rep2)).length
        await q(`INSERT INTO public.leads (org_id, name, phone, source, assigned_to) VALUES ($1, 'Walk-in', $2, 'walk_in', $3)`, [org, phone(), rep2.profileId])
        assert.equal((await notificationsFor(rep2)).length, before)
      } finally { await q('ROLLBACK') }
    })
    await test('an unassignable lead in a routed org notifies active managers only', async () => {
      const lead = await one(`INSERT INTO public.leads (org_id, name, phone, source) VALUES ($1, 'No Rule Match', $2, 'website') RETURNING id, assigned_to`, [org, phone()])
      assert.equal(lead.assigned_to, null)
      const recipients = (await many(`SELECT recipient_profile_id FROM public.notifications WHERE lead_id = $1 AND type = 'lead_unassigned'`, [lead.id])).map((r) => r.recipient_profile_id).sort()
      assert.deepEqual(recipients, [owner.profileId, mgr.profileId].sort())
    })
    await test('legacy (rule-less) organisations also notify on auto-assignment', async () => {
      const legacy = await mkOrg('legacy')
      const lr = await mkUser('legacy-rep'); await addMember(legacy, lr, 'sales_exec')
      const lead = await one(`INSERT INTO public.leads (org_id, name, phone, source) VALUES ($1, 'Legacy Buyer', $2, 'website') RETURNING id, assigned_to`, [legacy, phone()])
      assert.equal(lead.assigned_to, lr.profileId)
      assert.equal((await notificationsFor(lr)).length, 1)
    })

    // ---------------------------------------------------------------- RLS
    console.log('\nRLS on the inbox')
    await test('a user reads only their own notifications and can only change read_at', async () => {
      await asUser(rep.authId, async () => {
        const rows = await many(`SELECT recipient_profile_id FROM public.notifications`)
        assert.ok(rows.length >= 1 && rows.every((r) => r.recipient_profile_id === rep.profileId))
        const upd = await q(`UPDATE public.notifications SET read_at = now() WHERE recipient_profile_id = $1`, [rep.profileId])
        assert.ok(upd.rowCount >= 1)
        await expectError(`UPDATE public.notifications SET title = 'forged'`, [], /permission denied/)
        await expectError(`INSERT INTO public.notifications (org_id, recipient_profile_id, type, title, body, dedupe_key) VALUES ($1, $2, 'lead_assigned', 'x', 'y', 'z')`, [org, rep.profileId], /permission denied/)
        const others = await q(`UPDATE public.notifications SET read_at = now() WHERE recipient_profile_id = $1`, [rep2.profileId])
        assert.equal(others.rowCount, 0, "cannot mark someone else's notifications")
      })
    })
    await test('job queue and delivery tables are invisible to clients; queue functions are service-role only', async () => {
      for (const t of ['scheduled_jobs', 'notification_deliveries']) {
        const r = await one(`SELECT has_table_privilege('authenticated', $1, 'SELECT') a, has_table_privilege('anon', $1, 'SELECT') b`, [`public.${t}`])
        assert.deepEqual(r, { a: false, b: false }, t)
      }
      for (const f of ['public.claim_jobs(integer,integer)', 'public.enqueue_job(text,jsonb,uuid,timestamptz,text)', 'public.fail_job(uuid,text)', 'public.complete_job(uuid)', 'public.regrow_invoke_job_worker()']) {
        const r = await one(`SELECT has_function_privilege('authenticated', $1, 'EXECUTE') a, has_function_privilege('anon', $1, 'EXECUTE') b`, [f])
        assert.deepEqual(r, { a: false, b: false }, f)
      }
    })

    // ---------------------------------------------------------------- job queue primitives
    console.log('\njob queue')
    await q(`UPDATE public.scheduled_jobs SET status = 'done' WHERE status IN ('pending', 'running')`) // isolate from earlier fixtures
    await test('enqueue_job is idempotent per dedupe_key', async () => {
      const a = await one(`SELECT public.enqueue_job('test.noop', '{}'::jsonb, NULL, now() + interval '1 hour', $1) id`, [`dedupe-${RUN}`])
      const b = await one(`SELECT public.enqueue_job('test.noop', '{}'::jsonb, NULL, now() + interval '1 hour', $1) id`, [`dedupe-${RUN}`])
      assert.ok(a.id)
      assert.equal(b.id, null)
    })
    await test('two workers claiming concurrently never receive the same job', async () => {
      for (let i = 0; i < 12; i++) await q(`SELECT public.enqueue_job('test.noop', jsonb_build_object('i', ${i}))`)
      const w1 = new Client({ connectionString: DATABASE_URL }); const w2 = new Client({ connectionString: DATABASE_URL })
      await w1.connect(); await w2.connect()
      try {
        const [r1, r2] = await Promise.all([w1.query(`SELECT id FROM public.claim_jobs(8, 60)`), w2.query(`SELECT id FROM public.claim_jobs(8, 60)`)])
        const ids1 = r1.rows.map((r) => r.id); const ids2 = r2.rows.map((r) => r.id)
        assert.equal(ids1.filter((id) => ids2.includes(id)).length, 0, 'no job claimed twice')
        assert.equal(ids1.length + ids2.length, 12)
      } finally { await w1.end(); await w2.end() }
    })
    await test('fail_job retries with backoff, then parks the job as dead', async () => {
      const id = (await one(`INSERT INTO public.scheduled_jobs (kind, max_attempts) VALUES ('test.flaky', 2) RETURNING id`)).id
      await q(`UPDATE public.scheduled_jobs SET status = 'running', attempts = 1 WHERE id = $1`, [id])
      assert.equal((await one(`SELECT public.fail_job($1, 'boom') r`, [id])).r, 'retry')
      const j = await one(`SELECT status, run_at > now() + interval '20 seconds' AS backed_off, last_error FROM public.scheduled_jobs WHERE id = $1`, [id])
      assert.deepEqual(j, { status: 'pending', backed_off: true, last_error: 'boom' })
      await q(`UPDATE public.scheduled_jobs SET status = 'running', attempts = 2 WHERE id = $1`, [id])
      assert.equal((await one(`SELECT public.fail_job($1, 'boom again') r`, [id])).r, 'dead')
    })
    await test('an expired worker lock is reclaimed', async () => {
      await q(`UPDATE public.scheduled_jobs SET status = 'done' WHERE status IN ('pending', 'running')`)
      const id = (await one(`INSERT INTO public.scheduled_jobs (kind, status, attempts, locked_until) VALUES ('test.noop', 'running', 1, now() - interval '1 minute') RETURNING id`)).id
      const claimed = await many(`SELECT id, attempts FROM public.claim_jobs(5, 60)`)
      assert.deepEqual(claimed.map((c) => [c.id, c.attempts]), [[id, 2]])
    })

    // ---------------------------------------------------------------- scheduler
    console.log('\nscheduler (pg_cron → pg_net)')
    await test('pg_cron runs the worker trigger every minute', async () => {
      const job = await one(`SELECT schedule, command, active FROM cron.job WHERE jobname = 'regrow-job-worker'`)
      assert.deepEqual(job, { schedule: '* * * * *', command: 'SELECT public.regrow_invoke_job_worker()', active: true })
    })
    await test('without Vault secrets the trigger is a no-op', async () => {
      await q(`SELECT public.enqueue_job('test.noop', '{}'::jsonb)`)
      assert.equal((await one(`SELECT public.regrow_invoke_job_worker() r`)).r, null)
    })
    await test('with Vault secrets and due work it POSTs to the worker with the bearer secret', async () => {
      await q('BEGIN')
      try {
        await q(`SELECT vault.create_secret('http://127.0.0.1:9/api/jobs/run', 'regrow_job_worker_url')`)
        await q(`SELECT vault.create_secret($1, 'regrow_job_worker_secret')`, ['s'.repeat(40)])
        const r = await one(`SELECT public.regrow_invoke_job_worker() r`)
        assert.ok(r.r, 'returns a pg_net request id')
        const req = await one(`SELECT url, headers->>'Authorization' AS auth FROM net.http_request_queue WHERE id = $1`, [r.r])
        assert.deepEqual(req, { url: 'http://127.0.0.1:9/api/jobs/run', auth: `Bearer ${'s'.repeat(40)}` })
      } finally { await q('ROLLBACK') }
    })

    // ---------------------------------------------------------------- real runner
    console.log('\nworker (real lib/jobs/runner.ts)')
    await q(`UPDATE public.scheduled_jobs SET status = 'done' WHERE status IN ('pending', 'running')`)
    const sent = []
    let failWhatsAppOnce = true
    channels.clearChannelAdapters()
    channels.registerChannelAdapter({ channel: 'push', isConfigured: () => true, deliver: async (n) => { sent.push(['push', n.id]); return { status: 'sent', providerMessageId: `push-${n.id}` } } })
    channels.registerChannelAdapter({
      channel: 'whatsapp', isConfigured: () => true,
      deliver: async (n) => { if (failWhatsAppOnce) { failWhatsAppOnce = false; throw new Error('provider 503') } sent.push(['whatsapp', n.id]); return { status: 'sent' } },
    })
    const lead = await one(`INSERT INTO public.leads (org_id, project_id, name, phone, source) VALUES ($1, $2, 'Runner Buyer', $3, 'google_ads') RETURNING id`, [org, project, phone()])
    const notif = await one(`SELECT id FROM public.notifications WHERE lead_id = $1`, [lead.id])
    await test('a failing channel is retried later without re-sending channels that succeeded', async () => {
      const s1 = await runDueJobs(service)
      assert.deepEqual([s1.claimed, s1.done, s1.retried], [1, 0, 1])
      assert.deepEqual(sent, [['push', notif.id]])
      await q(`UPDATE public.scheduled_jobs SET run_at = now() WHERE payload->>'notification_id' = $1`, [notif.id])
      const s2 = await runDueJobs(service)
      assert.deepEqual([s2.claimed, s2.done], [1, 1])
      assert.deepEqual(sent, [['push', notif.id], ['whatsapp', notif.id]], 'push must not be sent twice')
      const deliveries = await many(`SELECT channel, status FROM public.notification_deliveries WHERE notification_id = $1 ORDER BY channel`, [notif.id])
      assert.deepEqual(deliveries.map((d) => [d.channel, d.status]), [['push', 'sent'], ['whatsapp', 'sent']])
      assert.equal((await runDueJobs(service)).claimed, 0, 'nothing left to do')
    })
    await test('unknown job kinds end up dead instead of looping forever', async () => {
      await q(`INSERT INTO public.scheduled_jobs (kind, max_attempts) VALUES ('test.unknown', 1)`)
      const s = await runDueJobs(service)
      assert.equal(s.dead, 1)
      assert.match((await one(`SELECT last_error FROM public.scheduled_jobs WHERE kind = 'test.unknown'`)).last_error, /no handler registered/)
    })
    channels.clearChannelAdapters()

    // ---------------------------------------------------------------- worker route
    console.log('\nworker endpoint (real app/api/jobs/run/route.ts)')
    const route = await jiti.import(path.join(root, 'app/api/jobs/run/route.ts'))
    const call = (auth) => route.POST(new Request('http://localhost/api/jobs/run', { method: 'POST', headers: auth ? { authorization: auth } : {} }))
    await test('fails closed when JOB_WORKER_SECRET is not configured', async () => {
      delete process.env.JOB_WORKER_SECRET
      assert.equal((await call('Bearer anything')).status, 503)
    })
    await test('rejects missing or wrong bearer tokens; accepts the right one', async () => {
      process.env.JOB_WORKER_SECRET = crypto.randomBytes(24).toString('hex')
      assert.equal((await call(null)).status, 401)
      assert.equal((await call('Bearer wrong-secret')).status, 401)
      const ok = await call(`Bearer ${process.env.JOB_WORKER_SECRET}`)
      assert.equal(ok.status, 200)
      assert.ok('claimed' in (await ok.json()))
    })
  } finally {
    await db.end()
  }

  console.log('\n===================================================================')
  console.log(`ALL ${passed} M1 NOTIFICATIONS & JOB QUEUE TESTS PASSED`)
  console.log('===================================================================')
}

main().catch((err) => {
  console.error('\nTEST SUITE FAILED:', err?.message || err)
  process.exit(1)
})
