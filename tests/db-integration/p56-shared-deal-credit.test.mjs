// tests/db-integration/p56-shared-deal-credit.test.mjs — migration 20260098 against the local Supabase stack: splitting a
// booked deal's credit, revenue and points; the closer always holding the remainder so the total is exactly 100%;
// actual deals kept apart from fractional credit; un-booking and re-booking; checks on the shares; history; and that
// nobody outside the server can read or change a split.
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
  let seq = 0
  const phone = () => `95${RUN.replace(/\D/g, '').padEnd(4, '6').slice(0, 4)}${String(++seq).padStart(4, '0')}`
  const mkUser = async (label) => {
    const id = crypto.randomUUID()
    await q(`INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud)
             VALUES ($1, '00000000-0000-0000-0000-000000000000', $2, 'x', now(), '{"provider":"email"}', $3, now(), now(), 'authenticated', 'authenticated')`,
      [id, `p56-${label}-${RUN}@regrow.test`, JSON.stringify({ full_name: label })])
    return { authId: id, profileId: (await one('SELECT id FROM public.profiles WHERE auth_user_id = $1', [id])).id }
  }
  const mkOrg = async (label) => (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1, $2, 'developer') RETURNING id`, [`P56 ${label} ${RUN}`, `p56-${label}-${RUN}`])).id
  const expectError = async (sql, params, re) => {
    await q('BEGIN'); try { await q(sql, params); assert.fail('should have failed') } catch (e) { if (e.code === 'ERR_ASSERTION') throw e; assert.match(e.message, re) } finally { await q('ROLLBACK') }
  }
  const FAR = ['2000-01-01', '2100-01-01']
  const metric = async (org, who, m) => Number((await one(`SELECT public.gam_metric($1,$2,$3,$4,$5) v`, [org, who.profileId, m, ...FAR])).v)
  const holding = async (org, lead, who) => {
    const r = await one(`SELECT coalesce(sum(credit),0) c, coalesce(sum(value) FILTER (WHERE kind IN ('revenue','deal_credit')),0) r,
                                coalesce(sum(xp) FILTER (WHERE kind IN ('deal_closed','deal_reversed','deal_credit')),0) x
                           FROM public.performance_events WHERE org_id=$1 AND lead_id=$2 AND profile_id=$3`, [org, lead, who.profileId])
    return { credit: Number(r.c), revenue: Number(r.r), xp: Number(r.x) }
  }
  const totals = async (org, lead) => {
    const r = await one(`SELECT coalesce(sum(credit),0) c, coalesce(sum(value) FILTER (WHERE kind IN ('revenue','deal_credit')),0) r,
                                coalesce(sum(units) FILTER (WHERE kind IN ('deal_closed','deal_reversed')),0) d
                           FROM public.performance_events WHERE org_id=$1 AND lead_id=$2`, [org, lead])
    return { credit: Number(r.c), revenue: Number(r.r), deals: Number(r.d) }
  }
  const split = (org, lead, shares, by) => one(`SELECT public.set_deal_credit($1,$2,$3::jsonb,$4,'test') id`, [org, lead, JSON.stringify(shares), by.profileId])

  console.log('P56 — SHARED DEAL CREDIT (20260098)')
  const org = await mkOrg('org'), other = await mkOrg('other')
  const a = await mkUser('a'), b = await mkUser('b'), c = await mkUser('c'), mgr = await mkUser('mgr'), viewer = await mkUser('viewer'), stranger = await mkUser('stranger')
  await q(`INSERT INTO public.org_members (org_id, profile_id, role) VALUES ($1,$2,'sales_exec'),($1,$3,'sales_exec'),($1,$4,'team_lead'),($1,$5,'manager'),($1,$6,'readonly')`,
    [org, a.profileId, b.profileId, c.profileId, mgr.profileId, viewer.profileId])
  await q(`INSERT INTO public.org_members (org_id, profile_id, role) VALUES ($1,$2,'sales_exec')`, [other, stranger.profileId])
  const lead = (await one(`INSERT INTO public.leads (org_id, name, phone, source, assigned_to) VALUES ($1,'Shared deal',$2,'website',$3) RETURNING id`, [org, phone(), a.profileId])).id
  const open = (await one(`INSERT INTO public.leads (org_id, name, phone, source, assigned_to) VALUES ($1,'Not booked',$2,'website',$3) RETURNING id`, [org, phone(), a.profileId])).id

  await q(`UPDATE public.leads SET status = 'booked' WHERE id = $1`, [lead])
  const bookingXp = (await holding(org, lead, a)).xp

  await test('a booking credits the closer with the whole deal: credit 1, one actual deal', async () => {
    assert.deepEqual(await holding(org, lead, a), { credit: 1, revenue: 0, xp: bookingXp })
    assert.ok(bookingXp > 0)
    assert.equal(await metric(org, a, 'closed'), 1); assert.equal(await metric(org, a, 'deals'), 1)
  })
  await test('the closer is whoever holds the current booking', async () => {
    assert.equal((await one(`SELECT public.deal_closer($1,$2) p`, [org, lead])).p, a.profileId)
    assert.equal((await one(`SELECT public.deal_closer($1,$2) p`, [org, open])).p, null)
  })

  await q(`SELECT public.record_performance_event($1,$2,$3,'revenue',$4,now(),0,1000000,0)`, [org, a.profileId, lead, `revenue:p56-${RUN}:0`])

  await test('a 70/30 split moves credit, revenue and points; the total stays exactly one deal', async () => {
    assert.ok((await split(org, lead, [{ profileId: b.profileId, sharePct: 30 }], mgr)).id)
    assert.deepEqual(await holding(org, lead, b), { credit: 0.3, revenue: 300000, xp: Math.round(bookingXp * 0.3) })
    assert.deepEqual(await holding(org, lead, a), { credit: 0.7, revenue: 700000, xp: bookingXp - Math.round(bookingXp * 0.3) })
    assert.deepEqual(await totals(org, lead), { credit: 1, revenue: 1000000, deals: 1 })
  })
  await test('actual deals stay with the closer; fractional credit is what "closed" counts', async () => {
    assert.equal(await metric(org, a, 'deals'), 1); assert.equal(await metric(org, b, 'deals'), 0)
    assert.equal(await metric(org, a, 'closed'), 0.7); assert.equal(await metric(org, b, 'closed'), 0.3)
    assert.equal(await metric(org, b, 'revenue'), 300000)
  })
  await test('the contributor is told about their share', async () => {
    const n = await one(`SELECT count(*)::int n FROM public.notifications WHERE org_id = $1 AND recipient_profile_id = $2 AND title = 'You share credit for a booking'`, [org, b.profileId])
    assert.equal(n.n, 1)
    const none = await one(`SELECT count(*)::int n FROM public.notifications WHERE org_id = $1 AND recipient_profile_id = $2 AND title = 'You share credit for a booking'`, [org, a.profileId])
    assert.equal(none.n, 0)
  })

  await test('changing the split writes only the difference, and keeps the history', async () => {
    await split(org, lead, [{ profileId: b.profileId, sharePct: 50 }, { profileId: c.profileId, sharePct: 20 }], mgr)
    assert.equal((await holding(org, lead, a)).credit, 0.3)
    assert.equal((await holding(org, lead, b)).credit, 0.5)
    assert.equal((await holding(org, lead, c)).credit, 0.2)
    assert.deepEqual(await totals(org, lead), { credit: 1, revenue: 1000000, deals: 1 })
    const h = (await q(`SELECT before, after, changed_by, closer_id FROM public.deal_credit_history WHERE lead_id = $1 ORDER BY id`, [lead])).rows
    assert.equal(h.length, 2)
    assert.equal(h[1].before.length, 1); assert.equal(h[1].after.length, 2)
    assert.equal(h[1].changed_by, mgr.profileId); assert.equal(h[1].closer_id, a.profileId)
  })
  await test('reconciling again, or saving the same split, changes nothing (no double counting)', async () => {
    const before = (await one(`SELECT count(*)::int n FROM public.performance_events WHERE lead_id = $1`, [lead])).n
    assert.equal((await one(`SELECT public.perf_credit_reconcile($1,$2) n`, [org, lead])).n, 0)
    assert.equal((await split(org, lead, [{ profileId: c.profileId, sharePct: 20 }, { profileId: b.profileId, sharePct: 50 }], mgr)).id, null)
    assert.equal((await one(`SELECT count(*)::int n FROM public.performance_events WHERE lead_id = $1`, [lead])).n, before)
    assert.equal((await q(`SELECT 1 FROM public.deal_credit_history WHERE lead_id = $1`, [lead])).rowCount, 2)
  })
  await test('revenue that arrives after the split is split too', async () => {
    await q(`SELECT public.record_performance_event($1,$2,$3,'revenue',$4,now(),0,500000,0)`, [org, a.profileId, lead, `revenue:p56-${RUN}:1`])
    assert.equal((await holding(org, lead, b)).revenue, 750000)
    assert.equal((await holding(org, lead, c)).revenue, 300000)
    assert.equal((await holding(org, lead, a)).revenue, 450000)
  })

  await test('shares are checked: total under 100, not the closer, members of this workspace who sell, no repeats, two decimals', async () => {
    const bad = (shares, lid = lead, o = org) => expectError(`SELECT public.set_deal_credit($1,$2,$3::jsonb,$4)`, [o, lid, JSON.stringify(shares), mgr.profileId], /over_100|invalid_person|invalid_share|duplicate_person|not_booked|invalid_shares/)
    await bad([{ profileId: b.profileId, sharePct: 60 }, { profileId: c.profileId, sharePct: 40 }])
    await bad([{ profileId: a.profileId, sharePct: 10 }])
    await bad([{ profileId: stranger.profileId, sharePct: 10 }])
    await bad([{ profileId: viewer.profileId, sharePct: 10 }])
    await bad([{ profileId: b.profileId, sharePct: 10 }, { profileId: b.profileId, sharePct: 10 }])
    await bad([{ profileId: b.profileId, sharePct: 0 }])
    await bad([{ profileId: b.profileId, sharePct: 10.125 }])
    await bad([{ profileId: b.profileId, sharePct: '10' }])
    await bad([{ profileId: b.profileId, sharePct: 10 }], open)
    await bad([{ profileId: b.profileId, sharePct: 10 }], lead, other)
  })
  await test('the table refuses a share of 100% or more even written directly', async () => {
    await expectError(`INSERT INTO public.deal_credit_splits (org_id, lead_id, profile_id, share_pct) VALUES ($1,$2,$3,100)`, [org, lead, mgr.profileId], /check/)
  })

  await test('un-booking takes every share back; the last closer keeps the revenue; nothing is lost', async () => {
    await q(`UPDATE public.leads SET status = 'negotiation' WHERE id = $1`, [lead])
    for (const p of [a, b, c]) assert.equal((await holding(org, lead, p)).credit, 0)
    assert.equal((await holding(org, lead, b)).revenue, 0)
    assert.equal((await holding(org, lead, a)).revenue, 1500000)
    assert.deepEqual(await totals(org, lead), { credit: 0, revenue: 1500000, deals: 0 })
    assert.equal(await metric(org, b, 'closed'), 0); assert.equal(await metric(org, a, 'deals'), 0)
  })
  await test('re-booking restores the split; still one deal in total', async () => {
    await q(`UPDATE public.leads SET status = 'booked' WHERE id = $1`, [lead])
    assert.equal((await holding(org, lead, b)).credit, 0.5)
    assert.equal((await holding(org, lead, a)).credit, 0.3)
    assert.deepEqual(await totals(org, lead), { credit: 1, revenue: 1500000, deals: 1 })
  })
  await test('clearing the split gives the closer everything again', async () => {
    await split(org, lead, [], mgr)
    assert.deepEqual(await holding(org, lead, b), { credit: 0, revenue: 0, xp: 0 })
    assert.equal((await holding(org, lead, a)).credit, 1)
    assert.equal((await holding(org, lead, a)).revenue, 1500000)
  })
  await test('credit counts toward "closed" targets: 99.99% of a deal is not a deal; their own next booking hits it, once', async () => {
    const t = (await one(`INSERT INTO public.performance_targets (org_id, scope, profile_id, metric, amount, period, starts_on)
                           VALUES ($1,'member',$2,'closed',1,'month',date_trunc('month', now())::date) RETURNING id`, [org, c.profileId])).id
    await split(org, lead, [{ profileId: c.profileId, sharePct: 99.99 }], mgr)
    assert.equal(await metric(org, c, 'closed'), 0.9999)
    assert.equal((await q(`SELECT 1 FROM public.performance_events WHERE kind='target_hit' AND detail->>'target_id' = $1`, [t])).rowCount, 0)
    const own = (await one(`INSERT INTO public.leads (org_id, name, phone, source, assigned_to) VALUES ($1,'C closes',$2,'website',$3) RETURNING id`, [org, phone(), c.profileId])).id
    await q(`UPDATE public.leads SET status = 'booked' WHERE id = $1`, [own])
    assert.equal(await metric(org, c, 'closed'), 1.9999); assert.equal(await metric(org, c, 'deals'), 1)
    // Moving the split back and forth must not hit the target again.
    await split(org, lead, [{ profileId: c.profileId, sharePct: 10 }], mgr)
    await split(org, lead, [{ profileId: c.profileId, sharePct: 90 }], mgr)
    assert.equal((await q(`SELECT 1 FROM public.performance_events WHERE kind='target_hit' AND detail->>'target_id' = $1`, [t])).rowCount, 1)
    await q(`UPDATE public.performance_targets SET archived_at = now() WHERE id = $1`, [t])
  })

  await test('splits and their history are server-only: signed-in users can neither read nor write them', async () => {
    for (const sql of [`SELECT * FROM public.deal_credit_splits`, `SELECT * FROM public.deal_credit_history`]) {
      await q('BEGIN')
      try {
        await q(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: mgr.authId, role: 'authenticated' })])
        await q('SET LOCAL ROLE authenticated')
        await assert.rejects(q(sql), /permission denied/)
      } finally { await q('ROLLBACK') }
    }
    await q('BEGIN')
    try {
      await q(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: mgr.authId, role: 'authenticated' })])
      await q('SET LOCAL ROLE authenticated')
      await assert.rejects(q(`SELECT public.set_deal_credit($1,$2,'[]'::jsonb,$3)`, [org, lead, mgr.profileId]), /permission denied/)
    } finally { await q('ROLLBACK') }
  })

  await db.end()
  console.log(`\nShared deal credit: ${passed} checks passed.`)
}
main().catch((e) => { console.error(e); process.exit(1) })
