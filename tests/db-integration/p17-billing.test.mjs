// tests/db-integration/p17-billing.test.mjs — self-serve billing (migration 20260056, lib/dal/billing.ts)
// against the local Supabase stack. Razorpay itself is replaced by a stub fetch: these checks are about what
// REGrow does with an order and a payment, never trusting the browser for amounts.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
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
const PASSWORD = 'Billing-Test-' + crypto.randomBytes(8).toString('hex')
let passed = 0
async function test(name, fn) { try { await fn(); passed++; console.log(`  ✓ ${name}`) } catch (e) { console.error(`  ✗ ${name}`); throw e } }
class UnusedRealtimeTransport { constructor() { throw new Error('Realtime is not used by these tests') } }
const clientOpts = { auth: { persistSession: false, autoRefreshToken: false }, ...(globalThis.WebSocket ? {} : { realtime: { transport: UnusedRealtimeTransport } }) }

async function main() {
  if (!globalThis.WebSocket) globalThis.WebSocket = class UnusedRealtimeTransport {}
  const jiti = createJiti(import.meta.url, { alias: { '@': root } })
  const billing = await jiti.import(path.join(root, 'lib/dal/billing.ts'))
  const service = createClient(SUPABASE_URL, SERVICE_KEY, clientOpts)
  const pg = await import('pg')
  const db = new (pg.default || pg).Client({ connectionString: DATABASE_URL })
  await db.connect()
  const one = async (s, p) => (await db.query(s, p)).rows[0]
  const authIds = []

  // A stub Razorpay: orders get sequential ids; payments are whatever the test registers.
  let orderSeq = 0
  const payments = new Map()
  const fakeFetch = async (url, init) => {
    if (url.endsWith('/orders')) { const b = JSON.parse(init.body); return new Response(JSON.stringify({ id: `order_${RUN}${++orderSeq}`, amount: b.amount, currency: b.currency, status: 'created' }), { status: 200 }) }
    const m = url.match(/\/payments\/(pay_[A-Za-z0-9]+)$/)
    if (m && payments.has(m[1])) return new Response(JSON.stringify(payments.get(m[1])), { status: 200 })
    return new Response(JSON.stringify({ error: { description: 'not found' } }), { status: 404 })
  }
  const cfg = { keyId: 'rzp_test_x', keySecret: 'test-secret', webhookSecret: 'wh' }

  console.log('P17 — SELF-SERVE BILLING')
  const mkOrg = async (name, type = 'developer') => (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,$3) RETURNING id`, [name, `${name.toLowerCase().replace(/\W/g, '-')}-${RUN}`, type])).id
  const org = await mkOrg('Billco'), other = await mkOrg('Otherco'), agency = await mkOrg('Agencyco', 'channel_partner')
  try {
    const { data: u, error } = await service.auth.admin.createUser({ email: `owner-${RUN}@regrow.test`, password: PASSWORD, email_confirm: true, user_metadata: { full_name: 'Bill Owner' } })
    if (error) throw error
    authIds.push(u.user.id)
    const owner = (await one('SELECT id FROM public.profiles WHERE auth_user_id=$1', [u.user.id])).id
    await db.query(`INSERT INTO public.org_members (org_id, profile_id, role) VALUES ($1,$2,'owner')`, [org, owner])
    const sub = () => one('SELECT * FROM public.org_subscriptions WHERE org_id=$1', [org])
    const inv = (id) => one('SELECT * FROM public.org_subscription_invoices WHERE id=$1', [id])

    await test('catalogue: a developer sees REGrow Leads, an agency REGrow for Agencies, at the published prices', async () => {
      const dev = (await billing.getBillingOverview(org)).plans
      assert.deepEqual(dev.map((p) => [p.code, p.includedSeats, p.monthlyPaise, p.annualPaise, p.seatPaise]), [['leads', 10, 1200000, 12000000, 90000]])
      const cp = (await billing.getBillingOverview(agency)).plans
      assert.deepEqual(cp.map((p) => [p.code, p.includedSeats, p.monthlyPaise, p.annualPaise, p.seatPaise]), [['agencies', 5, 499900, 4999000, 60000]])
      const wrong = await billing.runBillingAction(org, owner, { action: 'trial', plan: 'agencies' })
      assert.equal(wrong.success, false, 'a developer cannot buy the agency plan')
    })

    await test('trial: 14 days, the trial plan’s 5 seats (DEC-022), once only', async () => {
      assert.equal((await billing.runBillingAction(org, owner, { action: 'trial', plan: 'leads' })).success, true)
      const s = await sub()
      assert.equal(s.status, 'trial'); assert.equal(s.included_seats, 5)
      const days = Math.round((new Date(s.current_period_end) - Date.now()) / 86_400_000)
      assert.equal(days, 14)
      const again = await billing.runBillingAction(org, owner, { action: 'trial', plan: 'leads' })
      assert.deepEqual([again.success, again.status], [false, 409])
      assert.ok((await one(`SELECT 1 FROM public.org_audit_logs WHERE org_id=$1 AND action='billing.trial_started'`, [org])), 'audited')
    })

    let planInvoice
    await test('choosing a plan issues one invoice with 18% GST; choosing again voids the earlier one', async () => {
      const first = await billing.runBillingAction(org, owner, { action: 'plan', plan: 'leads', cycle: 'monthly' })
      const second = await billing.runBillingAction(org, owner, { action: 'plan', plan: 'leads', cycle: 'annual' })
      planInvoice = second.data.id
      assert.equal((await inv(first.data.id)).status, 'void')
      const i = await inv(planInvoice)
      assert.deepEqual([Number(i.subtotal_cents), Number(i.tax_cents), Number(i.amount_cents), i.status, i.billing_cycle], [12000000, 2160000, 14160000, 'issued', 'annual'])
      assert.equal((await sub()).status, 'trial', 'the trial keeps running until payment')
    })

    let orderId
    await test('checkout: an order for the invoice amount, reused on retry; another organisation cannot check it out', async () => {
      const a = await billing.checkoutForInvoice(cfg, org, planInvoice, u.user.id, fakeFetch)
      const b = await billing.checkoutForInvoice(cfg, org, planInvoice, u.user.id, fakeFetch)
      assert.equal(a.data.amountPaise, 14160000)
      assert.equal(a.data.orderId, b.data.orderId, 'same order reused')
      orderId = a.data.orderId
      const cross = await billing.checkoutForInvoice(cfg, other, planInvoice, u.user.id, fakeFetch)
      assert.deepEqual([cross.success, cross.status], [false, 404])
    })

    await test('confirming: wrong order, unpaid or authorised-only payments never settle', async () => {
      payments.set('pay_wrong', { id: 'pay_wrong', order_id: 'order_someoneelse', amount: 14160000, currency: 'INR', status: 'captured' })
      assert.deepEqual(((r) => [r.success, r.status])(await billing.confirmCheckout(cfg, org, orderId, 'pay_wrong', fakeFetch)), [false, 400])
      payments.set('pay_auth', { id: 'pay_auth', order_id: orderId, amount: 14160000, currency: 'INR', status: 'authorized' })
      assert.equal((await billing.confirmCheckout(cfg, org, orderId, 'pay_auth', fakeFetch)).data.status, 'pending')
      payments.set('pay_fail', { id: 'pay_fail', order_id: orderId, amount: 14160000, currency: 'INR', status: 'failed' })
      assert.equal((await billing.confirmCheckout(cfg, org, orderId, 'pay_fail', fakeFetch)).status, 402)
      assert.equal((await billing.confirmCheckout(cfg, other, orderId, 'pay_auth', fakeFetch)).status, 404, 'another organisation')
      assert.equal((await inv(planInvoice)).status, 'issued')
    })

    await test('the amount must equal the invoice: an underpayment is refused', async () => {
      const r = await billing.settlePayment(orderId, 'pay_short', 100, 'INR')
      assert.deepEqual([r.success, r.status], [false, 409])
      assert.equal((await inv(planInvoice)).status, 'issued')
    })

    await test('paying activates the plan for a year; the same payment again changes nothing; a second payment is refused', async () => {
      payments.set('pay_good', { id: 'pay_good', order_id: orderId, amount: 14160000, currency: 'INR', status: 'captured' })
      const r = await billing.confirmCheckout(cfg, org, orderId, 'pay_good', fakeFetch)
      assert.equal(r.data.status, 'settled')
      const s = await sub()
      assert.deepEqual([s.status, s.billing_cycle, s.included_seats, Number(s.contracted_base_price_cents)], ['active', 'annual', 10, 12000000])
      assert.equal(Math.round((new Date(s.current_period_end) - Date.now()) / 86_400_000), 365)
      assert.equal((await billing.settlePayment(orderId, 'pay_good', 14160000, 'INR')).data.status, 'already_settled', 'webhook after the browser')
      assert.equal(Number((await one('SELECT count(*) n FROM public.org_subscription_payments WHERE invoice_id=$1', [planInvoice])).n), 1)
      assert.equal((await billing.settlePayment(orderId, 'pay_other', 14160000, 'INR')).success, false, 'a second, different payment')
      assert.equal((await sub()).current_period_end.getTime(), s.current_period_end.getTime())
      assert.ok(await one(`SELECT 1 FROM public.org_audit_logs WHERE org_id=$1 AND action='billing.payment_received'`, [org]))
    })

    await test('an active plan: no second plan invoice; seats for the rest of the period; renewal only in its window', async () => {
      assert.equal((await billing.runBillingAction(org, owner, { action: 'plan', plan: 'leads', cycle: 'monthly' })).status, 409)
      const seats = await billing.runBillingAction(org, owner, { action: 'seats', seats: 2 })
      const si = await inv(seats.data.id)
      assert.equal(Number(si.unit_price_cents), 900000, 'annual seat price = 10 × monthly')
      assert.ok(Math.abs(Number(si.subtotal_cents) - 1800000) <= 100, `two seats, a full year left: ${si.subtotal_cents}`)
      const renew = await billing.runBillingAction(org, owner, { action: 'renewal' })
      assert.deepEqual([renew.success, renew.status], [false, 409], 'not yet: the period ends in a year')
      // Pay for the seats, then move the period end inside the window and renew.
      const co = await billing.checkoutForInvoice(cfg, org, seats.data.id, u.user.id, fakeFetch)
      assert.equal((await billing.settlePayment(co.data.orderId, 'pay_seats', Number(si.amount_cents), 'INR')).data.status, 'settled')
      assert.equal((await sub()).additional_seats, 2)
      await db.query(`UPDATE public.org_subscriptions SET current_period_end = now() + interval '10 days' WHERE org_id=$1`, [org])
      const r2 = await billing.runBillingAction(org, owner, { action: 'renewal' })
      const ri = await inv(r2.data.id)
      assert.equal(Number(ri.subtotal_cents), 12000000 + 2 * 900000, 'plan + the two extra seats for a year')
      assert.equal((await billing.runBillingAction(org, owner, { action: 'renewal' })).data.id, r2.data.id, 'one open renewal at a time')
      const co2 = await billing.checkoutForInvoice(cfg, org, r2.data.id, u.user.id, fakeFetch)
      const before = (await sub()).current_period_end
      await billing.settlePayment(co2.data.orderId, 'pay_renew', Number(ri.amount_cents), 'INR')
      const after = (await sub()).current_period_end
      assert.equal(Math.round((after - before) / 86_400_000), 365, 'renewal extends from the old end, not from today')
    })

    await test('billing functions are server-only: a signed-in member cannot call them directly', async () => {
      const c = createClient(SUPABASE_URL, ANON_KEY, clientOpts)
      await c.auth.signInWithPassword({ email: `owner-${RUN}@regrow.test`, password: PASSWORD })
      const r = await c.rpc('billing_settle_gateway_payment', { p_order_id: orderId, p_payment_id: 'pay_x', p_amount_cents: 1, p_currency: 'INR' })
      assert.ok(r.error, 'settle refused')
      const t = await c.rpc('billing_issue_plan_invoice', { p_org: other, p_plan_code: 'leads', p_cycle: 'monthly', p_actor_profile: owner })
      assert.ok(t.error, 'issue refused')
      const read = await c.from('org_subscription_invoices').select('id').eq('org_id', org)
      assert.deepEqual(read.data ?? [], [], 'invoices are read through the server only')
    })

    await test('fixes: free-tier provisioning uses the allowed status; team checks answer only for your own organisation', async () => {
      const def = (await one(`SELECT pg_get_functiondef('public.provision_organisation_atomic'::regproc) d`)).d
      assert.ok(!def.includes("'trialing'") && def.includes("v_initial_sub_status := 'trial'"))
      const c = createClient(SUPABASE_URL, ANON_KEY, clientOpts)
      await c.auth.signInWithPassword({ email: `owner-${RUN}@regrow.test`, password: PASSWORD })
      const r = await c.rpc('auth_shares_team', { p_org: other, p_a: owner, p_b: owner })
      assert.equal(r.data, false)
    })

    console.log(`\nP17 billing: ${passed} checks passed.`)
  } finally {
    for (const id of [org, other, agency]) {
      await db.query('DELETE FROM public.unapplied_payments WHERE org_id=$1', [id]).catch(() => {})
      await db.query('DELETE FROM public.org_subscription_payments WHERE org_id=$1', [id]).catch(() => {})
      await db.query('DELETE FROM public.payment_attempts WHERE org_id=$1', [id]).catch(() => {})
      await db.query('DELETE FROM public.org_subscription_invoices WHERE org_id=$1', [id]).catch(() => {})
      await db.query('DELETE FROM public.org_subscriptions WHERE org_id=$1', [id]).catch(() => {})
      await db.query('DELETE FROM public.org_members WHERE org_id=$1', [id]).catch(() => {})
      await db.query('DELETE FROM public.organisations WHERE id=$1', [id]).catch((e) => console.error('cleanup', e.message))
    }
    for (const id of authIds) await service.auth.admin.deleteUser(id).catch(() => {})
    await db.end()
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
