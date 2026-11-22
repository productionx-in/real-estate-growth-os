// tests/db-integration/p37-project-unit-delete.test.mjs — what stops a project or unit from being deleted
// (lib/dal/deletion.ts) against the local Supabase stack.
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
  const d = await jiti.import(path.join(root, 'lib/dal/deletion.ts'))
  const pg = await import('pg')
  const db = new (pg.default || pg).Client({ connectionString: DATABASE_URL }); await db.connect()
  const one = async (s, p) => (await db.query(s, p)).rows[0]

  console.log('P37 — DELETING PROJECTS AND UNITS')
  const org = (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,'developer') RETURNING id`, [`Del ${RUN}`, `del-${RUN}`])).id
  const other = (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,'developer') RETURNING id`, [`Del2 ${RUN}`, `del2-${RUN}`])).id
  const project = async (o) => (await one(`INSERT INTO public.projects (org_id, name, slug) VALUES ($1,'P',$2) RETURNING id`, [o, `p-${crypto.randomUUID().slice(0, 8)}`])).id
  const unit = async (o, p, status = 'available') => (await one(`INSERT INTO public.inventory_items (org_id, project_id, unit_number, category, area_value, bhk_config, total_price, status)
    VALUES ($1,$2,$3,'apartments',1000,'2BHK',9000000,$4) RETURNING id`, [o, p, `U-${crypto.randomUUID().slice(0, 6)}`, status])).id

  await test('an empty project, or one with only available units, can be deleted', async () => {
    const p = await project(org); await unit(org, p); await unit(org, p, 'blocked')
    assert.deepEqual(await d.projectDeleteBlockers(org, p), [])
  })

  await test('units on hold, booked or sold, and site visits, keep a project', async () => {
    const p = await project(org); await unit(org, p, 'sold'); await unit(org, p, 'on_hold')
    const lead = (await one(`INSERT INTO public.leads (org_id, name, phone, source) VALUES ($1,'A','9876500001','website') RETURNING id`, [org])).id
    await db.query(`INSERT INTO public.site_visits (org_id, lead_id, project_id, scheduled_at) VALUES ($1,$2,$3, now() + interval '1 day')`, [org, lead, p])
    const b = await d.projectDeleteBlockers(org, p)
    assert.deepEqual(b.map((x) => [x.what, x.count]).sort(), [['site visit', 1], ['unit on hold, booked or sold', 2]].sort())
  })

  await test('counts are per organisation: another workspace sees nothing', async () => {
    const p = await project(org); await unit(org, p, 'booked')
    assert.deepEqual(await d.projectDeleteBlockers(other, p), [])
  })

  await test('a unit on hold, booked or sold cannot be deleted; an available one can', async () => {
    const p = await project(org)
    assert.deepEqual(await d.unitDeleteBlockers(org, await unit(org, p), 'available'), [])
    assert.equal((await d.unitDeleteBlockers(org, await unit(org, p, 'sold'), 'sold')).length, 1)
    assert.equal((await d.unitDeleteBlockers(org, await unit(org, p, 'on_hold'), 'on_hold')).length, 1)
  })

  await db.end()
  console.log(`\nP37 deleting projects and units: ${passed} checks passed.`)
}
main().catch((e) => { console.error(e); process.exit(1) })
