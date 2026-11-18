// tests/db-integration/p15-workspace-search.test.mjs — ⌘K search (lib/dal/search.ts) against the local
// Supabase stack: organisation scoping, a sales executive only finding their own leads, and hostile input.
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
  const search = await jiti.import(path.join(root, 'lib/dal/search.ts'))
  const pg = await import('pg')
  const db = new (pg.default || pg).Client({ connectionString: DATABASE_URL })
  await db.connect()
  const one = async (s, p) => (await db.query(s, p)).rows[0]
  const mkProfile = async (n) => {
    const id = crypto.randomUUID()
    await db.query(`INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
      VALUES ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),now(),now(),'{}',$3)`, [id, `${n}-${RUN}@regrow.test`, JSON.stringify({ full_name: n })])
    return (await one('SELECT id FROM public.profiles WHERE auth_user_id=$1', [id])).id
  }

  console.log('P15 — WORKSPACE SEARCH')
  const org = (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,'developer') RETURNING id`, [`Search ${RUN}`, `search-${RUN}`])).id
  const other = (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,'developer') RETURNING id`, [`Search2 ${RUN}`, `search2-${RUN}`])).id
  try {
    const manager = await mkProfile('Meera'), asha = await mkProfile('Asha'), kiran = await mkProfile('Kiran')
    await db.query(`INSERT INTO public.org_members (org_id, profile_id, role) VALUES ($1,$2,'manager'),($1,$3,'sales_exec'),($1,$4,'sales_exec')`, [org, manager, asha, kiran])
    const sky = (await one(`INSERT INTO public.projects (org_id, name, slug, city) VALUES ($1,'Skyline Towers',$2,'Bengaluru') RETURNING id`, [org, `sky-${RUN}`])).id
    await db.query(`INSERT INTO public.projects (org_id, name, slug, city) VALUES ($1,'Skyline Rival',$2,'Pune')`, [other, `rival-${RUN}`])
    const mkLead = async (o, name, phone, owner, project = null) => {
      const id = (await one(`INSERT INTO public.leads (org_id, name, phone, source, status, project_id) VALUES ($1,$2,$3,'website','new',$4) RETURNING id`, [o, name, phone, project])).id
      if (owner) await db.query('UPDATE public.leads SET assigned_to=$1 WHERE id=$2', [owner, id])
      return id
    }
    const priya = await mkLead(org, 'Priya Sharma', '9811100001', asha, sky)
    const prakash = await mkLead(org, 'Prakash Rao', '9811100002', kiran)
    const meeras = await mkLead(org, 'Pradeep Nair', '9811100003', manager) // set explicitly: new leads are auto-assigned
    await mkLead(other, 'Priyanka Elsewhere', '9811100004', null)

    const asManager = { role: 'manager', profileId: manager }
    await test('a manager finds every matching lead in their organisation, and projects by name', async () => {
      const r = await search.searchWorkspace(org, asManager, 'pr')
      assert.deepEqual(r.leads.map((l) => l.id).sort(), [priya, prakash, meeras].sort())
      assert.equal(r.leads.find((l) => l.id === priya).projectName, 'Skyline Towers')
      assert.deepEqual((await search.searchWorkspace(org, asManager, 'skyline')).projects.map((p) => p.id), [sky])
    })

    await test('another organisation’s leads and projects never appear', async () => {
      const r = await search.searchWorkspace(org, asManager, 'priyanka')
      assert.deepEqual(r.leads, [])
      assert.deepEqual((await search.searchWorkspace(org, asManager, 'rival')).projects, [])
    })

    await test('a sales executive only finds leads assigned to them', async () => {
      const r = await search.searchWorkspace(org, { role: 'sales_exec', profileId: asha }, 'pr')
      assert.deepEqual(r.leads.map((l) => l.id), [priya])
      const byPhone = await search.searchWorkspace(org, { role: 'sales_exec', profileId: asha }, '9811100002')
      assert.deepEqual(byPhone.leads, [], 'another person’s lead is not found by phone either')
    })

    await test('phone numbers match; too-short and hostile text returns nothing or is neutralised', async () => {
      assert.deepEqual((await search.searchWorkspace(org, asManager, '100003')).leads.map((l) => l.id), [meeras])
      assert.deepEqual(await search.searchWorkspace(org, asManager, 'p'), search.EMPTY_RESULTS)
      assert.deepEqual(await search.searchWorkspace(org, asManager, null), search.EMPTY_RESULTS)
      const injected = await search.searchWorkspace(org, { role: 'sales_exec', profileId: asha }, 'x%,assigned_to.is.null),(name.ilike.%')
      assert.deepEqual(injected.leads, [], 'filter syntax is stripped, so it cannot widen the search')
    })

    console.log(`\nP15 workspace search: ${passed} checks passed.`)
  } finally {
    for (const id of [org, other]) {
      await db.query('DELETE FROM public.leads WHERE org_id=$1', [id]).catch(() => {})
      await db.query('DELETE FROM public.organisations WHERE id=$1', [id]).catch(() => {})
    }
    await db.end()
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
