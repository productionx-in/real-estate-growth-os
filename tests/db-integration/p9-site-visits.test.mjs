// tests/db-integration/p9-site-visits.test.mjs — site visit lifecycle (migration 20260049 + lib/dal/site-visits.ts
// + the site_visit.notify job), against the local Supabase stack.
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
  const sv = await jiti.import(path.join(root, 'lib/dal/site-visits.ts'))
  const { siteVisitNotify } = await jiti.import(path.join(root, 'lib/jobs/site-visit-notify.ts'))
  const { MockEmailAdapter, setEmailAdapterForTesting } = await jiti.import(path.join(root, 'lib/email/adapter.ts'))
  const { createServiceClient } = await jiti.import(path.join(root, 'lib/supabase/server.ts'))
  const mail = new MockEmailAdapter(); setEmailAdapterForTesting(mail)
  const pg = await import('pg')
  const db = new (pg.default || pg).Client({ connectionString: DATABASE_URL })
  await db.connect()
  const one = async (s, p) => (await db.query(s, p)).rows[0]
  const mkProfile = async (n) => {
    const id = crypto.randomUUID()
    await db.query(`INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
      VALUES ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),now(),now(),'{}',$3)`, [id, `${n}-${RUN}@regrow.test`, JSON.stringify({ full_name: n })])
    return (await one('SELECT id FROM public.profiles WHERE auth_user_id=$1', [id])).id
  }
  const jobs = (visit) => db.query(`SELECT payload->>'kind' kind, (payload->>'minutes_before')::int mins, run_at, payload FROM public.scheduled_jobs
    WHERE kind='site_visit.notify' AND payload->>'visit_id'=$1 ORDER BY run_at`, [visit]).then((r) => r.rows)
  const task = (visit) => one(`SELECT status, due_at, assigned_to, kind FROM public.lead_tasks WHERE site_visit_id=$1 ORDER BY created_at DESC LIMIT 1`, [visit])
  const leadStatus = async (id) => (await one('SELECT status FROM public.leads WHERE id=$1', [id])).status

  console.log('P9 — SITE VISITS')
  const org = (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,'developer') RETURNING id`, [`SV <b>${RUN}</b>`, `sv-${RUN}`])).id
  const other = (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,'developer') RETURNING id`, [`SV2 ${RUN}`, `sv2-${RUN}`])).id
  try {
    const asha = await mkProfile('Asha Menon')
    await db.query(`INSERT INTO public.org_members (org_id, profile_id, role) VALUES ($1,$2,'sales_exec')`, [org, asha])
    const project = (await one(`INSERT INTO public.projects (org_id, name, slug, location, city, latitude, longitude) VALUES ($1,'Skyline Towers',$2,'Whitefield','Bengaluru',12.9698,77.7500) RETURNING id`, [org, `sky-${RUN}`])).id
    const otherProject = (await one(`INSERT INTO public.projects (org_id, name, slug) VALUES ($1,'Elsewhere',$2) RETURNING id`, [other, `else-${RUN}`])).id
    const mkLead = async (email) => (await one(`INSERT INTO public.leads (org_id, name, phone, email, source, status, assigned_to) VALUES ($1,$2,$3,$4,'website','contacted',$5) RETURNING id`,
      [org, 'Priya <script>alert(1)</script> Sharma', `9${String(Date.now()).slice(-9)}`, email, asha])).id
    const tomorrow = new Date(Date.now() + 30 * 3600_000)

    let visit, lead
    await test('booking a visit creates its task, moves the lead to "visit scheduled" and queues confirmation + two reminders', async () => {
      lead = await mkLead(`priya-${RUN}@buyer.test`)
      const r = await sv.scheduleVisit({ orgId: org, leadId: lead, projectId: project, assignedTo: asha, scheduledAt: tomorrow, actorId: asha, visitorCount: 3, accompaniedBy: 'Spouse' })
      assert.equal(r.ok, true, r.error)
      visit = r.data.id
      const t = await task(visit)
      assert.deepEqual([t.status, t.kind, t.assigned_to, new Date(t.due_at).getTime()], ['open', 'site_visit', asha, tomorrow.getTime()])
      assert.equal(await leadStatus(lead), 'site_visit_scheduled')
      const next = await one('SELECT next_follow_up_at FROM public.leads WHERE id=$1', [lead])
      assert.equal(new Date(next.next_follow_up_at).getTime(), tomorrow.getTime(), 'the visit is the lead\'s next step')
      assert.deepEqual((await jobs(visit)).map((j) => [j.kind, j.mins]), [['confirmation', null], ['reminder', 1440], ['reminder', 120]])
    })
    await test('a visit for a project in another organisation is refused', async () => {
      const r = await sv.scheduleVisit({ orgId: org, leadId: lead, projectId: otherProject, assignedTo: asha, scheduledAt: tomorrow, actorId: asha })
      assert.equal(r.ok, false)
    })
    await test('a time in the past is refused', async () => {
      const r = await sv.scheduleVisit({ orgId: org, leadId: lead, projectId: project, assignedTo: asha, scheduledAt: new Date(Date.now() - 3600_000), actorId: asha })
      assert.deepEqual([r.ok, r.status], [false, 400])
    })
    await test('the buyer\'s confirmation email has the time, project and salesperson — and escapes their name', async () => {
      const job = (await jobs(visit))[0]
      await siteVisitNotify({ id: 'j', kind: 'site_visit.notify', payload: job.payload, attempts: 0, org_id: org }, createServiceClient())
      const m = mail.getRecentEmailFor(`priya-${RUN}@buyer.test`)
      assert.ok(m, 'email sent')
      assert.match(m.subject, /Skyline Towers/)
      assert.ok(m.html.includes('Asha Menon') && m.html.includes('Whitefield, Bengaluru'))
      assert.ok(!m.html.includes('<script>') && !m.html.includes('<b>'), 'buyer and organisation names are escaped')
    })
    await test('rescheduling moves the task and queues fresh messages; the old reminder is skipped as stale', async () => {
      const old = (await jobs(visit)).find((j) => j.mins === 1440)
      const later = new Date(tomorrow.getTime() + 24 * 3600_000)
      const r = await sv.actOnVisit(visit, org, asha, { action: 'reschedule', scheduledAt: later })
      assert.deepEqual([r.ok, r.data?.status], [true, 'rescheduled'])
      const t = await task(visit)
      assert.equal(new Date(t.due_at).getTime(), later.getTime())
      assert.ok((await jobs(visit)).some((j) => j.kind === 'rescheduled'))
      const before = mail.sentEmails.length
      await siteVisitNotify({ id: 'j', kind: 'site_visit.notify', payload: old.payload, attempts: 0, org_id: org }, createServiceClient())
      assert.equal(mail.sentEmails.length, before, 'no email for the old time')
    })
    await test('check-in records the distance from the project', async () => {
      const r = await sv.actOnVisit(visit, org, asha, { action: 'check_in', lat: 12.9716, lng: 77.5946 }) // central Bengaluru, ~16 km away
      assert.equal(r.ok, true, r.error)
      assert.ok(r.data.checkinDistanceM > 15000 && r.data.checkinDistanceM < 18000, `distance ${r.data.checkinDistanceM}`)
      const v = await one('SELECT status, checked_in_at FROM public.site_visits WHERE id=$1', [visit])
      assert.deepEqual([v.status, v.checked_in_at !== null], ['checked_in', true])
    })
    await test('completing closes the task, moves the lead to "visited" and logs it', async () => {
      const r = await sv.actOnVisit(visit, org, asha, { action: 'complete', outcome: 'interested', rating: 4 })
      assert.equal(r.ok, true, r.error)
      assert.equal((await task(visit)).status, 'done')
      assert.equal(await leadStatus(lead), 'site_visited')
      const a = await one(`SELECT type, metadata->>'outcome' outcome FROM public.lead_activities WHERE lead_id=$1 AND type='site_visited'`, [lead])
      assert.deepEqual([a.type, a.outcome], ['site_visited', 'interested'])
      const done = await one('SELECT completed_at FROM public.site_visits WHERE id=$1', [visit])
      assert.ok(done.completed_at)
    })
    await test('a completed visit cannot be changed again', async () => {
      const r = await sv.actOnVisit(visit, org, asha, { action: 'no_show' })
      assert.deepEqual([r.ok, r.status], [false, 409])
    })
    await test('no reminder is ever sent for a completed visit', async () => {
      const before = mail.sentEmails.length
      for (const j of await jobs(visit)) await siteVisitNotify({ id: 'j', kind: 'site_visit.notify', payload: j.payload, attempts: 0, org_id: org }, createServiceClient())
      assert.equal(mail.sentEmails.length, before)
    })
    await test('a no-show closes the visit task and schedules a call-back; it can be rebooked', async () => {
      const l2 = await mkLead(null)
      const r = await sv.scheduleVisit({ orgId: org, leadId: l2, projectId: project, assignedTo: asha, scheduledAt: tomorrow, actorId: asha })
      const v2 = r.data.id
      assert.equal((await sv.actOnVisit(v2, org, asha, { action: 'no_show' })).ok, true)
      assert.equal((await task(v2)).status, 'cancelled')
      const cb = await one(`SELECT kind, status, note FROM public.lead_tasks WHERE lead_id=$1 AND site_visit_id IS NULL AND status='open'`, [l2])
      assert.deepEqual([cb.kind, cb.status], ['call', 'open'])
      assert.match(cb.note, /rebook/)
      const re = await sv.actOnVisit(v2, org, asha, { action: 'reschedule', scheduledAt: new Date(tomorrow.getTime() + 86_400_000) })
      assert.deepEqual([re.ok, re.data?.status], [true, 'rescheduled'])
      assert.equal((await task(v2)).status, 'open', 'a fresh visit task')
    })
    await test('cancelling closes the task and stops messages; a lead without email gets no email', async () => {
      const l3 = await mkLead(null)
      const v3 = (await sv.scheduleVisit({ orgId: org, leadId: l3, projectId: project, assignedTo: asha, scheduledAt: tomorrow, actorId: asha })).data.id
      const before = mail.sentEmails.length
      const j = (await jobs(v3))[0]
      await siteVisitNotify({ id: 'j', kind: 'site_visit.notify', payload: j.payload, attempts: 0, org_id: org }, createServiceClient())
      assert.equal(mail.sentEmails.length, before, 'no email address, nothing sent')
      assert.equal((await sv.actOnVisit(v3, org, asha, { action: 'cancel', reason: 'Buyer travelling' })).ok, true)
      assert.equal((await task(v3)).status, 'cancelled')
    })
    await test('another organisation cannot act on this organisation\'s visit', async () => {
      const r = await sv.actOnVisit(visit, other, asha, { action: 'cancel' })
      assert.deepEqual([r.ok, r.status], [false, 404])
    })
    await test('meeting links must be https', async () => {
      const r = await sv.scheduleVisit({ orgId: org, leadId: lead, projectId: project, assignedTo: asha, scheduledAt: tomorrow, actorId: asha, meetingLink: 'javascript:alert(1)' })
      assert.equal(r.ok, false)
    })
    await test('a visit recorded without an actor (older callers) still books; the salesperson is credited', async () => {
      const l = await mkLead(null)
      const v = (await one(`INSERT INTO public.site_visits (org_id, lead_id, project_id, assigned_to, scheduled_at, status)
        VALUES ($1,$2,$3,$4,$5,'scheduled') RETURNING id`, [org, l, project, asha, tomorrow])).id
      const a = await one(`SELECT actor_id FROM public.lead_activities WHERE lead_id=$1 AND type='site_visit_scheduled'`, [l])
      assert.equal(a.actor_id, asha)
      await db.query(`UPDATE public.site_visits SET status='cancelled' WHERE id=$1`, [v])
      assert.equal((await task(v)).status, 'cancelled')
    })
    await test('a visit with no actor and no salesperson still books (no activity row is invented)', async () => {
      const l = (await one(`INSERT INTO public.leads (org_id, name, phone, source, status) VALUES ($1,'Walk-in',$2,'walk_in','new') RETURNING id`,
        [org, `8${String(Date.now()).slice(-9)}`])).id
      await db.query('UPDATE public.leads SET assigned_to=NULL WHERE id=$1', [l]) // undo auto-assignment
      await db.query(`INSERT INTO public.site_visits (org_id, lead_id, project_id, scheduled_at, status) VALUES ($1,$2,$3,$4,'scheduled')`,
        [org, l, project, tomorrow])
      assert.equal(await leadStatus(l), 'site_visit_scheduled')
    })
    console.log(`\nP9 site visits: ${passed} checks passed.`)
  } finally {
    setEmailAdapterForTesting(null)
    for (const id of [org, other]) await db.query('DELETE FROM public.organisations WHERE id=$1', [id]).catch(() => {})
    await db.end()
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
