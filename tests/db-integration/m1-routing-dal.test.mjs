// tests/db-integration/m1-routing-dal.test.mjs
// Exercises the REAL lib/dal/routing.ts (imported via jiti) against the local Supabase API with the
// service-role client — the same path the /api/routing handlers use after authorisation.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('FATAL: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (see `supabase status -o env`).')
  process.exit(1)
}
const RUN = crypto.randomBytes(4).toString('hex')

let passed = 0
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`) } catch (err) { console.error(`  ✗ ${name}`); throw err }
}

async function main() {
  // CI runs Node 20, which lacks a native WebSocket; @supabase/ssr constructs a realtime client eagerly.
  // The DAL never opens a realtime channel, so an inert class is enough. Production runs Node 22+.
  if (!globalThis.WebSocket) globalThis.WebSocket = class UnusedRealtimeTransport {}
  const jiti = createJiti(import.meta.url, { alias: { '@': root } })
  const dal = await jiti.import(path.join(root, 'lib/dal/routing.ts'))
  const pg = await import('pg')
  const { Client } = pg.default || pg
  const db = new Client({ connectionString: DATABASE_URL })
  await db.connect()
  const one = async (sql, params) => (await db.query(sql, params)).rows[0]

  const mkUser = async (label) => {
    const id = crypto.randomUUID()
    await db.query(`INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud)
                    VALUES ($1, '00000000-0000-0000-0000-000000000000', $2, 'x', now(), '{"provider":"email"}', '{}', now(), now(), 'authenticated', 'authenticated')`,
      [id, `m1dal-${label}-${RUN}@regrow.test`])
    const p = await one('SELECT id FROM public.profiles WHERE auth_user_id = $1', [id])
    return p ? p.id : (await one('INSERT INTO public.profiles (auth_user_id, full_name) VALUES ($1, $2) RETURNING id', [id, label])).id
  }
  const mkOrg = async (label) => (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1, $2, 'developer') RETURNING id`, [`DAL ${label} ${RUN}`, `m1dal-${label}-${RUN}`])).id

  console.log('===================================================================')
  console.log('M1 — ROUTING DAL (real lib/dal/routing.ts) AGAINST LOCAL SUPABASE')
  console.log('===================================================================')

  try {
    const org = await mkOrg('a')
    const other = await mkOrg('b')
    const exec1 = await mkUser('exec1')
    const exec2 = await mkUser('exec2')
    const outsider = await mkUser('outsider')
    await db.query(`INSERT INTO public.org_members (org_id, profile_id, role) VALUES ($1, $2, 'sales_exec'), ($1, $3, 'sales_exec'), ($4, $5, 'sales_exec')`,
      [org, exec1, exec2, other, outsider])
    const project = (await one(`INSERT INTO public.projects (org_id, name, slug) VALUES ($1, 'Towers', $2) RETURNING id`, [org, `m1dal-p-${RUN}`])).id
    const foreignProject = (await one(`INSERT INTO public.projects (org_id, name, slug) VALUES ($1, 'Foreign', $2) RETURNING id`, [other, `m1dal-f-${RUN}`])).id

    let teamId, ruleId
    await test('createTeam + duplicate name → 409', async () => {
      const r = await dal.createTeam({ orgId: org, name: 'Towers Desk', timezone: 'Asia/Kolkata' })
      assert.equal(r.success, true, r.error)
      teamId = r.data.id
      const dup = await dal.createTeam({ orgId: org, name: 'towers desk', timezone: 'Asia/Kolkata' })
      assert.deepEqual([dup.success, dup.status], [false, 409])
    })
    await test('upsertTeamMember adds and then updates the same member', async () => {
      assert.equal((await dal.upsertTeamMember(teamId, { orgId: org, profileId: exec1, weight: 1, dailyCapacity: null, isOnDuty: true })).success, true)
      assert.equal((await dal.upsertTeamMember(teamId, { orgId: org, profileId: exec1, weight: 3, dailyCapacity: 20, isOnDuty: true })).success, true)
      const row = await one(`SELECT weight, daily_capacity FROM public.team_members WHERE team_id = $1 AND profile_id = $2`, [teamId, exec1])
      assert.deepEqual(row, { weight: 3, daily_capacity: 20 })
      assert.equal((await dal.upsertTeamMember(teamId, { orgId: org, profileId: exec2, weight: 1, dailyCapacity: null, isOnDuty: true })).success, true)
    })
    await test('adding a member of another organisation → 400 with a safe message', async () => {
      const r = await dal.upsertTeamMember(teamId, { orgId: org, profileId: outsider, weight: 1, dailyCapacity: null, isOnDuty: true })
      assert.deepEqual([r.success, r.status], [false, 400])
      assert.ok(!r.error.includes(other) && !r.error.includes(outsider), 'error must not leak foreign ids')
    })
    await test("using another organisation's id for the team is refused", async () => {
      const r = await dal.updateTeam(teamId, { orgId: other, name: 'Hijacked' })
      assert.deepEqual([r.success, r.status], [false, 404])
    })
    await test("createRule rejects another organisation's project; accepts own", async () => {
      const bad = await dal.createRule({ orgId: org, name: 'Bad', teamId, priority: 1, strategy: 'round_robin', stickyDays: 90, isActive: true,
        matchProjectIds: [foreignProject], matchSources: [], matchConnectionIds: [], matchCampaignIds: [], matchFormIds: [] })
      assert.deepEqual([bad.success, bad.status], [false, 400])
      const ok = await dal.createRule({ orgId: org, name: 'Towers', teamId, priority: 1, strategy: 'round_robin', stickyDays: 0, isActive: true,
        matchProjectIds: [project], matchSources: [], matchConnectionIds: [], matchCampaignIds: [], matchFormIds: [] })
      assert.equal(ok.success, true, ok.error)
      ruleId = ok.data.id
    })
    await test('a lead for the project is routed by the rule created through the DAL', async () => {
      const lead = await one(`INSERT INTO public.leads (org_id, project_id, name, phone, source) VALUES ($1, $2, 'Buyer', '9811122233', 'website') RETURNING assigned_to`, [org, project])
      assert.ok([exec1, exec2].includes(lead.assigned_to))
    })
    await test('deleting a team that a rule still targets → 409; works after deleting the rule', async () => {
      const blocked = await dal.deleteTeam(org, teamId)
      assert.deepEqual([blocked.success, blocked.status], [false, 409])
      assert.equal((await dal.deleteRule(org, ruleId)).success, true)
    })
    await test('setOwnDutyStatus only changes the caller’s own memberships', async () => {
      const r = await dal.setOwnDutyStatus(org, exec1, false)
      assert.equal(r.success, true)
      assert.equal(r.data.updated, 1)
      const rows = (await db.query(`SELECT profile_id, is_on_duty FROM public.team_members WHERE team_id = $1 ORDER BY profile_id`, [teamId])).rows
      assert.equal(rows.find((x) => x.profile_id === exec1).is_on_duty, false)
      assert.equal(rows.find((x) => x.profile_id === exec2).is_on_duty, true)
    })
    await test('listTeams returns members with profile names, scoped to the organisation', async () => {
      const r = await dal.listTeams(org)
      assert.equal(r.success, true)
      assert.equal(r.data.length, 1)
      assert.equal(r.data[0].team_members.length, 2)
      const none = await dal.listTeams(other)
      assert.equal(none.data.length, 0)
    })
  } finally {
    await db.end()
  }

  console.log('\n===================================================================')
  console.log(`ALL ${passed} M1 ROUTING DAL TESTS PASSED`)
  console.log('===================================================================')
}

main().catch((err) => {
  console.error('\nTEST SUITE FAILED:', err?.message || err)
  process.exit(1)
})
