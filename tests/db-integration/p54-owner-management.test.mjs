// tests/db-integration/p54-owner-management.test.mjs — migration 20260096 against the local Supabase stack: whether the
// owner sells (org_settings.sales.ownerSells) is enforced by the database for direct assignment, rules routing,
// returning-buyer (sticky) routing and slow-response reassignment eligibility; a workspace with nothing stored keeps its
// old behaviour; switching back on restores it.
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
  const phone = () => `97${RUN.replace(/\D/g, '').padEnd(4, '3').slice(0, 4)}${String(++seq).padStart(4, '0')}`
  const mkUser = async (label) => {
    const id = crypto.randomUUID()
    await q(`INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud)
             VALUES ($1, '00000000-0000-0000-0000-000000000000', $2, 'x', now(), '{"provider":"email"}', $3, now(), now(), 'authenticated', 'authenticated')`,
      [id, `p54-${label}-${RUN}@repx.test`, JSON.stringify({ full_name: label })])
    return (await one('SELECT id FROM public.profiles WHERE auth_user_id = $1', [id])).id
  }
  const mkOrg = async (label) => (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1, $2, 'developer') RETURNING id`, [`P54 ${label} ${RUN}`, `p54-${label}-${RUN}`])).id
  const setSales = (org, ownerSells) => q(`INSERT INTO public.org_settings (org_id, sales) VALUES ($1, $2) ON CONFLICT (org_id) DO UPDATE SET sales = EXCLUDED.sales`, [org, JSON.stringify({ ownerSells, teamsEnabled: false })])
  const expectError = async (sql, params, re) => {
    await q('BEGIN'); try { await q(sql, params); assert.fail('should have failed') } catch (e) { if (e.code === 'ERR_ASSERTION') throw e; assert.match(e.message, re) } finally { await q('ROLLBACK') }
  }

  console.log('P54 — OWNER AS MANAGER (20260096)')
  const org = await mkOrg('org')
  const owner = await mkUser('owner'), exec = await mkUser('exec')
  await q(`INSERT INTO public.org_members (org_id, profile_id, role) VALUES ($1,$2,'owner'),($1,$3,'sales_exec')`, [org, owner, exec])
  // A routing team with the owner in it (as many small workspaces start) and the sales executive.
  const team = (await one(`INSERT INTO public.teams (org_id, name) VALUES ($1, 'Sales') RETURNING id`, [org])).id
  await q(`INSERT INTO public.team_members (org_id, team_id, profile_id) VALUES ($1,$2,$3),($1,$2,$4)`, [org, team, owner, exec])
  await q(`INSERT INTO public.routing_rules (org_id, name, team_id, strategy, sticky_days) VALUES ($1, 'All', $2, 'round_robin', 90)`, [org, team])
  const lead = (assignedTo = null, ph = phone()) => one(`INSERT INTO public.leads (org_id, name, phone, source, assigned_to) VALUES ($1,'Buyer',$2,'website',$3) RETURNING id, assigned_to`, [org, ph, assignedTo])

  await test('nothing stored: the owner can still be given leads (behaviour before the setting existed)', async () => {
    const l = await lead(owner)
    assert.equal(l.assigned_to, owner)
    assert.equal((await one(`SELECT public.member_can_take_leads($1, $2, 'owner') ok`, [org, owner])).ok, true)
  })

  await setSales(org, false)
  await test('owner does not sell: a lead cannot be given to the owner, directly or by changing the assignee', async () => {
    await expectError(`INSERT INTO public.leads (org_id, name, phone, source, assigned_to) VALUES ($1,'X',$2,'website',$3)`, [org, phone(), owner], /owner does not take leads/)
    const l = await lead(exec)
    await expectError(`UPDATE public.leads SET assigned_to = $2 WHERE id = $1`, [l.id, owner], /owner does not take leads/)
    assert.equal((await one(`SELECT public.member_can_take_leads($1, $2, 'owner') ok`, [org, owner])).ok, false)
    assert.equal((await one(`SELECT public.member_can_take_leads($1, $2, 'sales_exec') ok`, [org, exec])).ok, true)
  })
  await test('leads the owner already holds stay with them, and can still be worked', async () => {
    const held = await one(`SELECT id FROM public.leads WHERE org_id = $1 AND assigned_to = $2 LIMIT 1`, [org, owner])
    await q(`UPDATE public.leads SET status = 'contacted' WHERE id = $1`, [held.id])
    assert.equal((await one(`SELECT assigned_to FROM public.leads WHERE id = $1`, [held.id])).assigned_to, owner)
  })
  await test('routing skips the owner even though they are on duty in the team', async () => {
    for (let i = 0; i < 4; i++) {
      const l = await lead()
      assert.equal(l.assigned_to, exec, 'every new lead goes to the salesperson')
    }
  })
  await test('a returning buyer whose last lead is with the owner is not sent back to the owner', async () => {
    const ph = phone()
    await setSales(org, true); await lead(owner, ph); await setSales(org, false)
    const again = await lead(null, ph)
    assert.equal(again.assigned_to, exec)
  })
  await test('with nobody else eligible, the lead stays unassigned (visible as "Nobody assigned") rather than going to the owner', async () => {
    await q(`UPDATE public.team_members SET is_on_duty = false WHERE team_id = $1 AND profile_id = $2`, [team, exec])
    const l = await lead()
    assert.equal(l.assigned_to, null)
    const d = await one(`SELECT outcome FROM public.lead_routing_decisions WHERE lead_id = $1`, [l.id])
    assert.equal(d.outcome, 'no_available_member')
    await q(`UPDATE public.team_members SET is_on_duty = true WHERE team_id = $1 AND profile_id = $2`, [team, exec])
  })

  await setSales(org, true)
  await test('switching it back on lets the owner be given leads again, by hand and by routing', async () => {
    const l = await lead(owner)
    assert.equal(l.assigned_to, owner)
    const got = new Set()
    for (let i = 0; i < 4; i++) got.add((await lead()).assigned_to)
    // Round robin balances by leads given today: the salesperson took every lead while the owner was off, so the owner
    // now gets the next ones.
    assert.ok(got.has(owner), 'routing includes the owner again')
  })

  await test('other roles are untouched: read-only and post-sales still cannot be given leads', async () => {
    const ro = await mkUser('ro'); await q(`INSERT INTO public.org_members (org_id, profile_id, role) VALUES ($1,$2,'readonly')`, [org, ro])
    await expectError(`INSERT INTO public.leads (org_id, name, phone, source, assigned_to) VALUES ($1,'X',$2,'website',$3)`, [org, phone(), ro], /cannot be assigned leads/)
  })

  await db.end()
  console.log(`\nP54 owner as manager: ${passed} checks passed.`)
}
main().catch((e) => { console.error(e); process.exit(1) })
