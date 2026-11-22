// tests/db-integration/p34-lead-fields.test.mjs — fields on leads and locations (migration 20260075,
// lib/dal/lead-fields.ts, lib/dal/workspace-settings.ts) against the local Supabase stack.
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
  const settings = await jiti.import(path.join(root, 'lib/dal/workspace-settings.ts'))
  const values = await jiti.import(path.join(root, 'lib/dal/lead-fields.ts'))
  const w = await jiti.import(path.join(root, 'lib/settings/workspace.ts'))
  const f = await jiti.import(path.join(root, 'lib/settings/fields.ts'))
  const pg = await import('pg')
  const sql = new (pg.default || pg).Client({ connectionString: DATABASE_URL }); await sql.connect()
  const one = async (s, p) => (await sql.query(s, p)).rows[0]
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  const { data: u, error: ue } = await db.auth.admin.createUser({ email: `fields-${RUN}@regrow.test`, password: `Fl-Test-${RUN}x9`, email_confirm: true, user_metadata: { full_name: 'Fields Admin' } })
  if (ue) throw ue
  const actor = (await one('SELECT id FROM public.profiles WHERE auth_user_id=$1', [u.user.id])).id

  console.log('P34 — FIELDS ON LEADS AND LOCATIONS')
  const org = (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,'developer') RETURNING id`, [`Fields ${RUN}`, `fl-${RUN}`])).id
  const other = (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,'developer') RETURNING id`, [`Other ${RUN}`, `fl2-${RUN}`])).id
  const lead = async (o) => (await one(`INSERT INTO public.leads (org_id, name, phone, source) VALUES ($1,'Kiran',$2,'website') RETURNING id`, [o, `+9196${Math.floor(Math.random() * 9e7 + 1e7)}`])).id
  const a = await lead(org); const b = await lead(other)

  let defs
  await test('field definitions and locations are saved per workspace, merged with the other sections', async () => {
    const current = await settings.getWorkspaceSettings(org)
    const r = w.normaliseSection('fields', { lead: [{ label: 'Home loan', type: 'choice', options: ['Needed', 'Not needed'] }, { label: 'NRI buyer', type: 'yesno' }] }, current)
    assert.deepEqual(r.errors, {})
    assert.equal(await settings.saveWorkspaceSection(org, actor, 'fields', r.value), true)
    assert.equal(await settings.saveWorkspaceSection(org, actor, 'lists', { locations: ['Whitefield', 'Sarjapur Road'] }), true)
    const s = await settings.getWorkspaceSettings(org)
    defs = s.fields.lead
    assert.deepEqual(defs.map((x) => x.key), ['home_loan', 'nri_buyer'])
    assert.deepEqual(s.lists.locations, ['Whitefield', 'Sarjapur Road'])
    assert.deepEqual((await settings.getWorkspaceSettings(other)).fields.lead, [], 'another workspace has none')
  })

  await test('values are stored on the lead, read through the live-leads view, and recorded on its timeline', async () => {
    const { patch, errors } = f.checkValues(defs, { home_loan: 'needed', nri_buyer: true })
    assert.deepEqual(errors, {})
    const r = await values.saveLeadFieldValues(org, a, actor, patch, { home_loan: 'Home loan', nri_buyer: 'NRI buyer' })
    assert.deepEqual(r, { ok: true, changed: ['home_loan', 'nri_buyer'] })
    assert.deepEqual(await values.getLeadFieldValues(org, a), { home_loan: 'Needed', nri_buyer: true })
    const act = await one(`SELECT type, metadata FROM public.lead_activities WHERE lead_id=$1 AND type='details_updated'`, [a])
    assert.deepEqual(act.metadata.fields, ['Home loan', 'NRI buyer'])
    const again = await values.saveLeadFieldValues(org, a, actor, { home_loan: 'Needed' }, {})
    assert.deepEqual(again.changed, [], 'saving the same value records nothing')
    const cleared = await values.saveLeadFieldValues(org, a, actor, { nri_buyer: null }, {})
    assert.deepEqual(cleared.changed, ['nri_buyer'])
    assert.deepEqual(await values.getLeadFieldValues(org, a), { home_loan: 'Needed' })
  })

  await test('another organisation can neither read nor write a lead’s values', async () => {
    assert.deepEqual(await values.getLeadFieldValues(other, a), {})
    await values.saveLeadFieldValues(other, a, actor, { home_loan: 'Not needed' }, {})
    assert.deepEqual((await one('SELECT field_values FROM public.leads_all WHERE id=$1', [a])).field_values, { home_loan: 'Needed' })
    assert.deepEqual((await one('SELECT field_values FROM public.leads_all WHERE id=$1', [b])).field_values, {})
  })

  await test('the database refuses values that are not an object or are too large', async () => {
    await assert.rejects(sql.query(`UPDATE public.leads SET field_values = '[1]'::jsonb WHERE id=$1`, [a]), /check/i)
    await assert.rejects(sql.query(`UPDATE public.leads SET field_values = jsonb_build_object('t', (SELECT string_agg(md5(i::text), '') FROM generate_series(1, 1000) i)) WHERE id=$1`, [a]), /check/i)
  })

  await test('removing a field keeps what was recorded', async () => {
    const current = await settings.getWorkspaceSettings(org)
    const r = w.normaliseSection('fields', { lead: [{ key: 'nri_buyer', label: 'NRI buyer', type: 'yesno' }] }, current)
    await settings.saveWorkspaceSection(org, actor, 'fields', r.value)
    const s = await settings.getWorkspaceSettings(org)
    assert.deepEqual(s.fields.lead.map((x) => [x.key, x.archived]), [['nri_buyer', false], ['home_loan', true]])
    assert.deepEqual(await values.getLeadFieldValues(org, a), { home_loan: 'Needed' })
  })

  for (const id of [org, other]) await sql.query('DELETE FROM public.org_settings WHERE org_id=$1', [id])
  await sql.end()
  console.log(`\nP34 fields on leads: ${passed} checks passed.`)
}
main().catch((e) => { console.error(e); process.exit(1) })
