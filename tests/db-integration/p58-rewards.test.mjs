// tests/db-integration/p58-rewards.test.mjs — migration 20260100 against the local Supabase stack: reward programmes
// qualify winners from the ledger only, within the budget and number of winners, once per winner; "top" goals only
// after the deadline; claims move only pending → approved/rejected → fulfilled → redeemed, with history; goals freeze
// once anyone has won; nothing crosses workspaces; nobody outside the server can read or write any of it.
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
  const mkUser = async (label) => {
    const id = crypto.randomUUID()
    await q(`INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud)
             VALUES ($1, '00000000-0000-0000-0000-000000000000', $2, 'x', now(), '{"provider":"email"}', $3, now(), now(), 'authenticated', 'authenticated')`,
      [id, `p58-${label}-${RUN}@regrow.test`, JSON.stringify({ full_name: `P58 ${label}` })])
    return { authId: id, profileId: (await one('SELECT id FROM public.profiles WHERE auth_user_id = $1', [id])).id }
  }
  const mkOrg = async (label) => (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1, $2, 'developer') RETURNING id`, [`P58 ${label} ${RUN}`, `p58-${label}-${RUN}`])).id
  const expectError = async (sql, params, re) => {
    await q('BEGIN'); try { await q(sql, params); assert.fail('should have failed') } catch (e) { if (e.code === 'ERR_ASSERTION') throw e; assert.match(e.message, re) } finally { await q('ROLLBACK') }
  }
  let n = 0
  const xp = (org, who, pts, at = 'now()') => q(`SELECT public.record_performance_event($1,$2,NULL,'adjustment',$3,${at},1,0,$4)`, [org, who.profileId, `p58:${RUN}:${++n}`, pts])
  const program = async (org, o) => (await one(`INSERT INTO public.reward_programs (org_id, title, reward_type, reward_detail, unit_value, budget, scope, eligible_roles, goal_kind, metric, goal_amount, top_n, max_winners, starts_on, ends_on)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
    [org, o.title ?? 'Programme', o.type ?? 'gadget', o.detail ?? 'iPhone 16', o.unit ?? 0, o.budget ?? null, o.scope ?? 'person', o.roles ?? ['sales_exec', 'team_lead'],
     o.kind ?? 'reach', o.metric ?? 'xp', o.amount ?? null, o.top ?? null, o.max ?? null, o.starts ?? '2026-11-01', o.ends ?? '2027-06-30'])).id
  const claims = (pid) => q(`SELECT profile_id, team_id, status, place, achieved FROM public.reward_claims WHERE program_id = $1 ORDER BY place NULLS LAST, achieved DESC`, [pid]).then((r) => r.rows)
  const qualify = async (pid) => (await one(`SELECT public.reward_qualify($1) n`, [pid])).n
  const step = (org, cid, to, by) => one(`SELECT public.set_reward_claim_status($1,$2,$3,$4,'p58') s`, [org, cid, to, by.profileId])

  console.log('P58 — REWARDS (20260100)')
  const org = await mkOrg('org'), other = await mkOrg('other')
  const owner = await mkUser('owner'), mgr = await mkUser('mgr'), a = await mkUser('a'), b = await mkUser('b'), c = await mkUser('c'), viewer = await mkUser('viewer'), x = await mkUser('x')
  await q(`INSERT INTO public.org_members (org_id, profile_id, role) VALUES ($1,$2,'owner'),($1,$3,'manager'),($1,$4,'sales_exec'),($1,$5,'sales_exec'),($1,$6,'team_lead'),($1,$7,'readonly')`,
    [org, owner.profileId, mgr.profileId, a.profileId, b.profileId, c.profileId, viewer.profileId])
  await q(`INSERT INTO public.org_members (org_id, profile_id, role) VALUES ($1,$2,'sales_exec')`, [other, x.profileId])
  await q(`INSERT INTO public.org_settings (org_id, sales) VALUES ($1, '{"ownerSells": false, "teamsEnabled": true}') ON CONFLICT (org_id) DO UPDATE SET sales = EXCLUDED.sales`, [org])
  await xp(org, a, 500); await xp(org, b, 400); await xp(org, c, 300); await xp(org, owner, 9000); await xp(org, mgr, 9000); await xp(other, x, 9000)

  // Reach 250 XP; two iPhones in the budget.
  const reach = await program(org, { amount: 250, unit: 80000, budget: 160000 })
  let first
  await test('a "reach" goal qualifies eligible people who met it — only as many as the budget pays for', async () => {
    assert.equal(await qualify(reach), 2)
    first = await claims(reach)
    assert.deepEqual(first.map((r) => [r.profile_id, r.status]), [[a.profileId, 'pending'], [b.profileId, 'pending']])
  })
  await test('owners who only manage, managers outside the eligible roles, read-only members and other workspaces never qualify', async () => {
    const ids = (await claims(reach)).map((r) => r.profile_id)
    for (const p of [owner, mgr, viewer, x]) assert.ok(!ids.includes(p.profileId))
  })
  await test('qualifying again gives nothing more: one reward per winner per programme', async () => {
    assert.equal(await qualify(reach), 0)
    await expectError(`INSERT INTO public.reward_claims (org_id, program_id, profile_id, name, achieved) VALUES ($1,$2,$3,'dup',1)`, [org, reach, a.profileId], /duplicate key/)
  })
  await test('claims move only pending → approved/rejected → fulfilled → redeemed, with history', async () => {
    const ca = (await one(`SELECT id FROM public.reward_claims WHERE program_id=$1 AND profile_id=$2`, [reach, a.profileId])).id
    await expectError(`SELECT public.set_reward_claim_status($1,$2,'fulfilled',$3)`, [org, ca, mgr.profileId], /invalid_step/)
    await expectError(`SELECT public.set_reward_claim_status($1,$2,'redeemed',$3)`, [org, ca, mgr.profileId], /invalid_step/)
    assert.equal((await step(org, ca, 'approved', mgr)).s, 'approved')
    assert.equal((await step(org, ca, 'fulfilled', mgr)).s, 'fulfilled')
    assert.equal((await step(org, ca, 'redeemed', a)).s, 'redeemed')
    await expectError(`SELECT public.set_reward_claim_status($1,$2,'approved',$3)`, [org, ca, mgr.profileId], /invalid_step/)
    const h = (await q(`SELECT from_status, to_status FROM public.reward_claim_history WHERE claim_id=$1 ORDER BY id`, [ca])).rows
    assert.deepEqual(h.map((r) => `${r.from_status}>${r.to_status}`), ['null>pending', 'pending>approved', 'approved>fulfilled', 'fulfilled>redeemed'])
    const row = await one(`SELECT decided_by, fulfilled_at, redeemed_at FROM public.reward_claims WHERE id=$1`, [ca])
    assert.equal(row.decided_by, mgr.profileId); assert.ok(row.fulfilled_at && row.redeemed_at)
    await expectError(`SELECT public.set_reward_claim_status($1,$2,'approved',$3)`, [other, ca, mgr.profileId], /not_found/)
  })
  await test('a rejected claim frees its place in the budget for the next person who met the goal', async () => {
    const cb = (await one(`SELECT id FROM public.reward_claims WHERE program_id=$1 AND profile_id=$2`, [reach, b.profileId])).id
    await step(org, cb, 'rejected', mgr)
    assert.equal(await qualify(reach), 1)
    const st = Object.fromEntries((await claims(reach)).map((r) => [r.profile_id, r.status]))
    assert.deepEqual(st, { [a.profileId]: 'redeemed', [b.profileId]: 'rejected', [c.profileId]: 'pending' })
  })
  await test('winners are told', async () => {
    const n2 = (await one(`SELECT count(*)::int n FROM public.notifications WHERE org_id=$1 AND recipient_profile_id=$2 AND title LIKE 'You won:%'`, [org, a.profileId])).n
    assert.equal(n2, 1)
  })
  await test('once anyone has won, the goal, metric, window and eligibility cannot change', async () => {
    await expectError(`UPDATE public.reward_programs SET goal_amount = 1 WHERE id = $1`, [reach], /cannot change/)
    await expectError(`UPDATE public.reward_programs SET ends_on = '2027-06-29' WHERE id = $1`, [reach], /cannot change/)
    await expectError(`UPDATE public.reward_programs SET eligible_roles = ARRAY['owner'] WHERE id = $1`, [reach], /cannot change/)
    await q(`UPDATE public.reward_programs SET title = 'Renamed', description = 'ok' WHERE id = $1`, [reach])
  })

  await test('a "top" goal waits for the deadline, then rewards the top N in order', async () => {
    const top = await program(org, { kind: 'top', top: 2, metric: 'xp' })
    assert.equal(await qualify(top), 0, 'deadline not passed')
    const past = await program(org, { kind: 'top', top: 2, metric: 'xp', starts: '2020-01-01', ends: '2020-12-31' })
    await xp(org, a, 50, `'2020-06-01T12:00:00+05:30'`); await xp(org, c, 70, `'2020-06-02T12:00:00+05:30'`); await xp(org, b, 10, `'2020-06-03T12:00:00+05:30'`)
    assert.equal(await qualify(past), 2)
    assert.deepEqual((await claims(past)).map((r) => [r.place, r.profile_id]), [[1, c.profileId], [2, a.profileId]])
  })
  await test('team programmes reward teams, from their members’ work', async () => {
    const t1 = (await one(`INSERT INTO public.teams (org_id, name) VALUES ($1,'Alpha') RETURNING id`, [org])).id
    const t2 = (await one(`INSERT INTO public.teams (org_id, name) VALUES ($1,'Bravo') RETURNING id`, [org])).id
    await q(`INSERT INTO public.team_members (org_id, team_id, profile_id) VALUES ($1,$2,$3),($1,$2,$4),($1,$5,$6)`, [org, t1, a.profileId, b.profileId, t2, c.profileId])
    const tp = await program(org, { scope: 'team', amount: 700, detail: 'Team trip to Goa', type: 'travel' })
    assert.equal(await qualify(tp), 1)
    assert.deepEqual((await claims(tp)).map((r) => r.team_id), [t1])
  })
  await test('eligible teams must be the workspace’s own; closed programmes stay closed', async () => {
    const foreign = (await one(`INSERT INTO public.teams (org_id, name) VALUES ($1,'Theirs') RETURNING id`, [other])).id
    await expectError(`INSERT INTO public.reward_programs (org_id, title, reward_type, reward_detail, goal_kind, metric, goal_amount, starts_on, ends_on, eligible_team_ids)
      VALUES ($1,'x','cash','₹5000','reach','xp',1,'2026-01-01','2026-12-31',$2)`, [org, [foreign]], /must belong to this organisation/)
    const old = await program(org, { amount: 1, starts: '2020-01-01', ends: '2020-01-31' })
    await q(`SELECT public.reward_sweep()`)
    assert.equal((await one(`SELECT status FROM public.reward_programs WHERE id=$1`, [old])).status, 'closed')
    await expectError(`UPDATE public.reward_programs SET status='active' WHERE id=$1`, [old], /cannot be reopened/)
  })
  await test('rewards are server-only; the sweep is scheduled hourly', async () => {
    for (const t of ['reward_programs', 'reward_claims', 'reward_claim_history']) {
      await q('BEGIN')
      try {
        await q(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: mgr.authId, role: 'authenticated' })])
        await q('SET LOCAL ROLE authenticated')
        await assert.rejects(q(`SELECT * FROM public.${t}`), /permission denied/)
      } finally { await q('ROLLBACK') }
    }
    assert.equal((await one(`SELECT schedule FROM cron.job WHERE jobname='regrow-reward-sweep'`))?.schedule, '7 * * * *')
  })

  await db.end()
  console.log(`\nRewards: ${passed} checks passed.`)
}
main().catch((e) => { console.error(e); process.exit(1) })
