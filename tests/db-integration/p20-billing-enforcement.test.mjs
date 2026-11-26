// tests/db-integration/p20-billing-enforcement.test.mjs — trial plans, plan limits, expiry → read-only, payment
// lifting the hold, and the transition for existing workspaces (migration 20260059) against the local Supabase
// stack. REAL database: production SQL, the real billing DAL and signed-in clients. Nothing is mocked.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) { console.error('FATAL: Supabase env required (URL, anon and service keys).'); process.exit(1) }
const RUN = crypto.randomBytes(4).toString('hex')
const PASSWORD = 'Enforce-Test-' + crypto.randomBytes(8).toString('hex')
let passed = 0
async function test(name, fn) { try { await fn(); passed++; console.log(`  ✓ ${name}`) } catch (e) { console.error(`  ✗ ${name}`); throw e } }
class UnusedRealtimeTransport { constructor() { throw new Error('Realtime is not used by these tests') } }
const clientOpts = { auth: { persistSession: false, autoRefreshToken: false }, ...(globalThis.WebSocket ? {} : { realtime: { transport: UnusedRealtimeTransport } }) }

async function main() {
  if (!globalThis.WebSocket) globalThis.WebSocket = class UnusedRealtimeTransport {}
  const jiti = createJiti(import.meta.url, { alias: { '@': root } })
  const billing = await jiti.import(path.join(root, 'lib/dal/billing.ts'))
  const access = await jiti.import(path.join(root, 'lib/billing/access.ts'))
  const inbound = await jiti.import(path.join(root, 'lib/integrations/inbound.ts'))
  const service = createClient(SUPABASE_URL, SERVICE_KEY, clientOpts)
  const pg = await import('pg')
  const Pg = pg.default || pg
  const db = new Pg.Client({ connectionString: DATABASE_URL })
  await db.connect()
  const one = async (s, p) => (await db.query(s, p)).rows[0]
  const authIds = [], orgIds = []

  const mkOrg = async (name, type = 'developer') => {
    const id = (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,$3) RETURNING id`, [`${name} ${RUN}`, `${name.toLowerCase()}-${RUN}`, type])).id
    orgIds.push(id); return id
  }
  const mkUser = async (name) => {
    const email = `${name.toLowerCase()}-${RUN}@repx.test`
    const { data, error } = await service.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } })
    if (error) throw error
    authIds.push(data.user.id)
    return { id: (await one('SELECT id FROM public.profiles WHERE auth_user_id=$1', [data.user.id])).id, email, authId: data.user.id }
  }
  const join = (org, who, role) => db.query(`INSERT INTO public.org_members (org_id, profile_id, role) VALUES ($1,$2,$3)`, [org, who.id, role])
  const signIn = async (who) => { const c = createClient(SUPABASE_URL, ANON_KEY, clientOpts); const r = await c.auth.signInWithPassword({ email: who.email, password: PASSWORD }); assert.ifError(r.error); return c }
  const sub = (org) => one('SELECT * FROM public.org_subscriptions WHERE org_id=$1', [org])
  const ok = (r) => { assert.equal(r.success, true, r.error); return r.data }
  const project = (org, n) => db.query(`INSERT INTO public.projects (org_id, name, slug, city) VALUES ($1,$2,$3,'Pune')`, [org, `P${n}`, `p${n}-${crypto.randomBytes(3).toString('hex')}`])

  console.log('P20 — BILLING ENFORCEMENT (trials, limits, expiry, transition)')
  const dev = await mkOrg('Trialdev'), dev2 = await mkOrg('Seconddev'), agency = await mkOrg('Trialagency', 'channel_partner')
  try {
    const owner = await mkUser('Owner'), mgr = await mkUser('Mgr')
    await join(dev, owner, 'owner'); await join(dev, mgr, 'manager'); await join(dev2, owner, 'owner'); await join(agency, owner, 'owner')

    await test('catalogue: trial plans carry the limits and are never offered for purchase', async () => {
      const rows = (await db.query(`SELECT p.code, v.included_seats, v.max_projects, v.max_inventory_units, v.max_leads, v.trial_days, v.base_price_monthly_cents
        FROM public.subscription_plans p JOIN public.subscription_plan_versions v ON v.plan_id=p.id AND v.is_current WHERE p.code LIKE 'trial_%' ORDER BY p.code`)).rows
      assert.deepEqual(rows.map((r) => [r.code, r.included_seats, r.max_projects, r.max_inventory_units, r.max_leads, r.trial_days, Number(r.base_price_monthly_cents)]),
        [['trial_agency', 5, 5, 500, 1000, 14, 0], ['trial_developer', 5, 5, 500, 1000, 14, 0]])
      assert.deepEqual((await billing.getBillingOverview(dev)).plans.map((p) => p.code), ['leads'])
    })

    await test('trial: 5 seats, 14 days; one per person per type — a second developer workspace gets none, an agency still can', async () => {
      ok(await billing.runBillingAction(dev, owner.id, { action: 'trial', plan: 'leads' }))
      const s = await sub(dev)
      assert.deepEqual([s.status, s.included_seats, Math.round((new Date(s.current_period_end) - Date.now()) / 86_400_000)], ['trial', 5, 14])
      const again = await billing.runBillingAction(dev2, owner.id, { action: 'trial', plan: 'leads' })
      assert.equal(again.success, false); assert.match(again.error, /already used the free trial/i)
      assert.equal(await sub(dev2), undefined, 'nothing was created')
      ok(await billing.runBillingAction(agency, owner.id, { action: 'trial', plan: 'agencies' }))
      const c = await signIn(owner)
      const { data } = await c.from('trial_grants').select('*')
      assert.equal((data ?? []).length, 0, 'trial records are not readable from a browser')
    })

    await test('seats: the trial’s 5 seats include pending invitations', async () => {
      const c = await signIn(owner)
      const inv = (email) => c.rpc('reserve_employee_seat_atomic', { p_org_id: dev, p_email: email, p_role: 'sales_exec', p_expires_at: new Date(Date.now() + 86_400_000).toISOString() })
      for (const x of ['a', 'b', 'c']) {
        const r = await inv(`${x}-${RUN}@repx.test`)
        assert.equal(r.data?.[0]?.success, true, JSON.stringify(r))
      }
      const full = await inv(`d-${RUN}@repx.test`)
      assert.equal(full.data?.[0]?.success, false); assert.match(full.data[0].error_message, /Seat limit reached \(5\/5/)
    })

    await test('limits: 5 projects, then refused — from the server and from a signed-in browser alike', async () => {
      for (let i = 1; i <= 5; i++) await project(dev, i)
      await assert.rejects(project(dev, 6), /plan limit: your plan includes 5 projects/)
      const c = await signIn(owner)
      const { error } = await c.from('projects').insert({ org_id: dev, name: 'Sneaky', slug: `sneaky-${RUN}`, city: 'Pune' })
      assert.ok(error, 'refused'); assert.equal(Number((await one('SELECT count(*) n FROM public.projects WHERE org_id=$1', [dev])).n), 5)
    })

    await test('limits: simultaneous inserts cannot pass the limit (agency, 1 slot left, 6 tries → 1 project)', async () => {
      for (let i = 1; i <= 4; i++) await project(agency, i)
      const clients = await Promise.all(Array.from({ length: 6 }, async () => { const x = new Pg.Client({ connectionString: DATABASE_URL }); await x.connect(); return x }))
      const res = await Promise.allSettled(clients.map((x, i) => x.query(`INSERT INTO public.projects (org_id, name, slug, city) VALUES ($1,$2,$3,'Pune')`, [agency, `R${i}`, `r${i}-${RUN}`])))
      await Promise.all(clients.map((x) => x.end()))
      assert.equal(res.filter((r) => r.status === 'fulfilled').length, 1)
      assert.equal(Number((await one('SELECT count(*) n FROM public.projects WHERE org_id=$1', [agency])).n), 5)
    })

    await test('limits: 500 inventory units — a bulk insert that would pass it is refused as a whole', async () => {
      const proj = (await one('SELECT id FROM public.projects WHERE org_id=$1 LIMIT 1', [dev])).id
      const values = (n, from) => Array.from({ length: n }, (_, i) => `('${dev}','${proj}','U-${from + i}','apartments',1000,'available')`).join(',')
      await db.query(`INSERT INTO public.inventory_items (org_id, project_id, unit_number, category, area_value, status) VALUES ${values(498, 0)}`)
      await assert.rejects(db.query(`INSERT INTO public.inventory_items (org_id, project_id, unit_number, category, area_value, status) VALUES ${values(3, 1000)}`), /plan limit: your plan includes 500 inventory units/)
      assert.equal(Number((await one('SELECT count(*) n FROM public.inventory_items WHERE org_id=$1', [dev])).n), 498)
    })

    await test('limits: 1,000 leads by hand or import; captured enquiries are always saved; a browser cannot fake a capture', async () => {
      const rows = Array.from({ length: 1000 }, (_, i) => `('${dev}','Buyer ${i}','98${String(10000000 + i)}','walk_in','new')`).join(',')
      await db.query(`INSERT INTO public.leads (org_id, name, phone, source, status) VALUES ${rows}`)
      const { error: importErr } = await service.from('leads').insert({ org_id: dev, name: 'Imported', phone: '9899999990', source: 'walk_in', status: 'new' })
      assert.match(importErr?.message ?? '', /plan limit: your plan includes 1000 leads/, 'server-side import stops at the limit')
      const c = await signIn(owner)
      const fake = await c.from('leads').insert({ org_id: dev, name: 'Fake capture', phone: '9899999991', source: 'website', status: 'new', received_at: new Date().toISOString() })
      assert.ok(fake.error, 'a signed-in browser cannot pass the limit by claiming a receipt time')
      const r = await inbound.processInboundLead(dev, { provider: 'website', idempotencyToken: `cap-${RUN}`, name: 'Real enquiry', phone: '9899999992' })
      assert.equal(r.success, true, 'the buyer enquiry is kept')
      assert.equal(Number((await one('SELECT count(*) n FROM public.leads WHERE org_id=$1', [dev])).n), 1001)
      const lim = (await billing.getBillingOverview(dev)).limits.find((l) => l.kind === 'leads')
      assert.deepEqual([lim.used, lim.max], [1001, 1000])
    })

    await test('expiry: a trial past its end → expired, read-only (roles kept aside), billing hold; capture continues', async () => {
      await db.query(`UPDATE public.org_subscriptions SET current_period_end = now() - interval '1 minute' WHERE org_id=$1`, [dev])
      const out = (await one('SELECT public.billing_enforce_periods() r')).r
      assert.ok(out.expired >= 1)
      const s = await sub(dev)
      assert.deepEqual([s.status, s.is_read_only, s.read_only_reason], ['expired', true, 'trial_ended'])
      const o = await one('SELECT lifecycle_state, billing_hold, lifecycle_reason FROM public.organisations WHERE id=$1', [dev])
      assert.deepEqual([o.lifecycle_state, o.billing_hold], ['suspended', true]); assert.match(o.lifecycle_reason, /^billing: /)
      const m = await one('SELECT role, lifecycle_saved_role FROM public.org_members WHERE org_id=$1 AND profile_id=$2', [dev, owner.id])
      assert.deepEqual([m.role, m.lifecycle_saved_role], ['readonly', 'owner'])
      assert.equal(await access.billingRoleFor(dev, owner.id), 'owner', 'the owner can still pay')
      assert.equal(await access.billingRoleFor(dev, mgr.id), null, 'a manager cannot')
      const c = await signIn(mgr)
      const { error } = await c.from('leads').update({ notes: 'x' }).eq('org_id', dev)
      const changed = Number((await one(`SELECT count(*) n FROM public.leads WHERE org_id=$1 AND notes='x'`, [dev])).n)
      assert.ok(error || changed === 0, 'read-only: no changes')
      const r = await inbound.processInboundLead(dev, { provider: 'website', idempotencyToken: `cap2-${RUN}`, name: 'After expiry', phone: '9899999993' })
      assert.equal(r.success, true, 'enquiries are still captured')
      assert.ok(await one(`SELECT 1 FROM public.org_audit_logs WHERE org_id=$1 AND action='billing.subscription_expired'`, [dev]))
      assert.equal((await one('SELECT public.billing_enforce_periods() r')).r.expired, 0, 'running again changes nothing')
    })

    await test('paying lifts the hold: roles restored, limits gone with the paid plan', async () => {
      const invId = (await one(`SELECT public.billing_issue_plan_invoice($1,'leads','monthly',$2) id`, [dev, owner.id])).id
      const inv = await one('SELECT amount_cents FROM public.org_subscription_invoices WHERE id=$1', [invId])
      await db.query(`UPDATE public.org_subscription_invoices SET gateway='razorpay', gateway_order_id=$2, checkout_by=$3 WHERE id=$1`, [invId, `order_${RUN}`, owner.authId])
      const r = (await one(`SELECT public.billing_settle_gateway_payment($1,$2,$3,'INR') r`, [`order_${RUN}`, `pay${RUN}`, inv.amount_cents])).r
      assert.equal(r.status, 'settled')
      const s = await sub(dev)
      assert.deepEqual([s.status, s.is_read_only, s.included_seats], ['active', false, 10])
      const o = await one('SELECT lifecycle_state, billing_hold FROM public.organisations WHERE id=$1', [dev])
      assert.deepEqual([o.lifecycle_state, o.billing_hold], ['active', false])
      assert.equal((await one('SELECT role FROM public.org_members WHERE org_id=$1 AND profile_id=$2', [dev, owner.id])).role, 'owner')
      await project(dev, 3) // no project limit on the paid plan
    })

    await test('paid period over: 7 days "payment overdue" with full access, then read-only', async () => {
      await db.query(`UPDATE public.org_subscriptions SET current_period_end = now() - interval '1 minute' WHERE org_id=$1`, [dev])
      await one('SELECT public.billing_enforce_periods()')
      let s = await sub(dev)
      assert.equal(s.status, 'past_due'); assert.equal(Math.round((new Date(s.grace_period_ends_at) - Date.now()) / 86_400_000), 7)
      assert.equal((await one('SELECT lifecycle_state FROM public.organisations WHERE id=$1', [dev])).lifecycle_state, 'active')
      await db.query(`UPDATE public.org_subscriptions SET grace_period_ends_at = now() - interval '1 minute' WHERE org_id=$1`, [dev])
      await one('SELECT public.billing_enforce_periods()')
      s = await sub(dev)
      assert.deepEqual([s.status, s.read_only_reason], ['expired', 'subscription_expired'])
      assert.equal((await one('SELECT billing_hold FROM public.organisations WHERE id=$1', [dev])).billing_hold, true)
    })

    await test('a suspension by RE staff is never lifted by a payment, and gives no billing access', async () => {
      // Staff take over the held workspace: the hold is cleared, so a later payment does not reopen it.
      await one(`SELECT public.set_organisation_lifecycle($1,'active','restored by staff',NULL,'platform')`, [dev])
      await one(`SELECT public.set_organisation_lifecycle($1,'suspended','policy review',NULL,'platform')`, [dev])
      assert.equal((await one('SELECT billing_hold FROM public.organisations WHERE id=$1', [dev])).billing_hold, false)
      assert.equal(await access.billingRoleFor(dev, owner.id), null)
      await db.query(`UPDATE public.org_subscriptions SET status='active', current_period_end = now() + interval '30 days' WHERE org_id=$1`, [dev])
      assert.equal((await one('SELECT lifecycle_state FROM public.organisations WHERE id=$1', [dev])).lifecycle_state, 'suspended')
      await one(`SELECT public.set_organisation_lifecycle($1,'active','review finished',NULL,'platform')`, [dev])
    })

    await test('transition: an existing workspace with no subscription gets 30 days on its type’s plan, with room for its team', async () => {
      const old = await mkOrg('Legacyco', 'channel_partner')
      for (let i = 0; i < 6; i++) await join(old, await mkUser(`Legacy${i}`), i === 0 ? 'owner' : 'sales_exec')
      const sql = fs.readFileSync(path.join(root, 'supabase/migrations/20260059_billing_enforcement.sql'), 'utf8')
      const section = sql.slice(sql.indexOf('-- ── 8.'), sql.lastIndexOf('COMMIT;'))
      const tx = new Pg.Client({ connectionString: DATABASE_URL }); await tx.connect()
      try {
        await tx.query('BEGIN'); await tx.query(section)
        const s = (await tx.query('SELECT s.*, p.code FROM public.org_subscriptions s JOIN public.subscription_plan_versions v ON v.id=s.plan_version_id JOIN public.subscription_plans p ON p.id=v.plan_id WHERE s.org_id=$1', [old])).rows[0]
        assert.deepEqual([s.code, s.status, s.included_seats, Math.round((new Date(s.current_period_end) - Date.now()) / 86_400_000)], ['agencies', 'trial', 6, 30])
        assert.ok((await tx.query(`SELECT 1 FROM public.org_audit_logs WHERE org_id=$1 AND action='billing.transition_started'`, [old])).rows[0])
      } finally { await tx.query('ROLLBACK'); await tx.end() }
    })

    await test('server-only: a signed-in member cannot run the expiry job or read plan limits', async () => {
      const c = await signIn(owner)
      assert.ok((await c.rpc('billing_enforce_periods', {})).error)
      assert.ok((await c.rpc('plan_limit', { p_org: dev, p_kind: 'leads' })).error)
      assert.ok((await c.rpc('billing_hold_org', { p_org: dev, p_reason: 'x' })).error)
      assert.ok(await one(`SELECT 1 FROM cron.job WHERE jobname='regrow-billing-periods'`), 'scheduled')
    })

    console.log(`\nP20 billing enforcement: ${passed} checks passed.`)
  } finally {
    for (const id of orgIds) {
      for (const t of ['leads', 'inventory_items', 'projects', 'org_invitations', 'org_subscription_payments', 'payment_attempts', 'org_subscription_invoices', 'org_subscriptions', 'org_members']) {
        await db.query(`DELETE FROM public.${t} WHERE org_id=$1`, [id]).catch((e) => console.error('cleanup', t, e.message))
      }
      await db.query('DELETE FROM public.organisations WHERE id=$1', [id]).catch((e) => console.error('cleanup', e.message))
    }
    await db.query('DELETE FROM public.trial_grants WHERE auth_user_id = ANY($1)', [authIds]).catch(() => {})
    for (const id of authIds) await service.auth.admin.deleteUser(id).catch(() => {})
    await db.end()
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
