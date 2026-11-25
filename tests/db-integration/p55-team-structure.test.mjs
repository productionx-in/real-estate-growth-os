// tests/db-integration/p55-team-structure.test.mjs — migration 20260097 against the local Supabase stack: who may lead a
// team, which projects a team may have, and that a team's leader sees the team's leads under the database's own rules
// (row-level security) without being in the routing pool — and sees nobody else's.
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
  const phone = () => `96${RUN.replace(/\D/g, '').padEnd(4, '5').slice(0, 4)}${String(++seq).padStart(4, '0')}`
  const mkUser = async (label) => {
    const id = crypto.randomUUID()
    await q(`INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud)
             VALUES ($1, '00000000-0000-0000-0000-000000000000', $2, 'x', now(), '{"provider":"email"}', $3, now(), now(), 'authenticated', 'authenticated')`,
      [id, `p55-${label}-${RUN}@regrow.test`, JSON.stringify({ full_name: label })])
    return { authId: id, profileId: (await one('SELECT id FROM public.profiles WHERE auth_user_id = $1', [id])).id }
  }
  const mkOrg = async (label) => (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1, $2, 'developer') RETURNING id`, [`P55 ${label} ${RUN}`, `p55-${label}-${RUN}`])).id
  const expectError = async (sql, params, re) => {
    await q('BEGIN'); try { await q(sql, params); assert.fail('should have failed') } catch (e) { if (e.code === 'ERR_ASSERTION') throw e; assert.match(e.message, re) } finally { await q('ROLLBACK') }
  }
  const asUser = async (authId, fn) => {
    await q('BEGIN')
    try {
      await q(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: authId, role: 'authenticated' })])
      await q('SET LOCAL ROLE authenticated')
      return await fn()
    } finally { await q('ROLLBACK') }
  }

  console.log('P55 — TEAM STRUCTURE (20260097)')
  const org = await mkOrg('org'), other = await mkOrg('other')
  const lead = await mkUser('lead'), a = await mkUser('a'), b = await mkUser('b'), c = await mkUser('c'), exec = await mkUser('exec'), stranger = await mkUser('stranger')
  await q(`INSERT INTO public.org_members (org_id, profile_id, role) VALUES ($1,$2,'team_lead'),($1,$3,'sales_exec'),($1,$4,'sales_exec'),($1,$5,'sales_exec'),($1,$6,'sales_exec')`,
    [org, lead.profileId, a.profileId, b.profileId, c.profileId, exec.profileId])
  await q(`INSERT INTO public.org_members (org_id, profile_id, role) VALUES ($1,$2,'team_lead')`, [other, stranger.profileId])
  const proj = (await one(`INSERT INTO public.projects (org_id, name, slug) VALUES ($1, 'Skyline', $2) RETURNING id`, [org, `p55-sky-${RUN}`])).id
  const otherProj = (await one(`INSERT INTO public.projects (org_id, name, slug) VALUES ($1, 'Elsewhere', $2) RETURNING id`, [other, `p55-else-${RUN}`])).id

  let team
  await test('a team lead of the same workspace can lead a team with its own projects', async () => {
    team = (await one(`INSERT INTO public.teams (org_id, name, leader_profile_id, project_ids) VALUES ($1, 'Skyline team', $2, $3) RETURNING id, leader_profile_id, project_ids`, [org, lead.profileId, [proj]]))
    assert.equal(team.leader_profile_id, lead.profileId); assert.deepEqual(team.project_ids, [proj])
    team = team.id
  })
  await test('a sales executive, or someone from another workspace, cannot lead', async () => {
    await expectError(`UPDATE public.teams SET leader_profile_id = $2 WHERE id = $1`, [team, exec.profileId], /cannot lead a team/)
    await expectError(`UPDATE public.teams SET leader_profile_id = $2 WHERE id = $1`, [team, stranger.profileId], /not an active member/)
  })
  await test('a team cannot be given another workspace’s project', async () => {
    await expectError(`UPDATE public.teams SET project_ids = $2 WHERE id = $1`, [team, [proj, otherProj]], /must belong to this organisation/)
  })

  // Members a and b; c is in no team. The leader is not a member (not in the routing pool).
  await q(`INSERT INTO public.team_members (org_id, team_id, profile_id) VALUES ($1,$2,$3),($1,$2,$4)`, [org, team, a.profileId, b.profileId])
  const leadA = (await one(`INSERT INTO public.leads (org_id, name, phone, source, assigned_to) VALUES ($1,'For A',$2,'website',$3) RETURNING id`, [org, phone(), a.profileId])).id
  const leadC = (await one(`INSERT INTO public.leads (org_id, name, phone, source, assigned_to) VALUES ($1,'For C',$2,'website',$3) RETURNING id`, [org, phone(), c.profileId])).id

  await test('the leader shares the team with each member (both ways); members still share with each other', async () => {
    const r = await one(`SELECT public.auth_shares_team($1,$2,$3) la, public.auth_shares_team($1,$3,$2) al, public.auth_shares_team($1,$2,$4) lc, public.auth_shares_team($1,$3,$5) ab`,
      [org, lead.profileId, a.profileId, c.profileId, b.profileId])
    assert.deepEqual(r, { la: true, al: true, lc: false, ab: true })
  })
  await test('row-level security: the leader sees their members’ leads, not others’', async () => {
    const seen = await asUser(lead.authId, async () => (await q(`SELECT id FROM public.leads WHERE id = ANY($1)`, [[leadA, leadC]])).rows.map((r) => r.id))
    assert.deepEqual(seen, [leadA])
  })
  await test('a switched-off team grants nothing', async () => {
    await q(`UPDATE public.teams SET is_active = false WHERE id = $1`, [team])
    const seen = await asUser(lead.authId, async () => (await q(`SELECT id FROM public.leads WHERE id = $1`, [leadA])).rows.length)
    assert.equal(seen, 0)
    await q(`UPDATE public.teams SET is_active = true WHERE id = $1`, [team])
  })
  await test('leading does not put the leader in the routing pool', async () => {
    const n = (await one(`SELECT count(*)::int n FROM public.team_members WHERE team_id = $1 AND profile_id = $2`, [team, lead.profileId])).n
    assert.equal(n, 0)
  })
  await test('unsetting the leader ends their view of the team', async () => {
    await q(`UPDATE public.teams SET leader_profile_id = NULL WHERE id = $1`, [team])
    assert.equal((await one(`SELECT public.auth_shares_team($1,$2,$3) x`, [org, lead.profileId, a.profileId])).x, false)
  })

  await db.end()
  console.log(`\nP55 team structure: ${passed} checks passed.`)
}
main().catch((e) => { console.error(e); process.exit(1) })
