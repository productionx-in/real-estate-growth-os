// tests/db-integration/p38-team-targets.test.mjs — monthly targets and progress (migration 20260078, lib/dal/team.ts)
// against the local Supabase stack.
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
  const team = await jiti.import(path.join(root, 'lib/dal/team.ts'))
  const { monthKey } = await jiti.import(path.join(root, 'lib/team/targets.ts'))
  const pg = await import('pg')
  const db = new (pg.default || pg).Client({ connectionString: DATABASE_URL }); await db.connect()
  const one = async (s, p) => (await db.query(s, p)).rows[0]
  const mkProfile = async (n) => {
    const id = crypto.randomUUID()
    await db.query(`INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, last_sign_in_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
      VALUES ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),now() - interval '2 days',now(),now(),'{}',$3)`, [id, `${n}-${RUN}@regrow.test`, JSON.stringify({ full_name: n })])
    return { auth: id, profile: (await one('SELECT id FROM public.profiles WHERE auth_user_id=$1', [id])).id }
  }

  console.log('P38 — TEAM TARGETS')
  const org = (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,'developer') RETURNING id`, [`T ${RUN}`, `t-${RUN}`])).id
  const other = (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,'developer') RETURNING id`, [`T2 ${RUN}`, `t2-${RUN}`])).id
  const asha = await mkProfile('asha'); const outsider = await mkProfile('outsider')
  await db.query(`INSERT INTO public.org_members (org_id, profile_id, role) VALUES ($1,$2,'sales_exec')`, [org, asha.profile])
  await db.query(`INSERT INTO public.org_members (org_id, profile_id, role) VALUES ($1,$2,'sales_exec')`, [other, outsider.profile])
  const month = monthKey()

  await test('targets are saved per person and month; all blank removes them', async () => {
    assert.equal(await team.saveTargets(org, asha.profile, month, { siteVisits: 10, bookings: 2, bookingValue: 20000000 }, asha.profile), true)
    assert.deepEqual((await team.listTargets(org, month)).get(asha.profile), { siteVisits: 10, bookings: 2, bookingValue: 20000000 })
    assert.equal((await team.listTargets(other, month)).size, 0, 'another workspace sees none')
    await team.saveTargets(org, asha.profile, month, { siteVisits: null, bookings: null, bookingValue: null }, asha.profile)
    assert.equal((await team.listTargets(org, month)).size, 0)
  })

  await test('the database refuses a target for someone outside the workspace, and a month that is not a first day', async () => {
    await assert.rejects(db.query(`INSERT INTO public.member_targets (org_id, profile_id, month, bookings) VALUES ($1,$2,$3,1)`, [org, outsider.profile, month]), /not a member/)
    await assert.rejects(db.query(`INSERT INTO public.member_targets (org_id, profile_id, month, bookings) VALUES ($1,$2,'2026-11-15',1)`, [org, asha.profile]), /check/i)
  })

  await test('progress: completed visits this month for the visit owner; bookings for whoever owns the lead; cancelled ones do not count', async () => {
    const p = (await one(`INSERT INTO public.projects (org_id, name, slug) VALUES ($1,'P',$2) RETURNING id`, [org, `p-${RUN}`])).id
    const lead = (await one(`INSERT INTO public.leads (org_id, name, phone, source, assigned_to) VALUES ($1,'L','9876500002','website',$2) RETURNING id`, [org, asha.profile])).id
    await db.query(`INSERT INTO public.site_visits (org_id, lead_id, project_id, assigned_to, scheduled_at, status, completed_at) VALUES ($1,$2,$3,$4, now() - interval '1 hour','completed', now())`, [org, lead, p, asha.profile]).catch(async () => {
      // Visits may need to be booked in the future; book, then complete.
      const v = (await one(`INSERT INTO public.site_visits (org_id, lead_id, project_id, assigned_to, scheduled_at) VALUES ($1,$2,$3,$4, now() + interval '1 hour') RETURNING id`, [org, lead, p, asha.profile])).id
      await db.query(`UPDATE public.site_visits SET status='completed', completed_at=now() WHERE id=$1`, [v])
    })
    const unit = async (n) => (await one(`INSERT INTO public.inventory_items (org_id, project_id, unit_number, category, area_value, bhk_config, total_price, status) VALUES ($1,$2,$3,'apartments',1000,'2BHK',9000000,'available') RETURNING id`, [org, p, n])).id
    await db.query(`INSERT INTO public.bookings (org_id, project_id, inventory_id, lead_id, booking_number, base_price, total_amount, status) VALUES
      ($1,$2,$3,$4,$5,9000000,9500000,'confirmed'),($1,$2,$6,$4,$7,9000000,8000000,'cancelled')`, [org, p, await unit(`A-${RUN}`), lead, `B1-${RUN}`, await unit(`B-${RUN}`), `B2-${RUN}`])
    const prog = (await team.monthProgress(org, month)).get(asha.profile)
    assert.equal(prog.siteVisits >= 1, true)
    assert.deepEqual([prog.bookings, prog.bookingValue], [1, 9500000])
    assert.equal((await team.monthProgress(other, month)).size, 0)
  })

  await test('e-mail and last sign-in come from the account itself (looked up per member)', async () => {
    // A real account, created the way sign-up does (raw SQL rows lack fields the auth service needs).
    const { createClient } = await import('@supabase/supabase-js')
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } }).auth.admin
    const { data, error } = await admin.createUser({ email: `signin-${RUN}@regrow.test`, password: `Si-Test-${RUN}x9!`, email_confirm: true })
    if (error) throw error
    await db.query(`UPDATE auth.users SET last_sign_in_at = now() - interval '2 days' WHERE id=$1`, [data.user.id])
    const d = await team.authDetails([data.user.id, crypto.randomUUID()])
    assert.equal(d.get(data.user.id).email, `signin-${RUN}@regrow.test`)
    assert.ok(d.get(data.user.id).lastSignInAt)
    assert.equal(d.size, 1, 'an unknown id is simply skipped')
  })

  await db.end()
  console.log(`\nP38 team targets: ${passed} checks passed.`)
}
main().catch((e) => { console.error(e); process.exit(1) })
