// tests/db-integration/p52-lead-alerts.test.mjs — lead alerts (20260093) against the local Supabase stack. Time is
// driven by passing p_now to process_lead_responses(), never by sleeping.
//   * A new lead from any source: its owner's alert is marked "new lead"; owners/admins/managers hear who has it, or that
//     nobody does — in every workspace. No buyer phone or e-mail in any alert. Each alert is queued for push once.
//   * "Not contacted yet": every 10 minutes (or the workspace's own interval) until someone acts, at most 24 hours; one
//     unread reminder per lead; stops on contact; on reassignment the old owner's stop and the new owner's start.
//   * Follow-ups: 5 minutes before (or the workspace's own lead time); a reschedule is reminded again, a cancelled one not.
//   * Every switch works; imported leads never nag; the bookkeeping table is closed to signed-in users.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const RUN = crypto.randomBytes(4).toString('hex')
let passed = 0
async function test(name, fn) { try { await fn(); passed++; console.log(`  ✓ ${name}`) } catch (e) { console.error(`  ✗ ${name}`); throw e } }

async function main() {
  const pg = await import('pg')
  const db = new (pg.default || pg).Client({ connectionString: DATABASE_URL }); await db.connect()
  const q = (s, p) => db.query(s, p)
  const one = async (s, p) => (await q(s, p)).rows[0]
  const many = async (s, p) => (await q(s, p)).rows
  // The per-minute cron job also runs the alerts; pause it so only this test drives time.
  await q(`SELECT cron.alter_job(jobid, active => false) FROM cron.job WHERE jobname = 'regrow-lead-responses'`)

  let seq = 0
  const phone = () => `97${String(parseInt(RUN, 16) % 10000).padStart(4, '0')}${String(++seq).padStart(4, '0')}`
  const orgs = []
  const mkOrg = async (label) => { const id = (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,'developer') RETURNING id`, [`P52 ${label} ${RUN}`, `p52-${label}-${RUN}`])).id; orgs.push(id); return id }
  const mkUser = async (org, label, role) => {
    const id = crypto.randomUUID()
    await q(`INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud)
             VALUES ($1,'00000000-0000-0000-0000-000000000000',$2,'x',now(),'{"provider":"email"}',$3,now(),now(),'authenticated','authenticated')`,
      [id, `p52-${label}-${RUN}@repx.test`, JSON.stringify({ full_name: label })])
    const profileId = (await one('SELECT id FROM public.profiles WHERE auth_user_id=$1', [id])).id
    await q(`UPDATE public.profiles SET full_name=$2 WHERE id=$1`, [profileId, label])
    await q(`INSERT INTO public.org_members (org_id, profile_id, role) VALUES ($1,$2,$3)`, [org, profileId, role])
    return { authId: id, profileId }
  }
  const alerts = (org, a) => q(`INSERT INTO public.org_settings (org_id, alerts) VALUES ($1,$2) ON CONFLICT (org_id) DO UPDATE SET alerts = EXCLUDED.alerts`, [org, JSON.stringify(a)])
  const lead = async (org, assignee, extra = {}) => one(
    `INSERT INTO public.leads (org_id, name, phone, email, source, status, assigned_to, custom_fields) VALUES ($1,$2,$3,$4,'meta_ads','new',$5,$6) RETURNING *`,
    [org, extra.name ?? `Buyer ${seq + 1}`, phone(), `buyer${seq}@example.test`, assignee?.profileId ?? null, JSON.stringify(extra.custom ?? {})])
  const run = async (at) => (await one('SELECT public.process_lead_responses($1) r', [at])).r
  // One second past the mark: database times carry microseconds that a JavaScript date drops.
  const at = (ts, min) => new Date(new Date(ts).getTime() + min * 60_000 + 1000).toISOString()
  const notes = (u, type, leadId) => many(`SELECT * FROM public.notifications WHERE recipient_profile_id=$1 AND type=$2 AND lead_id=$3 ORDER BY created_at`, [u.profileId, type, leadId])

  console.log('P52 — LEAD ALERTS')
  try {
    const org = await mkOrg('a')
    const owner = await mkUser(org, 'Owner', 'owner'), mgr = await mkUser(org, 'Meera', 'manager')
    const asha = await mkUser(org, 'Asha', 'sales_exec'), ravi = await mkUser(org, 'Ravi', 'sales_exec')

    await test('a new lead: its owner’s alert is a "new lead", managers hear who has it, nothing private in the text', async () => {
      const l = await lead(org, asha, { name: 'Kiran Shah' })
      const [mine] = await notes(asha, 'lead_assigned', l.id)
      assert.equal(mine.title, 'New lead: Kiran Shah')
      assert.equal(mine.data.event, 'new_lead')
      for (const m of [owner, mgr]) {
        const [n] = await notes(m, 'lead_new', l.id)
        assert.ok(n, 'every manager is told')
        assert.match(n.body, /meta ads · Assigned to Asha$/)
      }
      assert.equal((await notes(asha, 'lead_new', l.id)).length, 0, 'the owner is not told twice')
      const all = await many(`SELECT n.*, (SELECT count(*) FROM public.scheduled_jobs j WHERE j.payload->>'notification_id' = n.id::text) jobs FROM public.notifications n WHERE lead_id=$1`, [l.id])
      for (const n of all) {
        const text = `${n.title} ${n.body} ${JSON.stringify(n.data)}`
        assert.ok(!text.includes(l.phone) && !text.includes(l.email), 'no phone or e-mail in an alert')
        assert.equal(Number(n.jobs), 1, 'queued for push exactly once')
      }
    })

    await test('a lead the routing rules gave to nobody: owners, admins and managers are told', async () => {
      const team = (await one(`INSERT INTO public.teams (org_id, name) VALUES ($1,'Desk') RETURNING id`, [org])).id
      const project = (await one(`INSERT INTO public.projects (org_id, name, slug) VALUES ($1,'Elsewhere',$2) RETURNING id`, [org, `p52-p-${RUN}`])).id
      const rule = (await one(`INSERT INTO public.routing_rules (org_id, name, team_id, match_project_ids, sticky_days) VALUES ($1,'Only Elsewhere',$2,$3,0) RETURNING id`, [org, team, [project]])).id
      const l = await lead(org, null, { name: 'Walk In' })
      await q('DELETE FROM public.routing_rules WHERE id=$1', [rule])
      assert.equal(l.assigned_to, null)
      const to = (await many(`SELECT recipient_profile_id r, data FROM public.notifications WHERE lead_id=$1 AND type='lead_unassigned'`, [l.id]))
      assert.deepEqual(to.map((x) => x.r).sort(), [owner.profileId, mgr.profileId].sort())
      assert.ok(to.every((x) => x.data.event === 'new_lead'))
    })

    await test('"not contacted yet": every 10 minutes, one unread at a time, until someone calls', async () => {
      const l = await lead(org, asha)
      await run(at(l.assigned_at, 9))
      assert.equal((await notes(asha, 'lead_uncontacted', l.id)).length, 0)
      await run(at(l.assigned_at, 10))
      await run(at(l.assigned_at, 15))
      assert.equal((await notes(asha, 'lead_uncontacted', l.id)).length, 1)
      await run(at(l.assigned_at, 20))
      const two = await notes(asha, 'lead_uncontacted', l.id)
      assert.equal(two.length, 2)
      assert.deepEqual(two.map((n) => !!n.read_at), [true, false], 'the earlier reminder is superseded')
      assert.ok(two.every((n) => !n.body.includes(l.phone)))
      await q(`INSERT INTO public.lead_activities (lead_id, actor_id, type) VALUES ($1,$2,'call_logged')`, [l.id, asha.profileId])
      await run(at(l.assigned_at, 30)); await run(at(l.assigned_at, 60))
      assert.equal((await notes(asha, 'lead_uncontacted', l.id)).length, 2, 'a call stops the reminders')
    })

    await test('reassignment: the old owner’s reminders stop, the new owner’s start from their own assignment', async () => {
      const l = await lead(org, asha)
      await run(at(l.assigned_at, 10))
      await q(`UPDATE public.leads SET assigned_to=$2 WHERE id=$1`, [l.id, ravi.profileId])
      const moved = await one('SELECT assigned_at FROM public.leads WHERE id=$1', [l.id])
      await run(at(moved.assigned_at, 9))
      assert.equal((await notes(ravi, 'lead_uncontacted', l.id)).length, 0)
      await run(at(moved.assigned_at, 10)); await run(at(moved.assigned_at, 21))
      assert.equal((await notes(ravi, 'lead_uncontacted', l.id)).length, 2)
      assert.equal((await notes(asha, 'lead_uncontacted', l.id)).length, 1, 'nothing more for the old owner')
    })

    await test('reminders end after 24 hours; imported leads never nag', async () => {
      const old = await lead(org, asha)
      await run(at(old.assigned_at, 24 * 60 + 1))
      assert.equal((await notes(asha, 'lead_uncontacted', old.id)).length, 0)
      const imported = await lead(org, asha, { custom: { imported_at: new Date().toISOString() } })
      await q(`UPDATE public.leads_all SET assigned_at = now() WHERE id=$1`, [imported.id])
      await run(at(new Date().toISOString(), 30))
      assert.equal((await notes(asha, 'lead_uncontacted', imported.id)).length, 0)
    })

    await test('follow-ups: 5 minutes before, once; a reschedule is reminded again; a cancelled one never', async () => {
      const l = await lead(org, asha)
      const due = at(new Date().toISOString(), 120)
      const t = await one(`INSERT INTO public.lead_tasks (org_id, lead_id, assigned_to, kind, due_at) VALUES ($1,$2,$3,'call',$4) RETURNING id`, [org, l.id, asha.profileId, due])
      await run(at(due, -6))
      assert.equal((await notes(asha, 'follow_up_due', l.id)).length, 0)
      await run(at(due, -5)); await run(at(due, -3))
      assert.equal((await notes(asha, 'follow_up_due', l.id)).length, 1)
      const later = at(due, 60)
      await q(`UPDATE public.lead_tasks SET due_at=$2 WHERE id=$1`, [t.id, later])
      await run(at(later, -6))
      assert.equal((await notes(asha, 'follow_up_due', l.id)).length, 1)
      await run(at(later, -5)); await run(at(later, -1))
      assert.equal((await notes(asha, 'follow_up_due', l.id)).length, 2, 'reminded again for the new time, once')
      const t2 = await one(`INSERT INTO public.lead_tasks (org_id, lead_id, assigned_to, kind, due_at) VALUES ($1,$2,$3,'call',$4) RETURNING id`, [org, l.id, ravi.profileId, at(due, 300)])
      await q(`UPDATE public.lead_tasks SET status='cancelled', completed_at=now() WHERE id=$1`, [t2.id])
      await run(at(due, 299))
      assert.equal((await notes(ravi, 'follow_up_due', l.id)).length, 0)
    })

    await test('the workspace’s own timings', async () => {
      await alerts(org, { uncontactedMinutes: 5, followUpMinutes: 15 })
      const l = await lead(org, asha)
      await run(at(l.assigned_at, 5))
      assert.equal((await notes(asha, 'lead_uncontacted', l.id)).length, 1)
      const due = at(new Date().toISOString(), 240)
      await q(`INSERT INTO public.lead_tasks (org_id, lead_id, assigned_to, kind, due_at) VALUES ($1,$2,$3,'meeting',$4)`, [org, l.id, asha.profileId, due])
      await run(at(due, -15))
      assert.equal((await notes(asha, 'follow_up_due', l.id)).length, 1)
      await alerts(org, { uncontactedMinutes: 'nonsense', followUpMinutes: 9999 })
      assert.equal((await one(`SELECT public.lead_alert_minutes(alerts,'uncontactedMinutes',10,5,60) a, public.lead_alert_minutes(alerts,'followUpMinutes',5,1,60) b FROM public.org_settings WHERE org_id=$1`, [org])).a, 10)
    })

    await test('each switch turns its alerts off; the master switch turns them all off', async () => {
      await alerts(org, { newLead: false, uncontacted: false, followUp: false })
      const l = await lead(org, asha)
      const [mine] = await notes(asha, 'lead_assigned', l.id)
      assert.equal(mine.data.event, undefined, 'a plain assignment alert, as before')
      assert.equal((await notes(owner, 'lead_new', l.id)).length, 0)
      await q(`INSERT INTO public.lead_tasks (org_id, lead_id, assigned_to, kind, due_at) VALUES ($1,$2,$3,'call',$4)`, [org, l.id, asha.profileId, at(l.assigned_at, 30)])
      await run(at(l.assigned_at, 29))
      assert.equal((await notes(asha, 'lead_uncontacted', l.id)).length, 0)
      assert.equal((await notes(asha, 'follow_up_due', l.id)).length, 0)
      const quiet = await mkOrg('b'); const qm = await mkUser(quiet, 'QOwner', 'owner'), qa = await mkUser(quiet, 'QAsha', 'sales_exec')
      await alerts(quiet, { enabled: false })
      const ql = await lead(quiet, qa)
      assert.equal((await notes(qm, 'lead_new', ql.id)).length, 0)
      await run(at(ql.assigned_at, 15))
      assert.equal((await notes(qa, 'lead_uncontacted', ql.id)).length, 0)
    })

    await test('another workspace never hears about these leads; the bookkeeping table is closed to signed-in users', async () => {
      const other = await mkOrg('c'); const stranger = await mkUser(other, 'Stranger', 'owner')
      assert.equal(Number((await one(`SELECT count(*) n FROM public.notifications WHERE recipient_profile_id=$1`, [stranger.profileId])).n), 0)
      assert.equal((await one(`SELECT has_table_privilege('authenticated', 'public.lead_contact_reminders', 'SELECT') p`)).p, false)
      assert.equal((await one(`SELECT relrowsecurity r FROM pg_class WHERE oid='public.lead_contact_reminders'::regclass`)).r, true)
    })
  } finally {
    await q(`SELECT cron.alter_job(jobid, active => true) FROM cron.job WHERE jobname = 'regrow-lead-responses'`).catch(() => {})
    for (const id of orgs) {
      await q('DELETE FROM public.leads_all WHERE org_id=$1', [id]).catch(() => {})
      await q('DELETE FROM public.projects WHERE org_id=$1', [id]).catch(() => {})
      await q('DELETE FROM public.org_members WHERE org_id=$1', [id]).catch(() => {})
      await q('DELETE FROM public.organisations WHERE id=$1', [id]).catch((e) => console.error('cleanup', e.message))
    }
    await db.end()
  }
  console.log(`\nLead alerts: ${passed} checks passed.`)
}
main().catch((e) => { console.error(e); process.exit(1) })
