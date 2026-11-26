// tests/db-integration/p22-payments.test.mjs — provider-independent payments (migration 20260060, lib/payments/*)
// against the local Supabase stack. Razorpay and Cashfree are replaced by fake servers built from their published
// API shapes (tests/fixtures/cashfree.mjs); everything RE by PX does with them runs for real: checkout attempts,
// confirmations, signed webhooks, idempotency, unapplied money, provider switching, refunds with approvals, credit
// notes, disputes, reconciliation, health, verified outages, GST split and UPI AutoPay mandates.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { createJiti } from 'jiti'
import { CF_SECRET, disputeWebhook, fakeCashfree, paymentWebhook, refundWebhook, signCashfree, subscriptionPaymentWebhook, subscriptionWebhook } from '../fixtures/cashfree.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) { console.error('FATAL: Supabase env required (URL, anon and service keys).'); process.exit(1) }
const RUN = crypto.randomBytes(4).toString('hex')
const PASSWORD = 'Pay-Test-' + crypto.randomBytes(8).toString('hex')
let passed = 0
async function test(name, fn) { try { await fn(); passed++; console.log(`  ✓ ${name}`) } catch (e) { console.error(`  ✗ ${name}`); throw e } }
class UnusedRealtimeTransport { constructor() { throw new Error('Realtime is not used by these tests') } }
const clientOpts = { auth: { persistSession: false, autoRefreshToken: false }, ...(globalThis.WebSocket ? {} : { realtime: { transport: UnusedRealtimeTransport } }) }

// ── Fake Razorpay (orders, order payments, refunds, settlements) ──────────────────────────────────
function fakeRazorpay() {
  const state = { orders: new Map(), refunds: [], settlements: [], calls: [], down: false, seq: 0 }
  const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s })
  async function fetchImpl(url, init = {}) {
    const p = new URL(url).pathname.replace(/^\/v1/, '')
    state.calls.push({ method: init.method ?? 'GET', path: p })
    if (state.down) throw new TypeError('fetch failed (simulated outage)')
    let m
    if (p === '/orders' && init.method === 'POST') { const b = JSON.parse(init.body); const id = `order_${RUN}${++state.seq}`; state.orders.set(id, { amount: b.amount, payments: [] }); return json({ id, amount: b.amount, currency: b.currency, status: 'created' }) }
    if (p === '/orders' || p.startsWith('/orders?')) return json({ items: [] })
    if ((m = p.match(/^\/orders\/(order_[A-Za-z0-9]+)\/payments$/))) return json({ items: (state.orders.get(m[1])?.payments ?? []).map((x) => ({ order_id: m[1], currency: 'INR', ...x })) })
    if ((m = p.match(/^\/payments\/(pay_[A-Za-z0-9]+)\/refund$/))) { const b = JSON.parse(init.body); const r = { id: `rfnd_${state.refunds.length + 1}`, payment_id: m[1], amount: b.amount, status: 'pending', notes: b.notes }; state.refunds.push(r); return json(r) }
    if (p.startsWith('/settlements/recon/combined')) return json({ items: state.settlements })
    return json({ error: { description: 'not found' } }, 404)
  }
  return { state, fetchImpl }
}

