// tests/db-integration/p35-notification-rules.test.mjs — alert choices and the weekly digest (migration 20260076)
// against the local Supabase stack: own choices only, push held back by choice / team default / quiet hours while
// the inbox row stays, and the Monday digest to managers only, once a week, honouring opt-outs.
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
  process.env.NEXT_PUBLIC_APP_URL ||= 'http://localhost:3000'
  const jiti = createJiti(import.meta.url, { alias: { '@': root } })
  const { JOB_HANDLERS } = await jiti.import(path.join(root, 'lib/jobs/handlers.ts'))
  const channels = await jiti.import(path.join(root, 'lib/notifications/channels.ts'))
  const { weeklyDigest } = await jiti.import(path.join(root, 'lib/jobs/weekly-digest.ts'))
  const { MockEmailAdapter, setEmailAdapterForTesting } = await jiti.import(path.join(root, 'lib/email/adapter.ts'))
  const { createServiceClient } = await jiti.import(path.join(root, 'lib/supabase/server.ts'))
  const service = createServiceClient()
  const mail = new MockEmailAdapter(); setEmailAdapterForTesting(mail)
  const pg = await import('pg')
  const sql = new (pg.default || pg).Client({ connectionString: DATABASE_URL }); await sql.connect()
  const one = async (s, p) => (await sql.query(s, p)).rows[0]
  const mkUser = async (label) => {
    const { data, error } = await service.auth.admin.createUser({ email: `${label}-${RUN}@regrow-mail-check.com`, password: 'Notify-Test-' + RUN + 'x9!', email_confirm: true, user_metadata: { full_name: `${label} ${RUN}` } })
    if (error) throw error
    return { id: data.user.id, email: data.user.email, profile: (await one('SELECT id FROM public.profiles WHERE auth_user_id=$1', [data.user.id])).id }
  }

  // A stand-in push channel that records what it was asked to deliver.
  const pushed = []
  channels.clearChannelAdapters()
  channels.registerChannelAdapter({ channel: 'push', isConfigured: () => true, deliver: async (n) => { pushed.push(n.id); return { status: 'sent', providerMessageId: 'test' } } })
  const dispatch = (id) => JOB_HANDLERS['notification.dispatch']({ id: crypto.randomUUID(), kind: 'notification.dispatch', payload: { notification_id: id }, attempts: 0, org_id: null }, service)

  console.log('P35 — NOTIFICATION RULES AND WEEKLY DIGEST')
  const owner = await mkUser('owner'); const manager = await mkUser('manager'); const sales = await mkUser('sales'); const optout = await mkUser('optout')
  const name = `Notify Co ${RUN}`
  const org = (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,'developer') RETURNING id`, [name, `notify-co-${RUN}`])).id
  await sql.query(`INSERT INTO public.org_members (org_id, profile_id, role, status) VALUES ($1,$2,'owner','active'),($1,$3,'manager','active'),($1,$4,'sales_exec','active'),($1,$5,'admin','active')`,
    [org, owner.profile, manager.profile, sales.profile, optout.profile])
  const notify = async (recipient, type) => (await one(`SELECT public.regrow_notify($1,$2,$3,'t','b',NULL,$4) id`, [org, recipient, type, `${type}:${crypto.randomUUID()}`])).id
  const delivery = async (id) => one(`SELECT status, detail FROM public.notification_deliveries WHERE notification_id=$1 AND channel='push'`, [id])

  await test('each person changes only their own alert choices', async () => {
    await sql.query('BEGIN')
    await sql.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: sales.id, role: 'authenticated' })]); await sql.query('SET LOCAL ROLE authenticated')
    await sql.query(`UPDATE public.profiles SET notification_prefs = '{"push":{"follow_up_due":false},"quiet":{"enabled":false,"start":"21:00","end":"08:00","allowUrgent":true}}' WHERE auth_user_id = $1`, [sales.id])
    const other = await sql.query(`UPDATE public.profiles SET notification_prefs = '{}', email_weekly_digest = false WHERE auth_user_id = $1`, [owner.id])
    assert.equal(other.rowCount, 0)
    await sql.query('COMMIT')
    assert.equal((await one('SELECT notification_prefs->\'push\'->>\'follow_up_due\' v FROM public.profiles WHERE id=$1', [sales.profile])).v, 'false')
    await assert.rejects(sql.query(`UPDATE public.profiles SET notification_prefs = '[]' WHERE id=$1`, [sales.profile]), /check/i)
  })

  await test('a muted alert still reaches the inbox, but not the phone; the delivery records why', async () => {
    const muted = await notify(sales.profile, 'follow_up_due'); await dispatch(muted)
    assert.equal(pushed.includes(muted), false)
    assert.deepEqual(await delivery(muted), { status: 'skipped', detail: 'turned off by recipient' })
    assert.ok(await one('SELECT id FROM public.notifications WHERE id=$1', [muted]), 'inbox row kept')
    const other = await notify(sales.profile, 'lead_assigned'); await dispatch(other)
    assert.equal(pushed.includes(other), true)
  })

  await test('a team default applies to people who have not chosen; their own choice wins', async () => {
    await sql.query(`INSERT INTO public.org_settings (org_id, notifications) VALUES ($1, '{"push":{"document_viewed":false}}')
      ON CONFLICT (org_id) DO UPDATE SET notifications = EXCLUDED.notifications`, [org])
    const a = await notify(manager.profile, 'document_viewed'); await dispatch(a)
    assert.deepEqual(await delivery(a), { status: 'skipped', detail: 'turned off for the team' })
    await sql.query(`UPDATE public.profiles SET notification_prefs = '{"push":{"document_viewed":true}}' WHERE id=$1`, [manager.profile])
    const b = await notify(manager.profile, 'document_viewed'); await dispatch(b)
    assert.equal(pushed.includes(b), true)
  })

  await test('quiet hours hold back routine alerts but let urgent ones through', async () => {
    // A window covering every minute except one: whenever the test runs, now is inside it.
    const ist = new Date(Date.now() + 330 * 60_000)
    const hhmm = (d) => `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
    const q = { enabled: true, start: hhmm(new Date(ist.getTime() - 5 * 60_000)), end: hhmm(new Date(ist.getTime() + 10 * 60_000)), allowUrgent: true }
    await sql.query(`UPDATE public.profiles SET notification_prefs = $2 WHERE id=$1`, [owner.profile, JSON.stringify({ push: {}, quiet: q })])
    const routine = await notify(owner.profile, 'follow_up_overdue'); await dispatch(routine)
    assert.deepEqual(await delivery(routine), { status: 'skipped', detail: 'quiet hours' })
    const urgent = await notify(owner.profile, 'sla_breach'); await dispatch(urgent)
    assert.equal(pushed.includes(urgent), true)
  })

  await test('Monday digest: owners, admins and managers only, honouring opt-outs, once per week', async () => {
    await sql.query(`UPDATE public.profiles SET email_weekly_digest = false WHERE id=$1`, [optout.profile])
    const monday = Date.now() // the window is "the 7 days before today", whichever day the test runs
    const lead = (await one(`INSERT INTO public.leads (org_id, name, phone, source, status, assigned_to, created_at) VALUES ($1,'Arjun','9000000301','website','qualified',$2, now() - interval '3 days') RETURNING id`, [org, sales.profile])).id
    await sql.query(`INSERT INTO public.lead_activities (lead_id, actor_id, type, metadata, created_at) VALUES ($1,$2,'status_changed','{"from":"qualified","to":"lost","reason":"Bought elsewhere"}', now() - interval '2 days')`, [lead, sales.profile])
    mail.clear(); await weeklyDigest({}, service, monday)
    const got = mail.sentEmails.filter((e) => e.subject.includes(`${name} last week`))
    assert.deepEqual(got.map((e) => e.to).sort(), [manager.email, owner.email].sort())
    assert.match(got[0].text, /Bought elsewhere: 1/)
    assert.doesNotMatch(got[0].text, /9000000301/, 'no phone numbers')
    mail.clear(); await weeklyDigest({}, service, monday)
    assert.equal(mail.sentEmails.filter((e) => e.subject.includes(`${name} last week`)).length, 0, 'once per week')
    const cat = await one(`SELECT category FROM public.email_outbox WHERE idempotency_key LIKE $1 LIMIT 1`, [`weekly:${org}:%`])
    assert.equal(cat.category, 'report')
  })

  channels.clearChannelAdapters()
  await sql.end()
  console.log(`\nP35 notification rules: ${passed} checks passed.`)
}
main().catch((e) => { console.error(e); process.exit(1) })
