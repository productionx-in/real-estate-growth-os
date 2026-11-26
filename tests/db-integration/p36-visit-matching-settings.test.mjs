// tests/db-integration/p36-visit-matching-settings.test.mjs — site visit and matching settings (migration 20260077)
// and the assignment log against the local Supabase stack.
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
  const matching = await jiti.import(path.join(root, 'lib/dal/matching.ts'))
  const routing = await jiti.import(path.join(root, 'lib/dal/routing.ts'))
  const settings = await jiti.import(path.join(root, 'lib/dal/workspace-settings.ts'))
  const pg = await import('pg')
  const db = new (pg.default || pg).Client({ connectionString: DATABASE_URL }); await db.connect()
  const one = async (s, p) => (await db.query(s, p)).rows[0]
  const mkProfile = async (n) => {
    const id = crypto.randomUUID()
    await db.query(`INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
      VALUES ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),now(),now(),'{}',$3)`, [id, `${n.replace(/\s/g, '')}-${RUN}@repx.test`, JSON.stringify({ full_name: n })])
    return (await one('SELECT id FROM public.profiles WHERE auth_user_id=$1', [id])).id
  }

  console.log('P36 — SITE VISIT AND MATCHING SETTINGS, ASSIGNMENT LOG')
  const org = (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,'developer') RETURNING id`, [`VM ${RUN}`, `vm-${RUN}`])).id
  const other = (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,'developer') RETURNING id`, [`VM2 ${RUN}`, `vm2-${RUN}`])).id
  const asha = await mkProfile('Asha Menon')
  await db.query(`INSERT INTO public.org_members (org_id, profile_id, role) VALUES ($1,$2,'sales_exec')`, [org, asha])
  const project = (await one(`INSERT INTO public.projects (org_id, name, slug) VALUES ($1,'Skyline',$2) RETURNING id`, [org, `sk-${RUN}`])).id
  const mkLead = async (o = org, extra = '') => (await one(`INSERT INTO public.leads (org_id, name, phone, source, status, assigned_to${extra ? ', budget_max, req_configurations' : ''})
    VALUES ($1,'Ravi',$2,'website','contacted',$3${extra ? ', 10000000, ARRAY[\'3BHK\']' : ''}) RETURNING id`, [o, `9${String(Date.now()).slice(-9)}${Math.floor(Math.random() * 9)}`.slice(0, 10), o === org ? asha : null])).id
  // Noon tomorrow, India time.
  const day = new Date(Math.floor((Date.now() + 330 * 60_000) / 86_400_000) * 86_400_000 + 86_400_000 + 6.5 * 3600_000)

  await test('with a daily limit of 2, a third visit for the same person that day is refused, a different day is fine', async () => {
    await settings.saveWorkspaceSection(org, asha, 'visits', { buyerConfirmation: true, buyerReminder24h: true, buyerReminder2h: true, checkinRadiusM: 500, maxPerPersonPerDay: 2 })
    for (const h of [0, 2]) {
      const r = await sv.scheduleVisit({ orgId: org, leadId: await mkLead(), projectId: project, assignedTo: asha, scheduledAt: new Date(day.getTime() + h * 3600_000), actorId: asha })
      assert.equal(r.ok, true, r.error)
    }
    const third = await sv.scheduleVisit({ orgId: org, leadId: await mkLead(), projectId: project, assignedTo: asha, scheduledAt: new Date(day.getTime() + 4 * 3600_000), actorId: asha })
    assert.deepEqual([third.ok, third.status], [false, 409]); assert.match(third.error, /limit is 2/)
    const next = await sv.scheduleVisit({ orgId: org, leadId: await mkLead(), projectId: project, assignedTo: asha, scheduledAt: new Date(day.getTime() + 86_400_000), actorId: asha })
    assert.equal(next.ok, true, next.error)
    const moved = await sv.actOnVisit(next.data.id, org, asha, { action: 'reschedule', scheduledAt: new Date(day.getTime() + 5 * 3600_000) })
    assert.deepEqual([moved.ok, moved.status], [false, 409], 'moving into a full day is refused too')
  })

  await test('another workspace’s limit does not apply here, and none applies by default', async () => {
    assert.equal(await sv.overDailyLimit(other, asha, day), null)
  })

  await test('matching follows the workspace’s budget margin and minimum score', async () => {
    const lead = await mkLead(org, 'req')
    await db.query(`INSERT INTO public.inventory_items (org_id, project_id, unit_number, category, area_value, bhk_config, total_price, status) VALUES
      ($1,$2,'A-1','apartments',1500,'3BHK',10800000,'available'),($1,$2,'A-2','apartments',1500,'3BHK',9500000,'available')`, [org, project])
    let m = await matching.matchUnitsForLead(org, lead)
    assert.equal(m.matches.length, 2, 'default 10%: both')
    await settings.saveWorkspaceSection(org, asha, 'matching', { overBudgetPct: 5, minScore: 0, maxSuggestions: 8 })
    m = await matching.matchUnitsForLead(org, lead)
    assert.equal(m.matches.length, 1, '5%: the 8% over unit is dropped')
    await settings.saveWorkspaceSection(org, asha, 'matching', { overBudgetPct: 5, minScore: 80, maxSuggestions: 8 })
    m = await matching.matchUnitsForLead(org, lead)
    assert.ok(m.matches.every((x) => x.match.score >= 80))
  })

  await test('the assignment log shows this workspace only, filters by outcome and counts the last 30 days', async () => {
    const a = await mkLead(); const b = await mkLead(); const c = await mkLead(other)
    await db.query(`INSERT INTO public.lead_routing_decisions (org_id, lead_id, outcome, assigned_to) VALUES ($1,$2,'assigned',$4),($1,$3,'no_available_member',NULL),($5,$6,'no_matching_rule',NULL)`, [org, a, b, asha, other, c])
    const all = await routing.listRoutingLog(org, { page: 0 })
    assert.equal(all.success, true)
    assert.ok(all.data.rows.every((r) => r.lead_id !== c), 'no other workspace’s decisions')
    const nobody = await routing.listRoutingLog(org, { outcome: 'no_available_member', page: 0 })
    assert.deepEqual(nobody.data.rows.map((r) => r.lead_id), [b])
    assert.equal(nobody.data.last30.no_available_member, 1); assert.equal(nobody.data.last30.no_matching_rule, 0)
    const mine = await routing.listRoutingLog(org, { assignee: asha, page: 0 })
    assert.deepEqual(mine.data.rows.map((r) => r.lead_id), [a])
  })

  for (const id of [org, other]) await db.query('DELETE FROM public.org_settings WHERE org_id=$1', [id])
  await db.end()
  console.log(`\nP36 site visit and matching settings: ${passed} checks passed.`)
}
main().catch((e) => { console.error(e); process.exit(1) })
