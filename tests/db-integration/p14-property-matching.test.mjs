// tests/db-integration/p14-property-matching.test.mjs — property matching (migration 20260053, lib/dal/matching.ts)
// against the local Supabase stack: units for a lead, buyers for a unit, who sees which buyers, requirements.
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
  const mt = await jiti.import(path.join(root, 'lib/dal/matching.ts'))
  const pg = await import('pg')
  const db = new (pg.default || pg).Client({ connectionString: DATABASE_URL })
  await db.connect()
  const one = async (s, p) => (await db.query(s, p)).rows[0]
  const mkProfile = async (n) => {
    const id = crypto.randomUUID()
    await db.query(`INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
      VALUES ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),now(),now(),'{}',$3)`, [id, `${n}-${RUN}@repx.test`, JSON.stringify({ full_name: n })])
    return (await one('SELECT id FROM public.profiles WHERE auth_user_id=$1', [id])).id
  }

  console.log('P14 — PROPERTY MATCHING')
  const org = (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,'developer') RETURNING id`, [`Match ${RUN}`, `match-${RUN}`])).id
  const other = (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,'developer') RETURNING id`, [`Match2 ${RUN}`, `match2-${RUN}`])).id
  try {
    const manager = await mkProfile('Meera'), asha = await mkProfile('Asha'), kiran = await mkProfile('Kiran')
    await db.query(`INSERT INTO public.org_members (org_id, profile_id, role) VALUES ($1,$2,'manager'),($1,$3,'sales_exec'),($1,$4,'sales_exec')`, [org, manager, asha, kiran])
    const sky = (await one(`INSERT INTO public.projects (org_id, name, slug, city, location) VALUES ($1,'Skyline Towers',$2,'Bengaluru','Whitefield') RETURNING id`, [org, `sky-${RUN}`])).id
    const lake = (await one(`INSERT INTO public.projects (org_id, name, slug, city, location) VALUES ($1,'Lakeview',$2,'Mysuru','Hebbal') RETURNING id`, [org, `lake-${RUN}`])).id
    const theirs = (await one(`INSERT INTO public.projects (org_id, name, slug, city, location) VALUES ($1,'Rival Heights',$2,'Bengaluru','Whitefield') RETURNING id`, [other, `rival-${RUN}`])).id
    const mkUnit = async (o, p, no, bhk, price, carpet, status = 'available', facing = 'East') => (await one(
      `INSERT INTO public.inventory_items (org_id, project_id, unit_number, category, area_value, carpet_area, bhk_config, total_price, status, facing)
       VALUES ($1,$2,$3,'apartments',$5,$5,$4,$6,$7,$8) RETURNING id`, [o, p, no, bhk, carpet, price, status, facing])).id
    const best = await mkUnit(org, sky, 'B-1204', '3BHK', 11_500_000, 1180)
    const pricier = await mkUnit(org, sky, 'B-1504', '3BHK', 12_900_000, 1200)          // 7.5% over budget
    const tooDear = await mkUnit(org, sky, 'PH-1', '3BHK', 14_000_000, 1300)            // > 10% over
    const twoBhk = await mkUnit(org, sky, 'A-301', '2BHK', 8_000_000, 900)
    const sold = await mkUnit(org, sky, 'B-904', '3BHK', 11_000_000, 1150, 'sold')
    const mysuru = await mkUnit(org, lake, 'L-12', '3 BHK', 9_500_000, 1250, 'available', 'West')
    const rival = await mkUnit(other, theirs, 'R-1', '3BHK', 10_000_000, 1200)
    const mkLead = async (name, owner, status = 'qualified') => {
      const id = (await one(`INSERT INTO public.leads (org_id, name, phone, source, status) VALUES ($1,$2,$3,'website',$4) RETURNING id`,
        [org, name, `9${crypto.randomInt(100000000, 999999999)}`, status])).id
      await db.query('UPDATE public.leads SET assigned_to=$1 WHERE id=$2', [owner, id])
      return id
    }
    const priya = await mkLead('Priya', asha)
    const rahul = await mkLead('Rahul', kiran)
    const lost = await mkLead('Lost buyer', asha, 'lost')
    const blank = await mkLead('Nothing recorded', asha)
    await db.query('UPDATE public.leads SET project_id=$1 WHERE id=$2', [sky, blank]) // only "interested in Skyline"
    const want3 = { budget_min: 9_000_000, budget_max: 12_000_000, req_configurations: ['3BHK'], req_categories: [], req_locations: ['Whitefield'], req_facing: ['East'], req_min_area: 1100, req_max_area: 1500 }

    await test('requirements: saved per organisation; inverted ranges and unknown types are refused', async () => {
      assert.equal((await mt.saveRequirements(org, priya, want3)).success, true)
      assert.equal((await mt.saveRequirements(org, rahul, { ...want3, req_locations: ['Bengaluru'], req_facing: [] })).success, true)
      assert.equal((await mt.saveRequirements(org, lost, want3)).success, true)
      const bad = await mt.saveRequirements(org, priya, { ...want3, budget_min: 13_000_000 })
      assert.deepEqual([bad.success, bad.status], [false, 400])
      const badArea = await mt.saveRequirements(org, priya, { ...want3, req_min_area: 2000 })
      assert.deepEqual([badArea.success, badArea.status], [false, 400])
      const cross = await mt.saveRequirements(other, priya, want3)
      assert.deepEqual([cross.success, cross.status], [false, 404], 'another organisation cannot edit this lead')
      await assert.rejects(db.query(`UPDATE public.leads SET req_categories = '{castles}' WHERE id=$1`, [priya]), /check/i)
      const row = await one('SELECT req_configurations, requirements_updated_at FROM public.leads WHERE id=$1', [priya])
      assert.deepEqual(row.req_configurations, ['3BHK'])
      assert.ok(row.requirements_updated_at)
    })

    await test('units for a lead: best first, only available, this organisation, not far over budget, right configuration', async () => {
      const { matches } = await mt.matchUnitsForLead(org, priya)
      const ids = matches.map((m) => m.unitId)
      assert.equal(ids[0], best, 'the unit that fits everything comes first')
      assert.ok(ids.includes(pricier), 'a little over budget is still offered')
      assert.ok(ids.includes(mysuru), 'another area is offered lower down')
      for (const no of [tooDear, twoBhk, sold, rival]) assert.ok(!ids.includes(no))
      assert.deepEqual(matches[0].match.reasons, ['3BHK', 'Within budget', 'Whitefield', '1,180 sq ft', 'East facing'])
      assert.deepEqual(matches.find((m) => m.unitId === pricier).match.gaps, ['₹9 L over budget'])
      assert.deepEqual(matches.find((m) => m.unitId === mysuru).match.gaps, ['Different area'])
      assert.ok(matches[0].match.score > matches.find((m) => m.unitId === mysuru).match.score)
    })

    await test('a lead with nothing recorded gets no suggestions; another organisation sees nothing', async () => {
      assert.deepEqual((await mt.matchUnitsForLead(org, blank)).matches, [])
      assert.deepEqual(await mt.matchUnitsForLead(other, priya), { requirements: null, matches: [] })
    })

    await test('buyers for a unit: open leads only; managers see all; a sales executive only their own', async () => {
      const forManager = (await mt.matchLeadsForUnit(org, best, { role: 'manager', profileId: manager })).map((b) => b.name)
      assert.deepEqual(forManager.sort(), ['Priya', 'Rahul'], 'lost leads, and leads with nothing but a project of interest, are left out')
      const forAsha = (await mt.matchLeadsForUnit(org, best, { role: 'sales_exec', profileId: asha })).map((b) => b.name)
      assert.deepEqual(forAsha, ['Priya'])
      const forKiran = (await mt.matchLeadsForUnit(org, best, { role: 'sales_exec', profileId: kiran })).map((b) => b.name)
      assert.deepEqual(forKiran, ['Rahul'])
    })

    await test('buyers for a unit: a unit out of everyone’s budget, a sold unit, another organisation’s unit', async () => {
      assert.deepEqual(await mt.matchLeadsForUnit(org, tooDear, { role: 'manager', profileId: manager }), [])
      assert.deepEqual(await mt.matchLeadsForUnit(org, sold, { role: 'manager', profileId: manager }), [])
      assert.equal(await mt.matchLeadsForUnit(org, rival, { role: 'manager', profileId: manager }), null)
      assert.equal(await mt.matchLeadsForUnit(other, best, { role: 'manager', profileId: manager }), null)
    })

    console.log(`\nP14 property matching: ${passed} checks passed.`)
  } finally {
    for (const id of [org, other]) {
      await db.query('DELETE FROM public.leads WHERE org_id=$1', [id]).catch(() => {})
      await db.query('DELETE FROM public.inventory_items WHERE org_id=$1', [id]).catch(() => {})
      await db.query('DELETE FROM public.organisations WHERE id=$1', [id]).catch(() => {})
    }
    await db.end()
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
