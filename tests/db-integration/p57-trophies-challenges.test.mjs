// tests/db-integration/p57-trophies-challenges.test.mjs — migration 20260099 against the local Supabase stack: trophies
// for a closed week or month (top three people, top three teams), ranked from the ledger only, awarded once, never for
// a period still running, never to someone who does not sell, never across workspaces; and weekly challenges unlocking
// once per week.
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
      [id, `p57-${label}-${RUN}@regrow.test`, JSON.stringify({ full_name: `P57 ${label}` })])
    return { authId: id, profileId: (await one('SELECT id FROM public.profiles WHERE auth_user_id = $1', [id])).id }
  }
  const mkOrg = async (label) => (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1, $2, 'developer') RETURNING id`, [`P57 ${label} ${RUN}`, `p57-${label}-${RUN}`])).id
  const expectError = async (sql, params, re) => {
    await q('BEGIN'); try { await q(sql, params); assert.fail('should have failed') } catch (e) { if (e.code === 'ERR_ASSERTION') throw e; assert.match(e.message, re) } finally { await q('ROLLBACK') }
  }
  let n = 0
  // A ledger row on a given day of last week (Indian time), as the CRM triggers would write it.
  const lastWeek = (await one(`SELECT (date_trunc('week', (now() AT TIME ZONE 'Asia/Kolkata')::date)::date - 7) d`)).d
  const day = (k) => { const d = new Date(lastWeek); d.setUTCDate(d.getUTCDate() + k); return d.toISOString().slice(0, 10) }
  const ev = (org, who, kind, xp, at, units = 1, value = 0) => q(`SELECT public.record_performance_event($1,$2,NULL,$3,$4,($5 || 'T12:00:00+05:30')::timestamptz,$6,$7,$8)`,
    [org, who.profileId, kind, `p57:${RUN}:${++n}`, at, units, value, xp])

  console.log('P57 — TROPHIES AND CHALLENGES (20260099)')
  const org = await mkOrg('org'), other = await mkOrg('other')
  const owner = await mkUser('owner'), a = await mkUser('a'), b = await mkUser('b'), c = await mkUser('c'), d = await mkUser('d'), lead = await mkUser('lead'), x = await mkUser('x')
  await q(`INSERT INTO public.org_members (org_id, profile_id, role) VALUES ($1,$2,'owner'),($1,$3,'sales_exec'),($1,$4,'sales_exec'),($1,$5,'sales_exec'),($1,$6,'sales_exec'),($1,$7,'team_lead')`,
    [org, owner.profileId, a.profileId, b.profileId, c.profileId, d.profileId, lead.profileId])
  await q(`INSERT INTO public.org_members (org_id, profile_id, role) VALUES ($1,$2,'sales_exec')`, [other, x.profileId])
  await q(`INSERT INTO public.org_settings (org_id, sales) VALUES ($1, '{"ownerSells": false, "teamsEnabled": true}')
           ON CONFLICT (org_id) DO UPDATE SET sales = EXCLUDED.sales`, [org])

  // Last week: the owner (who does not sell) scores most; then a, b, c; d has nothing; x is in another workspace.
  await ev(org, owner, 'adjustment', 900, day(1))
  await ev(org, a, 'adjustment', 300, day(1)); await ev(org, b, 'adjustment', 210, day(2)); await ev(org, c, 'adjustment', 200, day(3))
  // c's first contact also unlocks "First contact" (+10): 210 each, and c wins the tie on leads contacted.
  await ev(org, c, 'first_contact', 0, day(3))
  await ev(other, x, 'adjustment', 5000, day(2))
  // This week: a big score that must not count towards last week.
  await ev(org, b, 'adjustment', 9000, (await one(`SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date::text d`)).d)

  const t1 = (await one(`INSERT INTO public.teams (org_id, name, leader_profile_id) VALUES ($1,'Alpha',$2) RETURNING id`, [org, lead.profileId])).id
  const t2 = (await one(`INSERT INTO public.teams (org_id, name) VALUES ($1,'Bravo') RETURNING id`, [org])).id
  await q(`INSERT INTO public.team_members (org_id, team_id, profile_id) VALUES ($1,$2,$3),($1,$4,$5),($1,$4,$6)`, [org, t1, a.profileId, t2, b.profileId, c.profileId])

  let given
  await test('a closed week gets its top three salespeople and top teams, ranked from the ledger', async () => {
    given = (await one(`SELECT public.award_period_trophies($1,'week',$2) n`, [org, lastWeek])).n
    const people = (await q(`SELECT place, profile_id, xp FROM public.performance_trophies WHERE org_id=$1 AND scope='person' ORDER BY place`, [org])).rows
    assert.deepEqual(people.map((r) => [r.place, r.profile_id, r.xp]), [[1, a.profileId, 300], [2, c.profileId, 210], [3, b.profileId, 210]])
    const teams = (await q(`SELECT place, team_id FROM public.performance_trophies WHERE org_id=$1 AND scope='team' ORDER BY place`, [org])).rows
    // Bravo (b + c: 420 XP, 2 people) vs Alpha (a: 300 XP, 1 person): no deals or revenue, so points per member decide.
    assert.deepEqual(teams.map((r) => [r.place, r.team_id]), [[1, t1], [2, t2]])
    assert.equal(given, 5)
  })
  await test('the owner who only manages, people with nothing, and other workspaces win nothing', async () => {
    const ids = (await q(`SELECT profile_id FROM public.performance_trophies WHERE org_id=$1 AND scope='person'`, [org])).rows.map((r) => r.profile_id)
    assert.ok(!ids.includes(owner.profileId)); assert.ok(!ids.includes(d.profileId)); assert.ok(!ids.includes(x.profileId))
    const otherOrg = (await q(`SELECT 1 FROM public.performance_trophies WHERE org_id=$1`, [other])).rowCount
    assert.equal(otherOrg, 0)
  })
  await test('awarding again gives nothing more; the daily job is safe to run any time', async () => {
    assert.equal((await one(`SELECT public.award_period_trophies($1,'week',$2) n`, [org, lastWeek])).n, 0)
    await q(`SELECT public.award_due_trophies()`)
    assert.equal((await one(`SELECT count(*)::int n FROM public.performance_trophies WHERE org_id=$1 AND period_kind='week'`, [org])).n, given)
  })
  await test('the job awarded the other workspace its own week, separately', async () => {
    const r = (await q(`SELECT place, profile_id FROM public.performance_trophies WHERE org_id=$1 AND period_kind='week'`, [other])).rows
    assert.deepEqual(r.map((x2) => [x2.place, x2.profile_id]), [[1, x.profileId]])
  })
  await test('a week or month still running cannot be awarded', async () => {
    await expectError(`SELECT public.award_period_trophies($1,'week',(now() AT TIME ZONE 'Asia/Kolkata')::date)`, [org], /period_not_over/)
    await expectError(`SELECT public.award_period_trophies($1,'month',(now() AT TIME ZONE 'Asia/Kolkata')::date)`, [org], /period_not_over/)
    await expectError(`SELECT public.award_period_trophies($1,'year','2026-01-01')`, [org], /invalid_period/)
  })
  await test('nobody holds two places in one period, and a place is given once', async () => {
    await expectError(`INSERT INTO public.performance_trophies (org_id, period_kind, period_start, scope, place, profile_id, name) VALUES ($1,'week',$2,'person',3,$3,'dup')`,
      [org, lastWeek, d.profileId], /duplicate key/)
    await expectError(`INSERT INTO public.performance_trophies (org_id, period_kind, period_start, scope, place, profile_id, name) VALUES ($1,'week',$2::date - 7,'person',1,$3,'dup'), ($1,'week',$2::date - 7,'person',2,$3,'dup')`,
      [org, lastWeek, d.profileId], /duplicate key/)
  })
  await test('winners and team members are told, once each', async () => {
    const got = async (p) => (await one(`SELECT count(*)::int n FROM public.notifications WHERE org_id=$1 AND recipient_profile_id=$2 AND dedupe_key LIKE 'trophy:week:%'`, [org, p.profileId])).n
    assert.equal(await got(a), 2)      // gold person + gold team
    assert.equal(await got(lead), 1)   // leader of the gold team
    assert.equal(await got(d), 0)
  })
  await test('trophies are server-only', async () => {
    await q('BEGIN')
    try {
      await q(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: a.authId, role: 'authenticated' })])
      await q('SET LOCAL ROLE authenticated')
      await assert.rejects(q(`SELECT * FROM public.performance_trophies`), /permission denied/)
    } finally { await q('ROLLBACK') }
  })
  await test('the trophy job is scheduled daily', async () => {
    const j = await one(`SELECT schedule FROM cron.job WHERE jobname = 'regrow-award-trophies'`)
    assert.equal(j?.schedule, '35 19 * * *')
  })
  await test('a weekly challenge unlocks once a week, from real activity', async () => {
    for (let i = 0; i < 26; i++) await ev(org, d, 'first_contact', 0, day(4))
    const u = (await q(`SELECT window_start FROM public.achievement_unlocks WHERE org_id=$1 AND profile_id=$2 AND key='week_contacts_25'`, [org, d.profileId])).rows
    assert.equal(u.length, 1)
    assert.equal(u[0].window_start.toISOString().slice(0, 10), lastWeek.toISOString().slice(0, 10))
  })

  await db.end()
  console.log(`\nTrophies and challenges: ${passed} checks passed.`)
}
main().catch((e) => { console.error(e); process.exit(1) })