async function main() {
  if (!globalThis.WebSocket) globalThis.WebSocket = class UnusedRealtimeTransport {}
  const jiti = createJiti(import.meta.url, { alias: { '@': root } })
  const svc = await jiti.import(path.join(root, 'lib/payments/service.ts'))
  const mandates = await jiti.import(path.join(root, 'lib/payments/mandates.ts'))
  const { razorpayAdapter } = await jiti.import(path.join(root, 'lib/payments/razorpay/adapter.ts'))
  const { cashfreeAdapter } = await jiti.import(path.join(root, 'lib/payments/cashfree/adapter.ts'))
  const db = createClient(SUPABASE_URL, SERVICE_KEY, clientOpts)
  const pg = await import('pg')
  const sql = new (pg.default || pg).Client({ connectionString: DATABASE_URL })
  await sql.connect()
  const one = async (s, p) => (await sql.query(s, p)).rows[0]
  const count = async (s, p) => Number((await one(s, p)).n)

  const rz = fakeRazorpay(), cf = fakeCashfree()
  const RZ = { keyId: 'rzp_test_regrow', keySecret: 'rz_key_secret', webhookSecret: 'rz_webhook_secret' }
  const rzA = razorpayAdapter(RZ, rz.fetchImpl)
  const cfA = cashfreeAdapter({ appId: 'cf_app', secretKey: CF_SECRET, mode: 'sandbox' }, cf.fetchImpl)
  const resolver = { environment: 'test', get: (code, env = 'test') => (env !== 'test' ? null : code === 'razorpay' ? rzA : code === 'cashfree' ? cfA : null) }
  const rzWebhook = (event, id) => { const body = JSON.stringify(event); return [body, new Headers({ 'x-razorpay-signature': crypto.createHmac('sha256', RZ.webhookSecret).update(body).digest('hex'), 'x-razorpay-event-id': id })] }
  const cfHook = (body, ts) => svc.handleWebhook(db, cfA, body, new Headers(signCashfree(body, ts)))

  // Restore the seeded gateway state at the end (the local database is shared by other suites).
  const gatewaysBefore = (await sql.query('SELECT provider, environment, status, is_primary FROM public.payment_gateway_configs')).rows
  const settingsBefore = await one('SELECT * FROM public.billing_settings')

  const users = [], orgs = []
  const mkUser = async (label) => {
    const { data, error } = await db.auth.admin.createUser({ email: `${label}-${RUN}@repx.test`, password: PASSWORD, email_confirm: true, user_metadata: { full_name: label } })
    if (error) throw error
    users.push(data.user.id)
    return { id: data.user.id, profile: (await one('SELECT id FROM public.profiles WHERE auth_user_id=$1', [data.user.id])).id, email: data.user.email }
  }
  const staff = async (label, role) => { const u = await mkUser(label); await sql.query('INSERT INTO public.platform_users (user_id, role) VALUES ($1,$2)', [u.id, role]); return u }
  const owner = await mkUser('owner')
  await sql.query('UPDATE public.profiles SET phone = $1 WHERE id = $2', ['+919000000001', owner.profile])
  const mkOrg = async (name) => {
    const id = (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,'developer') RETURNING id`, [name, `${name.toLowerCase()}-${RUN}`])).id
    orgs.push(id)
    await sql.query(`INSERT INTO public.org_members (org_id, profile_id, role) VALUES ($1,$2,'owner')`, [id, owner.profile])
    return id
  }
  const planInvoice = async (org) => (await one(`SELECT public.billing_issue_plan_invoice($1, 'leads', 'monthly', $2) AS id`, [org, owner.profile])).id
  const inv = (id) => one('SELECT * FROM public.org_subscription_invoices WHERE id=$1', [id])
  const sub = (org) => one('SELECT * FROM public.org_subscriptions WHERE org_id=$1', [org])
  const rpc = async (fn, args) => { const { data, error } = await db.rpc(fn, args); if (error) throw new Error(error.message); return data }
  const rpcErr = async (fn, args) => (await db.rpc(fn, args)).error?.message ?? null
  const doCheckout = (org, invoice) => svc.checkout(db, resolver, { orgId: org, invoiceId: invoice, userId: owner.id, customer: { email: owner.email, phone: '+919000000001', name: 'Owner' } })

  console.log('P22 — PAYMENTS')
  const platformOwner = await staff('platform-owner', 'super_admin')
  const financeA = await staff('finance-a', 'finance_admin')
  const financeB = await staff('finance-b', 'finance_admin')
  const support = await staff('support', 'support_agent')
  try {
    await test('security: customers and anonymous callers cannot read payment tables or call payment functions', async () => {
      const c = createClient(SUPABASE_URL, ANON_KEY, clientOpts)
      for (const t of ['payment_attempts', 'payment_webhook_events', 'payment_refunds', 'unapplied_payments', 'payment_gateway_configs', 'payment_mandates', 'credit_notes', 'billing_settings']) {
        const r = await c.from(t).select('*').limit(1)
        assert.ok(r.error || (r.data ?? []).length === 0, `anon read ${t}`)
      }
      await c.auth.signInWithPassword({ email: owner.email, password: PASSWORD })
      for (const t of ['payment_attempts', 'payment_refunds', 'payment_gateway_configs']) assert.deepEqual((await c.from(t).select('id').limit(1)).data ?? [], [], `member read ${t}`)
      assert.ok((await c.rpc('payment_gateway_set_primary', { p_actor: owner.id, p_provider: 'cashfree', p_env: 'test', p_note: 'x' })).error, 'member cannot switch gateway')
      assert.ok((await c.rpc('billing_settle_payment', { p_provider: 'razorpay', p_env: 'test', p_order_id: 'o', p_payment_id: 'p', p_amount_cents: 1, p_currency: 'INR' })).error, 'member cannot settle')
    })

    await test('historical records preserved: seeded gateways (Razorpay primary), legacy order adopted on settlement', async () => {
      assert.deepEqual(gatewaysBefore.filter((g) => g.is_primary).map((g) => g.provider).sort(), ['razorpay', 'razorpay'])
      // A Razorpay order created before payment attempts existed (only on the invoice) still settles.
      const org = await mkOrg('Legacyco'), i = await planInvoice(org)
      await sql.query(`UPDATE public.org_subscription_invoices SET gateway='razorpay', gateway_order_id=$2, checkout_by=$3, payment_environment='test' WHERE id=$1`, [i, `order_legacy${RUN}`, owner.id])
      const r = await rpc('billing_settle_gateway_payment', { p_order_id: `order_legacy${RUN}`, p_payment_id: `pay_legacy${RUN}`, p_amount_cents: 1416000, p_currency: 'INR' })
      assert.equal(r.status, 'settled')
      const p = await one('SELECT * FROM public.org_subscription_payments WHERE invoice_id=$1', [i])
      assert.deepEqual([p.payment_reference, p.provider, p.environment, p.provider_payment_id], [`razorpay:pay_legacy${RUN}`, 'razorpay', 'test', `pay_legacy${RUN}`])
      assert.equal(await count('SELECT count(*) n FROM public.payment_attempts WHERE invoice_id=$1', [i]), 1, 'attempt recorded for the legacy order')
    })

    await test('gateway control: only the Platform Owner; live needs a validated sandbox; one primary per environment', async () => {
      assert.match(await rpcErr('payment_gateway_set_status', { p_actor: financeA.id, p_provider: 'cashfree', p_env: 'test', p_status: 'enabled', p_note: 'try' }), /not permitted/)
      assert.match(await rpcErr('payment_gateway_set_status', { p_actor: support.id, p_provider: 'cashfree', p_env: 'test', p_status: 'enabled', p_note: 'try' }), /not permitted/)
      assert.match(await rpcErr('payment_gateway_set_status', { p_actor: platformOwner.id, p_provider: 'cashfree', p_env: 'live', p_status: 'enabled', p_note: 'too early' }), /validate the sandbox/)
      assert.match(await rpcErr('payment_gateway_set_primary', { p_actor: platformOwner.id, p_provider: 'cashfree', p_env: 'test', p_note: 'not enabled yet' }), /enable the gateway/)
      await rpc('payment_gateway_set_status', { p_actor: platformOwner.id, p_provider: 'cashfree', p_env: 'test', p_status: 'sandbox_validated', p_note: 'sandbox suite passed' })
      await rpc('payment_gateway_set_status', { p_actor: platformOwner.id, p_provider: 'cashfree', p_env: 'test', p_status: 'enabled', p_note: 'enable for test' })
      assert.match(await rpcErr('payment_gateway_set_status', { p_actor: platformOwner.id, p_provider: 'razorpay', p_env: 'test', p_status: 'disabled', p_note: 'x' }), /switch the primary/)
      assert.ok(await one(`SELECT 1 FROM public.platform_audit_logs WHERE actor_user_id=$1 AND action='payments.gateway_status_changed'`, [platformOwner.id]))
    })

    let orgA, invA
    await test('Razorpay (current primary): checkout → signed webhook settles once; duplicate delivery is a no-op', async () => {
      orgA = await mkOrg('Rzco'); invA = await planInvoice(orgA)
      const c = await doCheckout(orgA, invA)
      assert.deepEqual([c.success, c.data.provider, c.data.amountPaise], [true, 'razorpay', 1416000])
      assert.equal((await doCheckout(orgA, invA)).data.orderId, c.data.orderId, 'open attempt reused')
      rz.state.orders.get(c.data.orderId).payments.push({ id: `pay_a${RUN}`, amount: 1416000, status: 'captured', method: 'upi' })
      const [body, headers] = rzWebhook({ event: 'payment.captured', payload: { payment: { entity: { id: `pay_a${RUN}`, order_id: c.data.orderId, amount: 1416000, currency: 'INR', status: 'captured', method: 'upi' } } } }, `evt_a${RUN}`)
      assert.equal((await svc.handleWebhook(db, rzA, body, headers)).status, 200)
      assert.equal((await svc.handleWebhook(db, rzA, body, headers)).body.duplicate, true)
      assert.equal((await inv(invA)).status, 'paid'); assert.equal((await sub(orgA)).status, 'active')
      assert.equal(await count('SELECT count(*) n FROM public.org_subscription_payments WHERE invoice_id=$1', [invA]), 1)
      const conf = await svc.confirm(db, resolver, orgA, 'razorpay', { orderId: c.data.orderId, razorpay_order_id: c.data.orderId, razorpay_payment_id: `pay_a${RUN}`, razorpay_signature: crypto.createHmac('sha256', RZ.keySecret).update(`${c.data.orderId}|pay_a${RUN}`).digest('hex') })
      assert.equal(conf.data.status, 'already_settled', 'browser confirmation after the webhook')
    })

    let orgB, invB, cfOrderB, orgC, invC
    await test('switching the primary to Cashfree: old open attempts are checked with Razorpay first — no double charge', async () => {
      orgB = await mkOrg('Cfco'); invB = await planInvoice(orgB)
      orgC = await mkOrg('Paidco'); invC = await planInvoice(orgC)
      const oldB = await doCheckout(orgB, invB), oldC = await doCheckout(orgC, invC)
      assert.match(await rpcErr('payment_gateway_set_primary', { p_actor: financeA.id, p_provider: 'cashfree', p_env: 'test', p_note: 'switch' }), /not permitted/)
      const sw = await rpc('payment_gateway_set_primary', { p_actor: platformOwner.id, p_provider: 'cashfree', p_env: 'test', p_note: 'Cashfree validated in sandbox' })
      assert.deepEqual([sw.from, sw.to], ['razorpay', 'cashfree'])
      assert.deepEqual((await one(`SELECT status, is_primary FROM public.payment_gateway_configs WHERE provider='razorpay' AND environment='test'`)), { status: 'draining', is_primary: false })
      // C paid on Razorpay just before the switch: checkout settles that payment instead of opening Cashfree.
      rz.state.orders.get(oldC.data.orderId).payments.push({ id: `pay_c${RUN}`, amount: 1416000, status: 'captured' })
      assert.deepEqual((await doCheckout(orgC, invC)).data, { alreadyPaid: true })
      assert.equal((await inv(invC)).status, 'paid')
      // B never paid on Razorpay: the old attempt is superseded and a Cashfree order opened.
      const nb = await doCheckout(orgB, invB)
      assert.deepEqual([nb.data.provider, nb.data.public.mode, !!nb.data.checkoutSession], ['cashfree', 'sandbox', true])
      cfOrderB = nb.data.orderId
      assert.equal((await one('SELECT status FROM public.payment_attempts WHERE provider_order_id=$1', [oldB.data.orderId])).status, 'superseded')
      assert.equal(await count(`SELECT count(*) n FROM public.payment_attempts WHERE invoice_id=$1 AND status IN ('created','pending')`, [invB]), 1, 'one open attempt')
      // A payment in progress on the old provider blocks a new checkout.
      const orgP = await mkOrg('Pendco'), invP = await planInvoice(orgP)
      await rpc('payment_gateway_set_primary', { p_actor: platformOwner.id, p_provider: 'razorpay', p_env: 'test', p_note: 'temporary' }).catch(async () => {
        await rpc('payment_gateway_set_status', { p_actor: platformOwner.id, p_provider: 'razorpay', p_env: 'test', p_status: 'enabled', p_note: 're-enable' })
        await rpc('payment_gateway_set_primary', { p_actor: platformOwner.id, p_provider: 'razorpay', p_env: 'test', p_note: 'temporary' })
      })
      const op = await doCheckout(orgP, invP)
      rz.state.orders.get(op.data.orderId).payments.push({ id: `pay_p${RUN}`, amount: 1416000, status: 'authorized' })
      await rpc('payment_gateway_set_status', { p_actor: platformOwner.id, p_provider: 'cashfree', p_env: 'test', p_status: 'enabled', p_note: 'back' })
      await rpc('payment_gateway_set_primary', { p_actor: platformOwner.id, p_provider: 'cashfree', p_env: 'test', p_note: 'Cashfree primary again' })
      const blocked = await doCheckout(orgP, invP)
      assert.deepEqual([blocked.success, blocked.status], [false, 409])
    })

    await test('Cashfree: pending then delayed success is settled by the poller; failure is refused; nothing activates on the redirect', async () => {
      const o = cf.state.orders.get(cfOrderB)
      assert.deepEqual(((r) => [r.success, r.status])(await svc.confirm(db, resolver, orgB, 'cashfree', { orderId: cfOrderB })), [false, 402], 'no payment yet')
      o.payments.push({ cf_payment_id: `${RUN}1`, payment_status: 'PENDING', payment_amount: 14160 })
      assert.equal((await svc.confirm(db, resolver, orgB, 'cashfree', { orderId: cfOrderB })).data.status, 'pending')
      assert.equal((await inv(invB)).status, 'issued', 'pending never activates')
      assert.deepEqual(((r) => [r.success, r.status])(await svc.confirm(db, resolver, orgA, 'cashfree', { orderId: cfOrderB })), [false, 404], 'another organisation')
      o.payments[0].payment_status = 'SUCCESS'
      await sql.query(`UPDATE public.payment_attempts SET created_at = now() - interval '10 minutes' WHERE provider_order_id=$1`, [cfOrderB])
      const poll = await svc.pollOpenAttempts(db, resolver)
      assert.ok(poll.settled >= 1, JSON.stringify(poll))
      const p = await one('SELECT * FROM public.org_subscription_payments WHERE invoice_id=$1', [invB])
      assert.deepEqual([p.provider, p.environment, p.provider_payment_id, Number(p.amount_cents), (await sub(orgB)).status], ['cashfree', 'test', `${RUN}1`, 1416000, 'active'])
      // Failed payment on another invoice.
      const orgF = await mkOrg('Failco'), invF = await planInvoice(orgF), f = await doCheckout(orgF, invF)
      cf.state.orders.get(f.data.orderId).payments.push({ cf_payment_id: `${RUN}9`, payment_status: 'FAILED', payment_amount: 14160 })
      assert.equal((await svc.confirm(db, resolver, orgF, 'cashfree', { orderId: f.data.orderId })).status, 402)
      assert.equal((await cfHook(paymentWebhook(f.data.orderId, `${RUN}9`, 14160, 'FAILED', 'PAYMENT_FAILED_WEBHOOK'))).status, 200)
      assert.equal((await inv(invF)).status, 'issued')
    })

    await test('Cashfree webhooks: duplicate delivery processed once; a second payment is kept as unapplied; bad signatures refused', async () => {
      const body = paymentWebhook(cfOrderB, `${RUN}1`, 14160)
      assert.equal((await cfHook(body)).body.outcome, 'processed', 'already settled by the poller → already_settled')
      assert.equal((await cfHook(body)).body.duplicate, true)
      const second = paymentWebhook(cfOrderB, `${RUN}2`, 14160)
      assert.equal((await cfHook(second)).status, 200)
      const u = await one('SELECT * FROM public.unapplied_payments WHERE provider_payment_id=$1', [`${RUN}2`])
      assert.deepEqual([u.reason, u.status, Number(u.amount_cents)], ['invoice_already_paid', 'open', 1416000])
      assert.equal(await count('SELECT count(*) n FROM public.org_subscription_payments WHERE invoice_id=$1', [invB]), 1, 'never applied twice')
      assert.ok(await one(`SELECT 1 FROM public.org_audit_logs WHERE org_id=$1 AND action='billing.payment_unapplied'`, [orgB]))
      const forged = await svc.handleWebhook(db, cfA, second, new Headers(signCashfree(second, undefined, 'not-the-secret')))
      assert.equal(forged.status, 401)
      const stale = await cfHook(second, String(Math.floor(Date.now() / 1000) - 3600))
      assert.equal(stale.status, 401, 'replayed an hour later')
      assert.equal(await count(`SELECT count(*) n FROM public.payment_webhook_events WHERE provider='cashfree' AND NOT signature_valid`), 1, 'rejected deliveries are recorded (identical bodies once)')
      // A test-environment payment can never settle a live order.
      assert.equal((await svc.settle(db, 'cashfree', 'live', cfOrderB, { paymentId: 'x1', amountPaise: 1416000, currency: 'INR', status: 'captured' })).status, 404)
    })

    await test('provider outage: checkout and confirmation fail safely; nothing is activated or charged twice', async () => {
      const orgO = await mkOrg('Outco'), invO = await planInvoice(orgO)
      cf.state.down = true
      const r = await doCheckout(orgO, invO)
      assert.deepEqual([r.success, r.status], [false, 502])
      assert.equal(await count('SELECT count(*) n FROM public.payment_attempts WHERE invoice_id=$1', [invO]), 0, 'no attempt without a provider order')
      assert.equal((await svc.confirm(db, resolver, orgB, 'cashfree', { orderId: cfOrderB })).status, 502)
      const h = await svc.checkHealth(db, resolver)
      assert.equal(h.find((x) => x.provider === 'cashfree').ok, false)
      cf.state.down = false
      assert.equal((await svc.checkHealth(db, resolver)).find((x) => x.provider === 'cashfree').ok, true)
      assert.equal((await one(`SELECT last_health_ok FROM public.payment_gateway_configs WHERE provider='cashfree' AND environment='test'`)).last_health_ok, true)
    })

    await test('verified outage: Platform Owner only; customers whose payment fell due get 3 extra days', async () => {
      const orgG = await mkOrg('Graceco')
      await sql.query(`UPDATE public.org_subscriptions SET status='past_due', current_period_end=now()-interval '6 days', grace_period_ends_at=now()+interval '1 day' WHERE org_id=$1`, [orgA])
      const deadline = (await sub(orgA)).grace_period_ends_at
      const args = { p_provider: 'cashfree', p_env: 'test', p_started: new Date(Date.now() - 2 * 3_600_000).toISOString(), p_ended: new Date(Date.now() - 3_600_000).toISOString(), p_evidence: 'Cashfree status page incident #TEST-1' }
      assert.match(await rpcErr('payment_outage_record', { p_actor: financeA.id, ...args }), /not permitted/)
      const r = await rpc('payment_outage_record', { p_actor: platformOwner.id, ...args })
      assert.equal(r.grace_days, 3)
      const s = await sub(orgA)
      assert.equal(Math.round((new Date(s.outage_grace_until) - new Date(deadline)) / 86_400_000), 3)
      // Past the original deadline but inside the extension: not expired. After it: expired as usual.
      await rpc('billing_enforce_periods', { p_now: new Date(new Date(deadline).getTime() + 86_400_000).toISOString() })
      assert.equal((await sub(orgA)).status, 'past_due')
      await rpc('billing_enforce_periods', { p_now: new Date(new Date(s.outage_grace_until).getTime() + 60_000).toISOString() })
      assert.equal((await sub(orgA)).status, 'expired')
      void orgG
    })

    await test('refunds: approval by someone else; above ₹10,000 two approvers; sent to the provider that took the payment', async () => {
      const payB = await one('SELECT id FROM public.org_subscription_payments WHERE invoice_id=$1', [invB])
      const small = await rpc('payment_refund_request', { p_actor: financeA.id, p_payment: payB.id, p_unapplied: null, p_amount: 500000, p_reason: 'Goodwill credit for setup delay' })
      assert.match(await rpcErr('payment_refund_decide', { p_actor: financeA.id, p_refund: small, p_decision: 'approved', p_note: null }), /requester cannot approve/)
      assert.match(await rpcErr('payment_refund_decide', { p_actor: support.id, p_refund: small, p_decision: 'approved', p_note: null }), /not permitted/)
      assert.equal((await rpc('payment_refund_decide', { p_actor: financeB.id, p_refund: small, p_decision: 'approved', p_note: 'ok' })).status, 'approved')
      const ex = await svc.executeRefund(db, resolver, small)
      assert.equal(ex.data.status, 'submitted')
      assert.deepEqual([cf.state.refunds.length, cf.state.refunds[0].refund_amount], [1, 5000], 'Cashfree refunded its own payment')
      assert.match(await rpcErr('payment_refund_request', { p_actor: financeA.id, p_payment: payB.id, p_unapplied: null, p_amount: 1416000, p_reason: 'More than is left' }), /between 1 and/)
      // Refund webhook: processed → credit note, payment partially refunded.
      const ref = await one('SELECT idempotency_key, provider_refund_id FROM public.payment_refunds WHERE id=$1', [small])
      assert.equal((await cfHook(refundWebhook(ref.idempotency_key, ref.provider_refund_id, `${RUN}1`, 5000))).status, 200)
      const done = await one('SELECT r.status, c.number, c.total_cents, c.tax_cents FROM public.payment_refunds r JOIN public.credit_notes c ON c.id=r.credit_note_id WHERE r.id=$1', [small])
      assert.equal(done.status, 'processed'); assert.match(done.number, /^CN\/\d{4}-\d{2}\/\d{5}$/)
      assert.deepEqual([Number(done.total_cents), Number(done.tax_cents)], [500000, 76271], 'GST reversed in proportion (18/118)')
      assert.equal((await one('SELECT status FROM public.org_subscription_payments WHERE id=$1', [payB.id])).status, 'partially_refunded')
      // Above ₹10,000 on a Razorpay payment while Cashfree is primary: two approvers, refunded through Razorpay.
      const payA = await one('SELECT id FROM public.org_subscription_payments WHERE invoice_id=$1', [invA])
      const big = await rpc('payment_refund_request', { p_actor: financeA.id, p_payment: payA.id, p_unapplied: null, p_amount: 1200000, p_reason: 'Cancelled within the first week' })
      assert.equal((await rpc('payment_refund_decide', { p_actor: financeB.id, p_refund: big, p_decision: 'approved', p_note: null })).status, 'requested', 'one approval is not enough')
      assert.match(await rpcErr('payment_refund_decide', { p_actor: financeB.id, p_refund: big, p_decision: 'approved', p_note: null }), /already decided/)
      assert.equal((await rpc('payment_refund_decide', { p_actor: platformOwner.id, p_refund: big, p_decision: 'approved', p_note: null })).status, 'approved')
      const before = cf.state.refunds.length
      assert.equal((await svc.executeRefund(db, resolver, big)).data.status, 'submitted')
      assert.deepEqual([rz.state.refunds.length, rz.state.refunds[0].amount, cf.state.refunds.length], [1, 1200000, before], 'Razorpay, not Cashfree')
      // Refund of the unapplied second payment: no credit note (never invoiced).
      const u = await one('SELECT id FROM public.unapplied_payments WHERE provider_payment_id=$1', [`${RUN}2`])
      const ur = await rpc('payment_refund_request', { p_actor: financeB.id, p_payment: null, p_unapplied: u.id, p_amount: 1416000, p_reason: 'Duplicate payment' })
      await rpc('payment_refund_decide', { p_actor: financeA.id, p_refund: ur, p_decision: 'approved', p_note: null })
      await rpc('payment_refund_decide', { p_actor: platformOwner.id, p_refund: ur, p_decision: 'approved', p_note: null })
      await svc.executeRefund(db, resolver, ur)
      const k = await one('SELECT idempotency_key, provider_refund_id FROM public.payment_refunds WHERE id=$1', [ur])
      await cfHook(refundWebhook(k.idempotency_key, k.provider_refund_id, `${RUN}2`, 14160))
      assert.deepEqual(await one('SELECT status, credit_note_id FROM public.payment_refunds WHERE id=$1', [ur]), { status: 'processed', credit_note_id: null })
      assert.equal((await one('SELECT status FROM public.unapplied_payments WHERE id=$1', [u.id])).status, 'refunded')
      assert.ok(await count(`SELECT count(*) n FROM public.platform_audit_logs WHERE action LIKE 'payments.refund_%'`) >= 6, 'audited')
    })

    await test('disputes: recorded, never moved backwards by late events, payment restored when won', async () => {
      const payB = `${RUN}1`
      await cfHook(disputeWebhook(`d${RUN}`, payB, 14160, 'DISPUTE_CREATED', 'DISPUTE_CREATED'))
      assert.equal((await one('SELECT status FROM public.org_subscription_payments WHERE provider_payment_id=$1', [payB])).status, 'disputed')
      await cfHook(disputeWebhook(`d${RUN}`, payB, 14160, 'DISPUTE_MERCHANT_WON', 'DISPUTE_CLOSED'))
      await cfHook(disputeWebhook(`d${RUN}`, payB, 14160, 'DISPUTE_UNDER_REVIEW'))
      assert.equal((await one('SELECT status FROM public.payment_disputes WHERE provider_dispute_id=$1', [`d${RUN}`])).status, 'won')
      assert.equal((await one('SELECT status FROM public.org_subscription_payments WHERE provider_payment_id=$1', [payB])).status, 'partially_refunded')
    })

    await test('reconciliation: settled payments matched with fees; mismatches and unknown payments become exceptions', async () => {
      cf.state.settlements.push(
        { cf_payment_id: `${RUN}1`, event_type: 'PAYMENT', event_amount: 14160, cf_settlement_id: `s${RUN}`, settlement_utr: 'UTR123', settlement_date: new Date().toISOString(), service_charge: 283.2, service_tax: 50.98 },
        { cf_payment_id: `${RUN}2`, event_type: 'PAYMENT', event_amount: 14160, cf_settlement_id: `s${RUN}`, settlement_utr: 'UTR123', settlement_date: new Date().toISOString(), service_charge: 0, service_tax: 0 },
        { cf_payment_id: `ghost${RUN}`, event_type: 'PAYMENT', event_amount: 999, cf_settlement_id: `s${RUN}`, settlement_utr: 'UTR123', settlement_date: new Date().toISOString(), service_charge: 0, service_tax: 0 },
      )
      const r = await svc.reconcile(db, cfA, new Date(Date.now() - 86_400_000), new Date())
      assert.deepEqual([r.data.matched, r.data.exceptions], [2, 1])
      const p = await one('SELECT fee_cents, tax_on_fee_cents, settlement_id FROM public.org_subscription_payments WHERE provider_payment_id=$1', [`${RUN}1`])
      assert.deepEqual([Number(p.fee_cents), Number(p.tax_on_fee_cents), !!p.settlement_id], [28320, 5098, true])
      assert.equal((await one(`SELECT kind FROM public.payment_reconciliation_items WHERE run_id=$1 AND kind<>'matched'`, [r.data.runId])).kind, 'missing_in_regrow')
      assert.equal(Number((await one('SELECT amount_cents FROM public.payment_settlements WHERE provider_settlement_id=$1', [`s${RUN}`])).amount_cents), 1416000 * 2 + 99900)
    })

    await test('GST: the invoice records CGST+SGST within a state and IGST across states; unknown states are never guessed', async () => {
      const orgS = await mkOrg('Samestate'), orgI = await mkOrg('Otherstate'), orgN = await mkOrg('Nostate')
      await sql.query(`UPDATE public.billing_settings SET supplier_state_code='29'`)
      await sql.query(`INSERT INTO public.org_billing_profiles (org_id, legal_name, state_code) VALUES ($1,'Same Pvt Ltd','29'), ($2,'Other Pvt Ltd','27')`, [orgS, orgI])
      const s = await inv(await planInvoice(orgS)), i = await inv(await planInvoice(orgI)), n = await inv(await planInvoice(orgN))
      assert.deepEqual([Number(s.cgst_cents), Number(s.sgst_cents), Number(s.igst_cents)], [108000, 108000, 0])
      assert.deepEqual([Number(i.cgst_cents), Number(i.sgst_cents), Number(i.igst_cents)], [0, 0, 216000])
      assert.deepEqual([n.cgst_cents, n.igst_cents, Number(n.tax_cents)], [null, null, 216000])
    })

    await test('UPI AutoPay: refused while disabled; mandate lifecycle; notice ≥ 24 h before debit; retry; renewal settled', async () => {
      assert.equal((await mandates.startMandate(db, resolver, { orgId: orgB, userId: owner.id, maxPaise: 3000000, customer: { phone: '+919000000001' } })).status, 503)
      assert.match(await rpcErr('payment_mandate_create', { p_actor: owner.id, p_org: orgB, p_provider: 'cashfree', p_env: 'test', p_method: 'upi_autopay', p_max: 3000000, p_frequency: 'as_presented' }), /not enabled/)
      assert.equal((await mandates.runMandateCycle(db, resolver)).skipped, true)
      await sql.query('UPDATE public.billing_settings SET recurring_payments_enabled = true')
      const m = await mandates.startMandate(db, resolver, { orgId: orgB, userId: owner.id, maxPaise: 3000000, customer: { phone: '+919000000001' } })
      assert.equal(m.success, true); assert.match(m.data.authorisationUrl, /authorise/)
      const mrow = await one('SELECT * FROM public.payment_mandates WHERE id=$1', [m.data.mandateId])
      assert.equal(mrow.status, 'pending_authorisation')
      await cfHook(subscriptionWebhook(mrow.provider_mandate_id, 'ACTIVE'))
      await cfHook(subscriptionWebhook(mrow.provider_mandate_id, 'INITIALIZED'))
      assert.equal((await one('SELECT status FROM public.payment_mandates WHERE id=$1', [mrow.id])).status, 'active', 'late event ignored')
      // Renewal due in two days: invoice at the contracted price, charge scheduled, owners notified.
      await sql.query(`UPDATE public.org_subscriptions SET current_period_end = now() + interval '2 days' WHERE org_id=$1`, [orgB])
      const sent = []
      const email = { sendEmail: async (o) => { sent.push(o); return { success: true } }, sendInvitationEmail: async () => ({ success: true }) }
      const c1 = await mandates.runMandateCycle(db, resolver, { email })
      assert.deepEqual([c1.invoices, c1.scheduled, c1.notified, c1.submitted], [1, 1, 1, 0], JSON.stringify(c1))
      const renewal = await one(`SELECT * FROM public.org_subscription_invoices WHERE org_id=$1 AND invoice_type='renewal' AND status='issued'`, [orgB])
      assert.equal(Number(renewal.subtotal_cents), 1200000, 'contracted price, unchanged')
      assert.equal(sent.length, 1); assert.match(sent[0].subject, /Upcoming RE by PX payment of ₹14,160/)
      const ch = await one('SELECT * FROM public.payment_mandate_charges WHERE invoice_id=$1', [renewal.id])
      assert.ok(new Date(ch.charge_after) - new Date(ch.pre_debit_notified_at) >= 24 * 3_600_000 - 1000)
      assert.match(await rpcErr('payment_mandate_charge_submit', { p_charge: ch.id, p_provider_charge_id: 'early', p_now: new Date().toISOString() }), /notice period/)
      assert.equal((await mandates.runMandateCycle(db, resolver, { email })).submitted, 0, 'not before the notice period')
      const later = new Date(Date.now() + 25 * 3_600_000)
      assert.equal((await mandates.runMandateCycle(db, resolver, { email, now: later })).submitted, 1)
      assert.equal(cf.state.charges.at(-1).payment_amount, 14160)
      const chargeId = (await one('SELECT provider_charge_id FROM public.payment_mandate_charges WHERE id=$1', [ch.id])).provider_charge_id
      await cfHook(subscriptionPaymentWebhook(mrow.provider_mandate_id, chargeId, `${RUN}m1`, 14160, false))
      const failed = await one('SELECT status, next_retry_at, failure_reason FROM public.payment_mandate_charges WHERE id=$1', [ch.id])
      assert.deepEqual([failed.status, !!failed.next_retry_at, failed.failure_reason], ['failed', true, 'Insufficient balance'])
      assert.equal((await mandates.runMandateCycle(db, resolver, { email, now: new Date(Date.now() + 50 * 3_600_000) })).submitted, 1, 'retried')
      const retryId = (await one('SELECT provider_charge_id FROM public.payment_mandate_charges WHERE id=$1', [ch.id])).provider_charge_id
      const before = (await sub(orgB)).current_period_end
      assert.equal((await cfHook(subscriptionPaymentWebhook(mrow.provider_mandate_id, retryId, `${RUN}m2`, 14160, true))).status, 200)
      assert.equal((await inv(renewal.id)).status, 'paid')
      assert.equal(Math.round(((await sub(orgB)).current_period_end - before) / 86_400_000), 30, 'renewed for a month from the old end')
      assert.equal((await one('SELECT status FROM public.payment_mandate_charges WHERE id=$1', [ch.id])).status, 'succeeded')
      // Cancellation: provider told first; pending charges cancelled; a stranger's cancel is refused.
      assert.equal((await mandates.cancelMandate(db, resolver, { orgId: orgA, mandateId: mrow.id, userId: owner.id, source: 'customer', reason: 'x' })).status, 404)
      assert.equal((await mandates.cancelMandate(db, resolver, { orgId: orgB, mandateId: mrow.id, userId: owner.id, source: 'customer', reason: 'No longer wanted' })).data.status, 'changed')
      assert.equal(cf.state.subscriptions.get(mrow.provider_mandate_id).status, 'CANCELLED')
      assert.equal((await one('SELECT status FROM public.payment_mandates WHERE id=$1', [mrow.id])).status, 'cancelled')
      assert.ok(await one(`SELECT 1 FROM public.org_audit_logs WHERE org_id=$1 AND action='billing.mandate_cancelled'`, [orgB]))
    })
  } finally {
    for (const g of gatewaysBefore) await sql.query('UPDATE public.payment_gateway_configs SET status=$3, is_primary=false WHERE provider=$1 AND environment=$2', [g.provider, g.environment, g.status]).catch(() => {})
    for (const g of gatewaysBefore.filter((x) => x.is_primary)) await sql.query('UPDATE public.payment_gateway_configs SET is_primary=true WHERE provider=$1 AND environment=$2', [g.provider, g.environment]).catch(() => {})
    await sql.query('UPDATE public.billing_settings SET recurring_payments_enabled=$1, supplier_state_code=$2', [settingsBefore.recurring_payments_enabled, settingsBefore.supplier_state_code]).catch(() => {})
    await sql.end()
  }
  console.log(`\nP22 payments: ${passed} checks passed.`)
}

main().catch((e) => { console.error(e); process.exit(1) })
