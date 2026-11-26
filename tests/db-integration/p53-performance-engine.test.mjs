// tests/db-integration/p53-performance-engine.test.mjs — sales performance (20260094) against the local Supabase stack.
// Points come only from real CRM events, once each: an assignment is not a sale; a first contact counts once per lead
// and person; flipping a lead's status never nets more than one deal; follow-up points are capped per day; revenue
// follows bookings and their cancellation. Missions, targets (personal over team over everyone), achievements and
// levels reward once and celebrate; switched off means no points; imported history never earns; clients cannot read.
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
  let seq = 0
  const phone = () => `95${String(parseInt(RUN, 16) % 10000).padStart(4, '0')}${String(++seq).padStart(4, '0')}`
  const orgs = []
  const mkOrg = async (label) => { const id = (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,'developer') RETURNING id`, [`P53 ${label} ${RUN}`, `p53-${label}-${RUN}`])).id; orgs.push(id); return id }
  const mkUser = async (org, label, role) => {
    const id = crypto.randomUUID()
    await q(`INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud)
             VALUES ($1,'00000000-0000-0000-0000-000000000000',$2,'x',now(),'{"provider":"email"}','{}',now(),now(),'authenticated','authenticated')`, [id, `p53-${label}-${RUN}@repx.test`])
    const profileId = (await one('SELECT id FROM public.profiles WHERE auth_user_id=$1', [id])).id
    await q(`INSERT INTO public.org_members (org_id, profile_id, role) VALUES ($1,$2,$3)`, [org, profileId, role])
    return profileId
  }
  const gam = (org, g) => q(`INSERT INTO public.org_settings (org_id, gamification) VALUES ($1,$2) ON CONFLICT (org_id) DO UPDATE SET gamification = EXCLUDED.gamification`, [org, JSON.stringify(g)])
  const lead = async (org, owner, extra = {}) => one(`INSERT INTO public.leads (org_id, name, phone, source, status, assigned_to, custom_fields) VALUES ($1,$2,$3,'website','new',$4,$5) RETURNING *`,
    [org, `Buyer ${seq + 1}`, phone(), owner, JSON.stringify(extra.custom ?? {})])
  const call = (leadId, actor) => q(`INSERT INTO public.lead_activities (lead_id, actor_id, type) VALUES ($1,$2,'call_logged')`, [leadId, actor])
  const events = (who, kind) => many(`SELECT * FROM public.performance_events WHERE profile_id=$1 AND kind=$2 ORDER BY occurred_at`, [who, kind])
  const metric = async (org, who, m) => Number((await one(`SELECT public.gam_metric($1,$2,$3,'-infinity','infinity') v`, [org, who, m])).v)
  const xp = async (org, who) => metric(org, who, 'xp')
  const celebrations = (who) => many(`SELECT title FROM public.notifications WHERE recipient_profile_id=$1 AND type='achievement' ORDER BY created_at`, [who])

  console.log('P53 — SALES PERFORMANCE ENGINE')
  try {
    const org = await mkOrg('a')
    // Missions and level steps small enough to test; default points otherwise.
    await gam(org, { missions: [{ key: 'two_calls', title: 'Call 2 leads', metric: 'contacted', count: 2, xp: 15 }], levels: [{ name: 'Beginner', xp: 0 }, { name: 'Rising Star', xp: 100 }] })
    const asha = await mkUser(org, 'asha', 'sales_exec'), ravi = await mkUser(org, 'ravi', 'sales_exec'), mgr = await mkUser(org, 'mgr', 'manager')

    await test('an assignment is recorded but earns nothing; a first contact counts once per lead and person', async () => {
      const l = await lead(org, asha)
      const [assigned] = (await events(asha, 'lead_assigned')).filter((e) => e.lead_id === l.id)
      assert.equal(assigned.xp, 0, 'an assignment is not a sale')
      await call(l.id, asha); await call(l.id, asha); await call(l.id, asha)
      assert.equal((await events(asha, 'first_contact')).filter((e) => e.lead_id === l.id).length, 1)
      assert.equal(await metric(org, asha, 'contacted'), 1)
      assert.equal(await metric(org, asha, 'closed'), 0, 'contacted is not closed')
    })

    await test('daily mission: completes once, awards its points, celebrates', async () => {
      const l2 = await lead(org, asha); await call(l2.id, asha)
      const l3 = await lead(org, asha); await call(l3.id, asha)
      const m = await events(asha, 'mission')
      assert.equal(m.length, 1, 'once per day however many more calls')
      assert.equal(m[0].xp, 15)
      assert.ok((await celebrations(asha)).some((c) => c.title === 'Mission complete: Call 2 leads'))
    })

    await test('flipping a lead between booked and not never nets more than one deal', async () => {
      const l = await lead(org, ravi)
      for (const s of ['booked', 'negotiation', 'booked', 'qualified', 'booked']) await q(`UPDATE public.leads SET status=$2 WHERE id=$1`, [l.id, s])
      assert.equal(await metric(org, ravi, 'closed'), 1)
      const deals = (await many(`SELECT kind, xp FROM public.performance_events WHERE lead_id=$1 AND kind IN ('deal_closed','deal_reversed')`, [l.id]))
      assert.equal(deals.reduce((s, d) => s + d.xp, 0), 100, 'net points of exactly one deal')
      await q(`UPDATE public.leads SET status='lost' WHERE id=$1`, [l.id])
      assert.equal(await metric(org, ravi, 'closed'), 0, 'un-booked: no deal')
    })

    await test('the deal stays with whoever closed it when the lead moves on; the new owner gets no second deal', async () => {
      const l = await lead(org, ravi)
      await q(`UPDATE public.leads SET status='booked' WHERE id=$1`, [l.id])
      await q(`UPDATE public.leads SET assigned_to=$2 WHERE id=$1`, [l.id, asha])
      assert.equal((await many(`SELECT profile_id FROM public.performance_events WHERE lead_id=$1 AND kind='deal_closed'`, [l.id])).map((r) => r.profile_id).join(), ravi)
      assert.equal((await events(asha, 'deal_closed')).filter((e) => e.lead_id === l.id).length, 0)
    })

    await test('follow-ups: once each; points stop after the daily cap, the count does not', async () => {
      await gam(org, { caps: { follow_up_done: 2 }, missions: [] })
      const l = await lead(org, asha)
      const ids = []
      for (let i = 0; i < 4; i++) ids.push((await one(`INSERT INTO public.lead_tasks (org_id, lead_id, assigned_to, kind, due_at) VALUES ($1,$2,$3,'call', now() + interval '1 day') RETURNING id`, [org, l.id, asha])).id)
      for (const id of ids) await q(`UPDATE public.lead_tasks SET status='done', completed_at=now() WHERE id=$1`, [id])
      await q(`UPDATE public.lead_tasks SET status='open', completed_at=NULL WHERE id=$1`, [ids[0]])
      await q(`UPDATE public.lead_tasks SET status='done', completed_at=now() WHERE id=$1`, [ids[0]])
      const done = await events(asha, 'follow_up_done')
      assert.equal(done.length, 4, 'reopening and closing again does not count twice')
      assert.deepEqual(done.map((e) => e.xp), [5, 5, 0, 0])
    })

    await test('revenue follows bookings and their cancellation, credited to whoever closed the lead', async () => {
      const project = (await one(`INSERT INTO public.projects (org_id, name, slug) VALUES ($1,'Tower',$2) RETURNING id`, [org, `p53-${RUN}`])).id
      const unit = (await one(`INSERT INTO public.inventory_items (org_id, project_id, unit_number, category, area_value) VALUES ($1,$2,'A-101','apartments',1200) RETURNING id`, [org, project])).id
      const l = await lead(org, ravi)
      await q(`UPDATE public.leads SET status='booked' WHERE id=$1`, [l.id])
      const b = (await one(`INSERT INTO public.bookings (org_id, project_id, inventory_id, lead_id, booking_number, base_price, total_amount) VALUES ($1,$2,$3,$4,$5,9000000,9500000) RETURNING id`, [org, project, unit, l.id, `B-${RUN}`])).id
      assert.equal(await metric(org, ravi, 'revenue'), 9500000)
      await q(`UPDATE public.bookings SET status='cancelled' WHERE id=$1`, [b])
      await q(`UPDATE public.bookings SET status='cancelled' WHERE id=$1`, [b])
      assert.equal(await metric(org, ravi, 'revenue'), 0)
    })

    await test('targets: a personal target overrides the team’s and everyone’s; reached once per period, celebrated', async () => {
      await gam(org, { missions: [] })
      await q(`INSERT INTO public.performance_targets (org_id, scope, metric, amount, period, starts_on) VALUES ($1,'everyone','contacted',50,'day',current_date - 1)`, [org])
      await q(`INSERT INTO public.performance_targets (org_id, scope, profile_id, metric, amount, period, starts_on, created_by) VALUES ($1,'member',$2,'contacted',2,'day',current_date - 1,$3)`, [org, ravi, mgr])
      for (let i = 0; i < 3; i++) { const l = await lead(org, ravi); await call(l.id, ravi) }
      const hits = await events(ravi, 'target_hit')
      assert.equal(hits.length, 1)
      assert.equal(Number(hits[0].detail.amount), 2, 'the personal target counted, not everyone’s 50')
      assert.ok((await celebrations(ravi)).some((c) => c.title === 'Target reached!'))
      const hist = await many(`SELECT action, changed_by FROM public.performance_target_history WHERE org_id=$1 ORDER BY id`, [org])
      assert.deepEqual(hist.map((h) => h.action), ['created', 'created'])
      await q(`UPDATE public.performance_targets SET amount=3, updated_by=$2 WHERE org_id=$1 AND scope='member'`, [org, mgr])
      assert.equal((await one(`SELECT action, (before->>'amount')::numeric b, (after->>'amount')::numeric a FROM public.performance_target_history WHERE org_id=$1 ORDER BY id DESC LIMIT 1`, [org])).b, '2.00')
    })

    await test('achievements unlock once with their points; level up celebrates; switched-off built-ins stay locked', async () => {
      const keys = (await many(`SELECT key FROM public.achievement_unlocks WHERE profile_id=$1`, [ravi])).map((r) => r.key)
      assert.ok(keys.includes('first_contact') && keys.includes('first_close') && keys.includes('target_hit'), keys.join())
      assert.equal(keys.filter((k) => k === 'first_contact').length, 1)
      assert.ok((await celebrations(ravi)).some((c) => c.title === 'Achievement unlocked: First booking'))
      assert.ok((await celebrations(ravi)).some((c) => /^Level up: Rising Star/.test(c.title)), 'crossed 100 XP')
      await q(`INSERT INTO public.achievement_defs (org_id, key, title, metric, threshold, active) VALUES ($1,'first_visit','First site visit','meetings',1,false)`, [org])
      await q(`INSERT INTO public.achievement_defs (org_id, key, title, description, metric, threshold, xp) VALUES ($1,'busy_bee','Busy bee','Five follow-ups done.','follow_ups',5,40)`, [org])
      const l = await lead(org, asha)
      const v = (await one(`INSERT INTO public.site_visits (org_id, project_id, lead_id, assigned_to, scheduled_at, status) VALUES ($1,(SELECT id FROM public.projects WHERE org_id=$1 LIMIT 1),$2,$3, now(), 'completed') RETURNING id`, [org, l.id, asha])).id
      assert.ok(v)
      const ashaKeys = (await many(`SELECT key FROM public.achievement_unlocks WHERE profile_id=$1`, [asha])).map((r) => r.key)
      assert.ok(!ashaKeys.includes('first_visit'), 'switched off')
      const t = (await one(`INSERT INTO public.lead_tasks (org_id, lead_id, assigned_to, kind, due_at) VALUES ($1,$2,$3,'call', now()) RETURNING id`, [org, l.id, asha])).id
      await q(`UPDATE public.lead_tasks SET status='done', completed_at=now() WHERE id=$1`, [t])
      assert.ok((await many(`SELECT key FROM public.achievement_unlocks WHERE profile_id=$1`, [asha])).some((r) => r.key === 'busy_bee'), 'a custom achievement')
    })

    await test('switched off: events are still counted, no points; imported history never earns', async () => {
      await gam(org, { enabled: false })
      const before = await xp(org, asha)
      const l = await lead(org, asha); await call(l.id, asha)
      assert.equal(await xp(org, asha), before)
      assert.equal((await events(asha, 'first_contact')).filter((e) => e.lead_id === l.id).length, 1)
      const imported = await lead(org, asha, { custom: { imported_at: new Date().toISOString() } })
      assert.equal((await many(`SELECT 1 FROM public.performance_events WHERE lead_id=$1`, [imported.id])).length, 0)
    })

    await test('another workspace’s people never earn here; signed-in users cannot read or write the ledger', async () => {
      const other = await mkOrg('b'); const stranger = await mkUser(other, 'stranger', 'owner')
      const id = (await one(`SELECT public.record_performance_event($1,$2,NULL,'adjustment','x:${RUN}') id`, [org, stranger])).id
      assert.equal(id, null)
      for (const t of ['performance_events', 'performance_targets', 'achievement_unlocks', 'achievement_defs', 'performance_target_history']) {
        assert.equal((await one(`SELECT has_table_privilege('authenticated', 'public.${t}', 'SELECT') p`)).p, false, t)
        assert.equal((await one(`SELECT relrowsecurity r FROM pg_class WHERE oid='public.${t}'::regclass`)).r, true, t)
      }
    })
  } finally {
    for (const id of orgs) {
      for (const t of ['bookings', 'site_visits', 'inventory_items', 'leads_all', 'projects', 'org_members']) await q(`DELETE FROM public.${t} WHERE org_id=$1`, [id]).catch(() => {})
      await q('DELETE FROM public.organisations WHERE id=$1', [id]).catch((e) => console.error('cleanup', e.message))
    }
    await db.end()
  }
  console.log(`\nSales performance engine: ${passed} checks passed.`)
}
main().catch((e) => { console.error(e); process.exit(1) })
