// tests/db-integration/m2-follow-ups.test.mjs
// M2 — response clock, nudges, breaches (+ reassignment), call outcomes, follow-up tasks and reminders.
// Real migration 20260041 on the local Supabase stack; outcomes go through the REAL lib/dal/follow-ups.ts.
// Time is controlled by passing p_now to process_lead_responses(), never by sleeping.
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
  const dal = await jiti.import(path.join(root, 'lib/dal/follow-ups.ts'))
  const outcomes = await jiti.import(path.join(root, 'lib/follow-ups/outcomes.ts'))
  const pg = await import('pg')
  const db = new (pg.default || pg).Client({ connectionString: DATABASE_URL })
  await db.connect()
  const q = (sql, p) => db.query(sql, p)
  const one = async (sql, p) => (await q(sql, p)).rows[0]
  const many = async (sql, p) => (await q(sql, p)).rows
  // The per-minute cron job also calls process_lead_responses(); pause it so only this test drives time.
  await q(`SELECT cron.alter_job(jobid, active => false) FROM cron.job WHERE jobname = 'regrow-lead-responses'`)

  let seq = 0
  const phone = () => `96${String(parseInt(RUN, 16) % 10000).padStart(4, '0')}${String(++seq).padStart(4, '0')}`
  const mkUser = async (label) => {
    const id = crypto.randomUUID()
    await q(`INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud)
             VALUES ($1,'00000000-0000-0000-0000-000000000000',$2,'x',now(),'{"provider":"email"}','{}',now(),now(),'authenticated','authenticated')`, [id, `m2-${label}-${RUN}@regrow.test`])
    return { authId: id, profileId: (await one('SELECT id FROM public.profiles WHERE auth_user_id=$1', [id])).id }
  }
  const mkOrg = async (label) => (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,'developer') RETURNING id`, [`M2 ${label} ${RUN}`, `m2-${label}-${RUN}`])).id
  const addMember = (org, u, role) => q(`INSERT INTO public.org_members (org_id, profile_id, role) VALUES ($1,$2,$3)`, [org, u.profileId, role])
  const allDay = (org, extra = {}) => q(`INSERT INTO public.lead_response_settings (org_id, workday_start, workday_end, reassign_on_breach)
                                         VALUES ($1,'00:00','23:59',$2) ON CONFLICT (org_id) DO UPDATE SET workday_start='00:00', workday_end='23:59', reassign_on_breach=$2`,
    [org, extra.reassign ?? false])
  const lead = async (org, assignee, extra = {}) => one(
    `INSERT INTO public.leads (org_id, name, phone, source, status, assigned_to, project_id) VALUES ($1,$2,$3,'meta_ads',$4,$5,$6) RETURNING *`,
    [org, extra.name ?? `Buyer ${seq + 1}`, phone(), extra.status ?? 'new', assignee?.profileId ?? null, extra.project ?? null])
  const getLead = (id) => one('SELECT * FROM public.leads WHERE id=$1', [id])
  const run = async (at) => (await one('SELECT public.process_lead_responses($1) r', [at])).r
  const notes = (u, type) => many(`SELECT * FROM public.notifications WHERE recipient_profile_id=$1 AND type=$2`, [u.profileId, type])
  const plusMin = (ts, m) => new Date(new Date(ts).getTime() + m * 60_000).toISOString()

  console.log('M2 — RESPONSE CLOCK, OUTCOMES & FOLLOW-UPS (migration 20260041)')
  try {
    const org = await mkOrg('a')
    const other = await mkOrg('b')
    const mgr = await mkUser('mgr'); await addMember(org, mgr, 'manager')
    const asha = await mkUser('asha'); await addMember(org, asha, 'sales_exec')
    const ravi = await mkUser('ravi'); await addMember(org, ravi, 'sales_exec')
    const outsider = await mkUser('out'); await addMember(other, outsider, 'sales_exec')
    await allDay(org)

    await test('assigning a new lead starts a 5-minute response clock', async () => {
      const l = await lead(org, asha)
      assert.equal(l.sla_state, 'pending')
      const minutes = (new Date(l.sla_due_at) - new Date(l.assigned_at)) / 60_000
      assert.ok(Math.abs(minutes - 5) < 0.1, `due in ${minutes} min`)
    })
    await test('leads entered past the "new" stage (e.g. historical imports) get no clock', async () => {
      assert.equal((await lead(org, asha, { status: 'qualified' })).sla_state, null)
    })
    await test('bulk-imported leads start no clock and send no alerts; a later reassignment does', async () => {
      const l = await one(`INSERT INTO public.leads (org_id, name, phone, source, assigned_to, custom_fields)
                           VALUES ($1,'Imported',$2,'csv_import',$3,'{"imported_at":"2026-11-01T00:00:00Z"}') RETURNING *`, [org, phone(), asha.profileId])
      assert.equal(l.sla_state, null)
      assert.equal((await notes(asha, 'lead_assigned')).filter((x) => x.lead_id === l.id).length, 0)
      await q(`UPDATE public.leads SET assigned_to=$2 WHERE id=$1`, [l.id, ravi.profileId])
      assert.equal((await getLead(l.id)).sla_state, 'pending')
      assert.equal((await notes(ravi, 'lead_assigned')).filter((x) => x.lead_id === l.id).length, 1)
    })
    await test('outside working hours the clock starts at the next working-day start', async () => {
      await q(`INSERT INTO public.lead_response_settings (org_id, workday_start, workday_end, timezone) VALUES ($1,'09:00','21:00','Asia/Kolkata')`, [other])
      const at = (iso) => one('SELECT public.regrow_response_deadline($1, $2::timestamptz, 5) d', [other, iso])
      assert.equal((await at('2026-11-16T17:00:00Z')).d.toISOString(), '2026-11-17T03:35:00.000Z') // 22:30 IST → 09:05 IST next day
      assert.equal((await at('2026-11-16T01:00:00Z')).d.toISOString(), '2026-11-16T03:35:00.000Z') // 06:30 IST → 09:05 IST
      assert.equal((await at('2026-11-16T06:00:00Z')).d.toISOString(), '2026-11-16T06:05:00.000Z') // 11:30 IST → +5 min
    })
    await test('nudge at 3 minutes: assignee alerted once, push queued', async () => {
      const l = await lead(org, asha, { name: 'Nudge Me' })
      await run(plusMin(l.assigned_at, 1))
      assert.equal((await getLead(l.id)).sla_state, 'pending')
      const r = await run(plusMin(l.assigned_at, 3.1))
      assert.ok(r.nudged >= 1)
      assert.equal((await getLead(l.id)).sla_state, 'nudged')
      const n = (await notes(asha, 'sla_nudge')).filter((x) => x.lead_id === l.id)
      assert.equal(n.length, 1)
      assert.match(n[0].title, /Call Nudge Me now/)
      assert.ok(await one(`SELECT 1 FROM public.scheduled_jobs WHERE dedupe_key = $1`, [`dispatch:${n[0].id}`]))
      await run(plusMin(l.assigned_at, 3.5))
      assert.equal((await notes(asha, 'sla_nudge')).filter((x) => x.lead_id === l.id).length, 1)
    })
    await test('deadline missed: managers alerted (not the assignee), lead marked breached', async () => {
      const l = await lead(org, asha, { name: 'Late Lead' })
      await run(plusMin(l.assigned_at, 5.01))
      assert.equal((await getLead(l.id)).sla_state, 'breached')
      assert.equal((await notes(mgr, 'sla_breach')).filter((x) => x.lead_id === l.id).length, 1)
      assert.equal((await notes(asha, 'sla_breach')).filter((x) => x.lead_id === l.id).length, 0)
      assert.equal((await getLead(l.id)).assigned_to, asha.profileId, 'no reassignment unless enabled')
    })
    await test('a logged call before the deadline stops the clock (met) — no nudge, no breach', async () => {
      const l = await lead(org, asha)
      await q(`INSERT INTO public.lead_activities (lead_id, actor_id, type, metadata) VALUES ($1,$2,'call_logged','{}')`, [l.id, asha.profileId])
      const after = await getLead(l.id)
      assert.equal(after.sla_state, 'met')
      assert.ok(after.first_action_at)
      await run(plusMin(l.assigned_at, 10))
      assert.equal((await getLead(l.id)).sla_state, 'met')
    })
    await test('with reassignment on: missed lead goes to the next team member, clock restarts, decision logged', async () => {
      const team = (await one(`INSERT INTO public.teams (org_id, name) VALUES ($1,'Desk') RETURNING id`, [org])).id
      await q(`INSERT INTO public.team_members (org_id, team_id, profile_id) VALUES ($1,$2,$3),($1,$2,$4)`, [org, team, asha.profileId, ravi.profileId])
      await q(`INSERT INTO public.routing_rules (org_id, name, team_id, priority, sticky_days) VALUES ($1,'All',$2,1,0)`, [org, team])
      await allDay(org, { reassign: true })
      const l = await one(`INSERT INTO public.leads (org_id, name, phone, source) VALUES ($1,'Routed',$2,'website') RETURNING *`, [org, phone()])
      const first = l.assigned_to
      assert.ok([asha.profileId, ravi.profileId].includes(first))
      const r = await run(plusMin(l.assigned_at, 6))
      assert.ok(r.reassigned >= 1)
      const after = await getLead(l.id)
      assert.notEqual(after.assigned_to, first)
      assert.equal(after.sla_state, 'pending')
      assert.ok(new Date(after.sla_due_at) > new Date(l.sla_due_at))
      const d = await one(`SELECT * FROM public.lead_routing_decisions WHERE lead_id=$1 AND outcome='sla_reassigned'`, [l.id])
      assert.equal(d.assigned_to, after.assigned_to)
      assert.equal(d.detail.previous_assignee, first)
      const newOwner = after.assigned_to === asha.profileId ? asha : ravi
      assert.ok((await notes(newOwner, 'lead_assigned')).some((x) => x.lead_id === l.id && /reassigned/i.test(x.title)))
      await allDay(org, { reassign: false })
      await q(`UPDATE public.routing_rules SET is_active=false WHERE org_id=$1`, [org])
    })

    const ctx = (l, actor) => ({ orgId: org, leadId: l.id, actorId: actor.profileId, status: l.status })
    await test('outcome rules: non-terminal outcomes need a follow-up; funnel never moves backwards', async () => {
      for (const o of outcomes.OUTCOMES) assert.equal(typeof outcomes.OUTCOME_RULES[o].requiresFollowUp, 'boolean')
      assert.equal(outcomes.nextStatus('new', 'no_answer'), 'contacted')
      assert.equal(outcomes.nextStatus('site_visited', 'call_back'), 'site_visited')
      assert.equal(outcomes.nextStatus('qualified', 'not_interested'), 'lost')
      assert.equal(outcomes.nextStatus('lost', 'interested'), 'qualified')
    })
    let taskLead
    await test('"No answer" via the DAL: call logged, status contacted, follow-up task + next_follow_up_at, clock met', async () => {
      taskLead = await lead(org, asha, { name: 'Follow Me' })
      const due = new Date(Date.now() + 2 * 3600_000).toISOString()
      const r = await dal.logOutcome(ctx(taskLead, asha), { outcome: 'no_answer', followUpAt: due, note: 'Rang twice' })
      assert.equal(r.success, true, r.error)
      const l = await getLead(taskLead.id)
      assert.deepEqual([l.status, l.sla_state], ['contacted', 'met'])
      assert.equal(new Date(l.next_follow_up_at).toISOString(), due)
      const t = await one(`SELECT * FROM public.lead_tasks WHERE lead_id=$1`, [taskLead.id])
      assert.deepEqual([t.assigned_to, t.kind, t.status], [asha.profileId, 'call', 'open'])
      const acts = (await many(`SELECT type FROM public.lead_activities WHERE lead_id=$1 ORDER BY created_at`, [taskLead.id])).map((a) => a.type)
      assert.deepEqual(acts, ['call_logged', 'status_changed', 'follow_up_scheduled'])
    })
    await test('reminder 15 min before due, then overdue alert — each exactly once', async () => {
      const t = await one(`SELECT * FROM public.lead_tasks WHERE lead_id=$1 AND status='open'`, [taskLead.id])
      await run(plusMin(t.due_at, -20))
      assert.equal((await notes(asha, 'follow_up_due')).filter((x) => x.lead_id === taskLead.id).length, 0)
      await run(plusMin(t.due_at, -14))
      await run(plusMin(t.due_at, -10))
      assert.equal((await notes(asha, 'follow_up_due')).filter((x) => x.lead_id === taskLead.id).length, 1)
      await run(plusMin(t.due_at, 16))
      await run(plusMin(t.due_at, 30))
      assert.equal((await notes(asha, 'follow_up_overdue')).filter((x) => x.lead_id === taskLead.id).length, 1)
    })
    await test('reassigning the lead moves its open follow-ups to the new owner', async () => {
      await q(`UPDATE public.leads SET assigned_to=$2 WHERE id=$1`, [taskLead.id, ravi.profileId])
      const t = await one(`SELECT assigned_to FROM public.lead_tasks WHERE lead_id=$1 AND status='open'`, [taskLead.id])
      assert.equal(t.assigned_to, ravi.profileId)
    })
    await test('"Interested" closes the follow-up it fulfilled and schedules the next one', async () => {
      const l = await getLead(taskLead.id)
      const next = new Date(Date.now() + 26 * 3600_000).toISOString()
      const r = await dal.logOutcome({ orgId: org, leadId: l.id, actorId: ravi.profileId, status: l.status }, { outcome: 'interested', followUpAt: next })
      assert.equal(r.success, true, r.error)
      const tasks = await many(`SELECT status, due_at FROM public.lead_tasks WHERE lead_id=$1 ORDER BY created_at`, [l.id])
      assert.deepEqual(tasks.map((t) => t.status), ['done', 'open'])
      const after = await getLead(l.id)
      assert.equal(after.status, 'qualified')
      assert.equal(new Date(after.next_follow_up_at).toISOString(), next)
    })
    await test('a terminal outcome cancels every open follow-up', async () => {
      const l = await getLead(taskLead.id)
      const r = await dal.logOutcome({ orgId: org, leadId: l.id, actorId: ravi.profileId, status: l.status }, { outcome: 'not_interested' })
      assert.equal(r.success, true, r.error)
      const after = await getLead(l.id)
      assert.deepEqual([after.status, after.next_follow_up_at], ['lost', null])
      assert.equal((await one(`SELECT count(*)::int n FROM public.lead_tasks WHERE lead_id=$1 AND status='open'`, [l.id])).n, 0)
    })
    await test('a tap on WhatsApp counts as the first action', async () => {
      const l = await lead(org, asha)
      const r = await dal.logContactAttempt(ctx(l, asha), 'whatsapp')
      assert.equal(r.success, true, r.error)
      assert.equal((await getLead(l.id)).sla_state, 'met')
    })
    await test('tasks cannot point at another organisation’s lead or a non-member', async () => {
      const l = await lead(org, asha)
      await assert.rejects(q(`INSERT INTO public.lead_tasks (org_id, lead_id, due_at) VALUES ($1,$2,now())`, [other, l.id]), /lead_task_integrity/)
      await assert.rejects(q(`INSERT INTO public.lead_tasks (org_id, lead_id, assigned_to, due_at) VALUES ($1,$2,$3,now())`, [org, l.id, outsider.profileId]), /lead_task_integrity/)
    })
    await test('RLS: a sales exec reads only their own tasks; the manager reads all; clients cannot write', async () => {
      const l = await lead(org, asha)
      await q(`INSERT INTO public.lead_tasks (org_id, lead_id, assigned_to, due_at) VALUES ($1,$2,$3,now()+interval '1 day')`, [org, l.id, asha.profileId])
      const visible = async (u) => {
        await q('BEGIN')
        try {
          await q(`SELECT set_config('request.jwt.claims',$1,true)`, [JSON.stringify({ sub: u.authId, role: 'authenticated' })])
          await q('SET LOCAL ROLE authenticated')
          const rows = await many(`SELECT assigned_to FROM public.lead_tasks WHERE org_id=$1`, [org])
          await assert.rejects(q(`INSERT INTO public.lead_tasks (org_id, lead_id, due_at) VALUES ($1,$2,now())`, [org, l.id]), /permission denied/)
          return rows
        } finally { await q('ROLLBACK') }
      }
      const forRavi = await visible(ravi)
      assert.ok(forRavi.every((r) => r.assigned_to === ravi.profileId))
      const forMgr = await visible(mgr)
      assert.ok(forMgr.some((r) => r.assigned_to === asha.profileId) && forMgr.some((r) => r.assigned_to === ravi.profileId))
      assert.equal((await visible(outsider)).length, 0)
    })
    await test('My day lists: waiting / overdue / today, scoped to the salesperson', async () => {
      const w = await lead(org, asha, { name: 'Waiting One' })
      const day = await dal.getMyDay(org, asha.profileId)
      assert.ok(day.waiting.some((x) => x.id === w.id))
      assert.ok(day.waiting.every((x) => x.assignee?.id === asha.profileId))
      const team = await dal.getMyDay(org, null)
      assert.ok(team.waiting.length >= day.waiting.length)
    })
  } finally {
    await q(`SELECT cron.alter_job(jobid, active => true) FROM cron.job WHERE jobname = 'regrow-lead-responses'`)
    await db.end()
  }
  console.log(`\nALL ${passed} M2 FOLLOW-UP & RESPONSE CLOCK TESTS PASSED`)
}
main().catch((err) => { console.error('\nTEST SUITE FAILED:', err?.message || err); process.exit(1) })
