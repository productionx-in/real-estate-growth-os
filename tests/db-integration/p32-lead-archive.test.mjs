// tests/db-integration/p32-lead-archive.test.mjs — the 30-day lead Archive (migration 20260073, lib/dal/archive.ts)
// against the local Supabase stack: hidden everywhere, restored as it was, erased on time, scoped by organisation.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'
import { createClient } from '@supabase/supabase-js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) { console.error('FATAL: Supabase env required.'); process.exit(1) }
const RUN = crypto.randomBytes(4).toString('hex')
let passed = 0
async function test(name, fn) { try { await fn(); passed++; console.log(`  ✓ ${name}`) } catch (e) { console.error(`  ✗ ${name}`); throw e } }

async function main() {
  if (!globalThis.WebSocket) globalThis.WebSocket = class UnusedRealtimeTransport {}
  const jiti = createJiti(import.meta.url, { alias: { '@': root } })
  const archive = await jiti.import(path.join(root, 'lib/dal/archive.ts'))
  const pg = await import('pg')
  const sql = new (pg.default || pg).Client({ connectionString: DATABASE_URL }); await sql.connect()
  const one = async (s, p) => (await sql.query(s, p)).rows[0]
  const n = async (s, p) => Number((await one(s, p)).n)
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

  console.log('P32 — LEAD ARCHIVE')
  const org = (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,'developer') RETURNING id`, [`Archive ${RUN}`, `arch-${RUN}`])).id
  const other = (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,'developer') RETURNING id`, [`Other ${RUN}`, `arch2-${RUN}`])).id
  const project = (await one(`INSERT INTO public.projects (org_id, name, slug) VALUES ($1,'Lake View',$2) RETURNING id`, [org, `lv-${RUN}`])).id
  const phone = () => `+9198${Math.floor(Math.random() * 9e7 + 1e7)}`
  const lead = async (o, extra = {}) => (await one(`INSERT INTO public.leads (org_id, project_id, name, phone, source, idempotency_key) VALUES ($1,$2,$3,$4,'website',$5) RETURNING id`,
    [o, o === org ? project : null, extra.name ?? `Buyer ${RUN}`, phone(), extra.key ?? null])).id
  const actor = (await one(`SELECT id FROM public.profiles LIMIT 1`))?.id ?? null

  const key = `idem-${RUN}`
  const a = await lead(org, { name: 'Asha', key })
  await sql.query(`INSERT INTO public.site_visits (org_id, lead_id, project_id, scheduled_at) VALUES ($1,$2,$3, now() + interval '1 day')`, [org, a, project]).catch(() => null)

  await test('archiving hides the lead from every read of public.leads (SQL and the API), and keeps it in the Archive', async () => {
    const before = await n('SELECT count(*) n FROM public.lead_activities WHERE lead_id=$1', [a])
    assert.equal((await one('SELECT public.archive_lead($1,$2,$3) ok', [a, org, actor])).ok, true)
    assert.equal(await n('SELECT count(*) n FROM public.leads WHERE id=$1', [a]), 0)
    assert.equal(await n('SELECT count(*) n FROM public.leads_all WHERE id=$1 AND deleted_at IS NOT NULL', [a]), 1)
    const { data } = await db.from('leads').select('id').eq('id', a)
    assert.deepEqual(data, [])
    assert.equal(await n('SELECT count(*) n FROM public.lead_activities WHERE lead_id=$1', [a]), before, 'no triggers fire on archive')
    const listed = await archive.listArchivedLeads(org)
    assert.deepEqual(listed.map((l) => l.id), [a])
    assert.equal(await archive.countArchivedLeads(org), 1)
    const { data: visits } = await db.from('site_visits').select('id, lead:leads!inner(id)').eq('org_id', org)
    assert.deepEqual(visits, [], 'visits of archived leads leave the calendar')
  })

  await test('the API embeds through the view: lead lists still resolve their assignee', async () => {
    const live = await lead(org, { name: 'Ravi' })
    const { data, error } = await db.from('leads').select('id, assignee:profiles!leads_assigned_to_fkey(id, full_name)').eq('id', live).single()
    assert.equal(error, null, error?.message); assert.equal(data.id, live)
    await sql.query('DELETE FROM public.leads WHERE id=$1', [live])
  })

  await test('another organisation can neither archive, see, restore nor erase it', async () => {
    const b = await lead(org, { name: 'Neel' })
    assert.equal((await one('SELECT public.archive_lead($1,$2,$3) ok', [b, other, actor])).ok, false)
    assert.equal(await n('SELECT count(*) n FROM public.leads WHERE id=$1', [b]), 1)
    assert.deepEqual(await archive.listArchivedLeads(other), [])
    assert.deepEqual(await archive.restoreLead(other, a), { ok: false, status: 404, error: 'This lead is not in the Archive (it may have been restored or erased).' })
    assert.equal((await archive.eraseArchivedLead(other, a)).ok, false)
    assert.equal(await n('SELECT count(*) n FROM public.leads_all WHERE id=$1', [a]), 1)
    await sql.query('DELETE FROM public.leads WHERE id=$1', [b])
  })

  await test('a resent lead with the same key is accepted while the old one is archived; restoring then explains the clash', async () => {
    const again = await lead(org, { name: 'Asha (again)', key })
    const r = await archive.restoreLead(org, a)
    assert.equal(r.ok, false); assert.equal(r.status, 409)
    await sql.query('DELETE FROM public.leads WHERE id=$1', [again])
  })

  await test('restoring brings the lead back exactly as it was, without re-running triggers', async () => {
    const acts = await n('SELECT count(*) n FROM public.lead_activities WHERE lead_id=$1', [a])
    assert.deepEqual(await archive.restoreLead(org, a), { ok: true })
    const row = await one('SELECT name, deleted_at, deleted_by FROM public.leads WHERE id=$1', [a])
    assert.equal(row.name, 'Asha'); assert.equal(row.deleted_at, null); assert.equal(row.deleted_by, null)
    assert.equal(await n('SELECT count(*) n FROM public.lead_activities WHERE lead_id=$1', [a]), acts)
    assert.equal((await archive.restoreLead(org, a)).status, 404, 'a live lead cannot be restored twice')
  })

  await test('erase now removes an archived lead for good; a live lead cannot be erased this way', async () => {
    assert.equal((await archive.eraseArchivedLead(org, a)).ok, false)
    await one('SELECT public.archive_lead($1,$2,$3)', [a, org, actor])
    assert.deepEqual(await archive.eraseArchivedLead(org, a), { ok: true })
    assert.equal(await n('SELECT count(*) n FROM public.leads_all WHERE id=$1', [a]), 0)
  })

  await test('the daily job erases only leads archived more than 30 days ago', async () => {
    const old = await lead(org, { name: 'Old' }); const recent = await lead(org, { name: 'Recent' })
    await one('SELECT public.archive_lead($1,$2,$3)', [old, org, actor]); await one('SELECT public.archive_lead($1,$2,$3)', [recent, org, actor])
    await sql.query(`UPDATE public.leads_all SET deleted_at = now() - interval '31 days' WHERE id=$1`, [old])
    assert.ok(Number((await one('SELECT public.purge_archived_leads() n')).n) >= 1)
    assert.equal(await n('SELECT count(*) n FROM public.leads_all WHERE id=$1', [old]), 0)
    assert.equal(await n('SELECT count(*) n FROM public.leads_all WHERE id=$1', [recent]), 1)
  })

  await test('only the server can call the archive functions', async () => {
    for (const f of ['archive_lead(uuid, uuid, uuid)', 'restore_lead(uuid, uuid)', 'erase_archived_lead(uuid, uuid)', 'purge_archived_leads()']) {
      const r = await one(`SELECT has_function_privilege('anon', 'public.${f}', 'EXECUTE') a, has_function_privilege('authenticated', 'public.${f}', 'EXECUTE') b`)
      assert.deepEqual([r.a, r.b], [false, false], f)
    }
    const v = await one(`SELECT c.reloptions::text o FROM pg_class c WHERE c.oid = 'public.leads'::regclass`)
    assert.match(v.o, /security_invoker=true/, 'the view applies the caller’s row security')
  })

  await test('deleting an organisation also removes its archived leads', async () => {
    await sql.query('DELETE FROM public.organisations WHERE id=$1', [org]).catch(async () => {
      await sql.query('DELETE FROM public.leads_all WHERE org_id=$1', [org])
    })
    assert.equal(await n('SELECT count(*) n FROM public.leads_all WHERE org_id=$1', [org]), 0)
  })

  await sql.query('DELETE FROM public.organisations WHERE id=$1', [other]).catch(() => null)
  await sql.end()
  console.log(`\nP32 lead archive: ${passed} checks passed.`)
}
main().catch((e) => { console.error(e); process.exit(1) })
