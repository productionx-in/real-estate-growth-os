// tests/db-integration/p33-workspace-settings.test.mjs — workspace settings (migration 20260074,
// lib/dal/workspace-settings.ts) against the local Supabase stack: settings per organisation, the close reason on
// leads (through the live-leads view), and hold expiry with automatic release.
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
  const dal = await jiti.import(path.join(root, 'lib/dal/workspace-settings.ts'))
  const { DEFAULT_SETTINGS } = await jiti.import(path.join(root, 'lib/settings/workspace.ts'))
  const pg = await import('pg')
  const sql = new (pg.default || pg).Client({ connectionString: DATABASE_URL }); await sql.connect()
  const one = async (s, p) => (await sql.query(s, p)).rows[0]
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  const { data: u, error: ue } = await db.auth.admin.createUser({ email: `ws-${RUN}@regrow.test`, password: `Ws-Test-${RUN}x9`, email_confirm: true, user_metadata: { full_name: 'Settings Owner' } })
  if (ue) throw ue
  const actor = (await one('SELECT id FROM public.profiles WHERE auth_user_id=$1', [u.user.id])).id

  console.log('P33 — WORKSPACE SETTINGS')
  const org = (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,'developer') RETURNING id`, [`Settings ${RUN}`, `ws-${RUN}`])).id
  const other = (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,'developer') RETURNING id`, [`Other ${RUN}`, `ws2-${RUN}`])).id
  await sql.query(`INSERT INTO public.org_members (org_id, profile_id, role, status) VALUES ($1,$2,'owner','active'),($3,$2,'owner','active')`, [org, actor, other])
  const project = (await one(`INSERT INTO public.projects (org_id, name, slug) VALUES ($1,'Hold Tower',$2) RETURNING id`, [org, `ht-${RUN}`])).id
  const otherProject = (await one(`INSERT INTO public.projects (org_id, name, slug) VALUES ($1,'Elsewhere',$2) RETURNING id`, [other, `el-${RUN}`])).id
  const unit = async (o, p, n) => (await one(`INSERT INTO public.inventory_items (org_id, project_id, unit_number, category, area_value, bhk_config, total_price, status)
    VALUES ($1,$2,$3,'apartments',1000,'2BHK',9000000,'available') RETURNING id`, [o, p, n])).id
  const hold = async (id) => {
    const { data, error } = await db.rpc('transition_inventory_status_atomic', { p_inventory_id: id, p_expected_status: 'available', p_new_status: 'on_hold', p_changed_by: actor, p_reason: 'Buyer deciding' })
    if (error) throw error
    return data
  }

  await test('a workspace with nothing saved gets the defaults; saving one section leaves the other alone', async () => {
    assert.deepEqual(await dal.getWorkspaceSettings(org), DEFAULT_SETTINGS)
    assert.equal(await dal.saveWorkspaceSection(org, actor, 'inventory', { holdHours: 24 }), true)
    assert.equal(await dal.saveWorkspaceSection(org, actor, 'leads', { ...DEFAULT_SETTINGS.leads, lostReasons: ['Price', 'Location'] }), true)
    const s = await dal.getWorkspaceSettings(org)
    assert.equal(s.inventory.holdHours, 24); assert.deepEqual(s.leads.lostReasons, ['Price', 'Location'])
  })

  await test('settings belong to one organisation', async () => {
    assert.deepEqual(await dal.getWorkspaceSettings(other), DEFAULT_SETTINGS)
  })

  await test('clients can neither read nor write the settings table', async () => {
    for (const role of ['anon', 'authenticated']) {
      await sql.query('BEGIN')
      try {
        await sql.query(`SET LOCAL ROLE ${role}`)
        for (const q of ['SELECT * FROM public.org_settings', `INSERT INTO public.org_settings (org_id) VALUES ('${other}')`, `UPDATE public.org_settings SET inventory='{}'`]) {
          await sql.query('SAVEPOINT s'); await assert.rejects(sql.query(q), /permission denied/, `${role}: ${q}`); await sql.query('ROLLBACK TO SAVEPOINT s')
        }
      } finally { await sql.query('ROLLBACK') }
    }
    for (const f of ['release_expired_holds()', 'inventory_set_hold_expiry()']) {
      const r = await one(`SELECT has_function_privilege('authenticated', 'public.${f}', 'EXECUTE') a, has_function_privilege('anon', 'public.${f}', 'EXECUTE') b`)
      assert.deepEqual([r.a, r.b], [false, false], f)
    }
  })

  await test('a hold gets an end time from the workspace’s setting; another workspace’s holds do not', async () => {
    const a = await unit(org, project, `A-${RUN}`); const b = await unit(other, otherProject, `B-${RUN}`)
    await hold(a); await hold(b)
    const ra = await one(`SELECT held_until > now() + interval '23 hours' AND held_until < now() + interval '25 hours' ok FROM public.inventory_items WHERE id=$1`, [a])
    assert.equal(ra.ok, true)
    assert.equal((await one('SELECT held_until FROM public.inventory_items WHERE id=$1', [b])).held_until, null)
  })

  await test('an expired hold goes back to Available, recorded against the person who placed it; others are untouched', async () => {
    const expired = await unit(org, project, `E-${RUN}`); const live = await unit(org, project, `L-${RUN}`)
    await hold(expired); await hold(live)
    await sql.query(`UPDATE public.inventory_items SET held_until = now() - interval '1 minute' WHERE id=$1`, [expired])
    assert.ok(Number((await one('SELECT public.release_expired_holds() n')).n) >= 1)
    const e = await one('SELECT status, held_until FROM public.inventory_items WHERE id=$1', [expired])
    assert.deepEqual([e.status, e.held_until], ['available', null])
    const h = await one(`SELECT changed_by, reason, metadata->>'automatic' auto FROM public.inventory_status_history WHERE inventory_id=$1 ORDER BY created_at DESC LIMIT 1`, [expired])
    assert.deepEqual([h.changed_by, h.reason, h.auto], [actor, 'Hold expired', 'true'])
    assert.equal((await one('SELECT status FROM public.inventory_items WHERE id=$1', [live])).status, 'on_hold')
  })

  await test('booking a held unit clears its hold end', async () => {
    const id = await unit(org, project, `K-${RUN}`); await hold(id)
    const { error } = await db.rpc('transition_inventory_status_atomic', { p_inventory_id: id, p_expected_status: 'on_hold', p_new_status: 'booked', p_changed_by: actor, p_reason: 'Booked' })
    assert.equal(error, null, error?.message)
    assert.equal((await one('SELECT held_until FROM public.inventory_items WHERE id=$1', [id])).held_until, null)
  })

  await test('a close reason is stored on the lead and read back through the live-leads view', async () => {
    const lead = (await one(`INSERT INTO public.leads (org_id, project_id, name, phone, source, status) VALUES ($1,$2,'Meera',$3,'website','qualified') RETURNING id`, [org, project, `+9197${Math.floor(Math.random() * 9e7 + 1e7)}`])).id
    const { error } = await db.from('leads').update({ status: 'lost', closed_reason: 'Price' }).eq('id', lead)
    assert.equal(error, null, error?.message)
    const { data } = await db.from('leads').select('status, closed_reason').eq('id', lead).single()
    assert.deepEqual(data, { status: 'lost', closed_reason: 'Price' })
    await assert.rejects(sql.query(`UPDATE public.leads SET closed_reason = '' WHERE id=$1`, [lead]), /check/i)
  })

  for (const id of [org, other]) await sql.query('DELETE FROM public.org_settings WHERE org_id=$1', [id])
  await sql.end()
  console.log(`\nP33 workspace settings: ${passed} checks passed.`)
}
main().catch((e) => { console.error(e); process.exit(1) })
