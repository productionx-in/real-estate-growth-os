// tests/payments-adapters.test.mjs — provider adapters and the registry (module tests on the real code via jiti).
// Razorpay: same signatures as before; Cashfree: request shapes, webhook signature and replay window, event mapping.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'
import { CF_SECRET, disputeWebhook, fakeCashfree, paymentWebhook, refundWebhook, signCashfree, subscriptionWebhook } from './fixtures/cashfree.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const types = await jiti.import(path.join(root, 'lib/payments/types.ts'))
const { cashfreeAdapter, cashfreeConfig } = await jiti.import(path.join(root, 'lib/payments/cashfree/adapter.ts'))
const { razorpayAdapter, razorpayEnvironment } = await jiti.import(path.join(root, 'lib/payments/razorpay/adapter.ts'))
const registry = await jiti.import(path.join(root, 'lib/payments/registry.ts'))
let passed = 0
async function test(name, fn) { await fn(); passed++; console.log(`  ✓ ${name}`) }
const H = (o) => new Headers(o)

console.log('PAYMENT ADAPTERS')

await test('money: rupees ↔ paise without floating-point drift', () => {
  assert.equal(types.toPaise(1416.1), 141610); assert.equal(types.toPaise('0.07'), 7); assert.equal(types.toPaise(141600), 14160000)
  assert.equal(types.toRupees(14160000), 141600); assert.throws(() => types.toPaise('1.234'))
})

await test('Cashfree config: all three variables required; mode decides the environment', () => {
  assert.equal(cashfreeConfig({ CASHFREE_APP_ID: 'a', CASHFREE_SECRET_KEY: 'b' }), null)
  assert.equal(cashfreeConfig({ CASHFREE_APP_ID: 'a', CASHFREE_SECRET_KEY: 'b', CASHFREE_ENVIRONMENT: 'live' }), null, 'only sandbox|production')
  assert.equal(cashfreeAdapter({ appId: 'a', secretKey: 'b', mode: 'sandbox' }).environment, 'test')
  assert.equal(cashfreeAdapter({ appId: 'a', secretKey: 'b', mode: 'production' }).environment, 'live')
})

const cfg = { appId: 'cf_app', secretKey: CF_SECRET, mode: 'sandbox' }

await test('Cashfree order: rupee amount from the invoice, API version and idempotency headers, no secret to the browser', async () => {
  const fake = fakeCashfree(); const cf = cashfreeAdapter(cfg, fake.fetchImpl)
  const o = await cf.createOrder({ reference: 'rg_abc_1', invoiceId: 'i', invoiceNumber: 'INV-1', orgId: 'org', amountPaise: 14160000, currency: 'INR', customer: { id: 'u1', email: 'a@b.test', phone: '+91 90000 00000' } })
  const call = fake.state.calls[0]
  assert.equal(call.path, '/orders'); assert.equal(call.body.order_amount, 141600); assert.equal(call.body.customer_details.customer_phone, '9000000000')
  assert.equal(call.headers['x-api-version'], '2023-08-01'); assert.equal(call.headers['x-idempotency-key'], 'rg_abc_1')
  assert.equal(o.checkoutSession, 'session_rg_abc_1')
  assert.deepEqual(cf.publicCheckout(), { provider: 'cashfree', mode: 'sandbox' })
  assert.ok(!JSON.stringify(cf.publicCheckout()).includes(CF_SECRET))
})

await test('Cashfree order: no mobile number → refused clearly, never invented', async () => {
  const cf = cashfreeAdapter(cfg, fakeCashfree().fetchImpl)
  await assert.rejects(cf.createOrder({ reference: 'r', invoiceId: 'i', invoiceNumber: 'n', orgId: 'o', amountPaise: 100, currency: 'INR', customer: { id: 'u' } }), /mobile number/)
})

await test('Cashfree webhook: valid signature accepted; tampered body, wrong secret and stale timestamp refused', () => {
  const cf = cashfreeAdapter(cfg, fakeCashfree().fetchImpl)
  const body = paymentWebhook('rg_1', 555, 1416)
  assert.equal(cf.verifyWebhook(body, H(signCashfree(body))), true)
  assert.equal(cf.verifyWebhook(body.replace('1416', '1'), H(signCashfree(body))), false, 'tampered')
  assert.equal(cf.verifyWebhook(body, H(signCashfree(body, undefined, 'other'))), false, 'wrong secret')
  const old = String(Math.floor(Date.now() / 1000) - 3600)
  assert.equal(cf.verifyWebhook(body, H(signCashfree(body, old))), false, 'replayed an hour later')
  assert.equal(cf.verifyWebhook(body, H({})), false, 'no headers')
})

await test('Cashfree events map to neutral events; the same event always gets the same id', () => {
  const cf = cashfreeAdapter(cfg, fakeCashfree().fetchImpl)
  const ok = cf.parseWebhook(paymentWebhook('rg_1', 555, 1416.5), H({}))
  assert.deepEqual([ok.event.kind, ok.event.payment.amountPaise, ok.event.payment.orderId, ok.event.payment.paymentId], ['payment.captured', 141650, 'rg_1', '555'])
  assert.equal(cf.parseWebhook(paymentWebhook('rg_1', 555, 1416.5), H({})).eventId, ok.eventId, 'stable id → duplicates detected')
  assert.equal(cf.parseWebhook(paymentWebhook('rg_1', 556, 1, 'FAILED', 'PAYMENT_FAILED_WEBHOOK'), H({})).event.kind, 'payment.failed')
  assert.equal(cf.parseWebhook(paymentWebhook('rg_1', 557, 1, 'USER_DROPPED', 'PAYMENT_USER_DROPPED_WEBHOOK'), H({})).event.kind, 'payment.failed')
  const rf = cf.parseWebhook(refundWebhook('0b8e2c58-3c1e-4d55-9b7f-1a2b3c4d5e6f', 'cfr_1', 555, 500), H({})).event
  assert.deepEqual([rf.kind, rf.refund.status, rf.refund.amountPaise, rf.refund.reference], ['refund.updated', 'processed', 50000, '0b8e2c58-3c1e-4d55-9b7f-1a2b3c4d5e6f'])
  const dp = cf.parseWebhook(disputeWebhook('d1', 555, 1416, 'DISPUTE_MERCHANT_WON'), H({})).event
  assert.deepEqual([dp.kind, dp.dispute.status, dp.dispute.paymentId], ['dispute.updated', 'won', '555'])
  assert.equal(cf.parseWebhook(subscriptionWebhook('s1', 'ACTIVE'), H({})).event.mandate.status, 'active')
  assert.equal(cf.parseWebhook(subscriptionWebhook('s1', 'CUSTOMER_CANCELLED'), H({})).event.mandate.status, 'cancelled')
  assert.equal(cf.parseWebhook(JSON.stringify({ type: 'SOMETHING_NEW', data: {} }), H({})).event.kind, 'ignored')
})

await test('Cashfree: order payments, refunds, settlements and health use the documented endpoints', async () => {
  const fake = fakeCashfree(); const cf = cashfreeAdapter(cfg, fake.fetchImpl)
  fake.state.orders.set('o1', { amount: 10, payments: [{ cf_payment_id: 9, payment_status: 'PENDING', payment_amount: 10 }] })
  assert.deepEqual((await cf.orderPayments('o1')).map((p) => [p.status, p.amountPaise]), [['pending', 1000]])
  const r = await cf.refund({ orderId: 'o1', paymentId: '9', amountPaise: 550, reference: 'ref-1', note: 'test' })
  assert.deepEqual([r.status, fake.state.refunds[0].refund_amount, fake.state.calls.at(-1).headers['x-idempotency-key']], ['pending', 5.5, 'ref-1'])
  fake.state.settlements.push({ cf_payment_id: 9, event_type: 'PAYMENT', event_amount: 10, cf_settlement_id: 77, settlement_utr: 'UTR1', settlement_date: '2026-11-20', service_charge: 0.2, service_tax: 0.04 })
  const s = await cf.settlements(new Date(), new Date())
  assert.deepEqual([s[0].settlementId, s[0].paymentId, s[0].amountPaise, s[0].feePaise, s[0].taxOnFeePaise], ['77', '9', 1000, 20, 4])
  await cf.healthCheck() // 404 on the probe order = authenticated and reachable
  await assert.rejects(cashfreeAdapter({ ...cfg, secretKey: 'wrong' }, fake.fetchImpl).healthCheck(), /authentication/i)
  fake.state.down = true
  await assert.rejects(cf.healthCheck(), /simulated outage/)
})

await test('Razorpay adapter keeps the existing signature rules and maps events', () => {
  const rz = razorpayAdapter({ keyId: 'rzp_test_x', keySecret: 'ks', webhookSecret: 'wh' })
  assert.equal(razorpayEnvironment('rzp_live_abc'), 'live'); assert.equal(rz.environment, 'test')
  const sig = crypto.createHmac('sha256', 'ks').update('order_1|pay_1').digest('hex')
  assert.deepEqual(rz.verifyReturn({ razorpay_order_id: 'order_1', razorpay_payment_id: 'pay_1', razorpay_signature: sig }), { orderId: 'order_1', paymentId: 'pay_1' })
  assert.equal(rz.verifyReturn({ razorpay_order_id: 'order_1', razorpay_payment_id: 'pay_2', razorpay_signature: sig }), null)
  const body = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_1', order_id: 'order_1', amount: 500, currency: 'INR', status: 'captured' } } } })
  const wsig = crypto.createHmac('sha256', 'wh').update(body).digest('hex')
  assert.equal(rz.verifyWebhook(body, H({ 'x-razorpay-signature': wsig })), true)
  assert.equal(rz.verifyWebhook(body + ' ', H({ 'x-razorpay-signature': wsig })), false)
  const p = rz.parseWebhook(body, H({ 'x-razorpay-event-id': 'evt_1' }))
  assert.deepEqual([p.eventId, p.event.kind, p.event.payment.amountPaise], ['evt_1', 'payment.captured', 500])
  assert.equal(rz.parseWebhook(JSON.stringify({ event: 'payment.dispute.lost', payload: { dispute: { entity: { id: 'disp_1', payment_id: 'pay_1', amount: 500, status: 'lost' } } } }), H({})).event.dispute.status, 'lost')
  assert.equal(rz.parseWebhook(JSON.stringify({ event: 'refund.processed', payload: { refund: { entity: { id: 'rfnd_1', payment_id: 'pay_1', amount: 100, status: 'processed', notes: { reference: 'x' } } } } }), H({})).event.refund.status, 'processed')
  assert.equal(rz.mandates, null, 'recurring starts on Cashfree UPI AutoPay')
})

await test('registry: keys from the other environment are never used; no secrets in public checkout data', () => {
  const env = { PAYMENTS_ENVIRONMENT: 'live', RAZORPAY_KEY_ID: 'rzp_test_x', RAZORPAY_KEY_SECRET: 's', CASHFREE_APP_ID: 'a', CASHFREE_SECRET_KEY: 'b', CASHFREE_ENVIRONMENT: 'sandbox' }
  const live = registry.envResolver(env)
  assert.equal(live.environment, 'live')
  assert.equal(live.get('razorpay'), null, 'test Razorpay keys refused in a live deployment')
  assert.equal(live.get('cashfree'), null, 'sandbox Cashfree keys refused in a live deployment')
  const test = registry.envResolver({ ...env, PAYMENTS_ENVIRONMENT: 'test' })
  assert.equal(test.get('cashfree').environment, 'test')
  assert.equal(registry.deploymentEnvironment({ RAZORPAY_KEY_ID: 'rzp_live_x' }), 'live', 'unset: inferred from the existing Razorpay key')
  assert.equal(registry.deploymentEnvironment({}), 'test')
  assert.ok(!JSON.stringify(test.get('razorpay').publicCheckout()).includes('"s"'))
})

await test('registry: no automatic failover — an unconfigured or non-enabled primary means no online payment', async () => {
  const resolver = registry.envResolver({ PAYMENTS_ENVIRONMENT: 'test', RAZORPAY_KEY_ID: 'rzp_test_x', RAZORPAY_KEY_SECRET: 's' })
  const db = (row) => ({ from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row }) }) }) }) }) })
  assert.equal((await registry.primaryAdapter(db({ provider: 'cashfree', environment: 'test', status: 'enabled', is_primary: true }), resolver)).adapter, null, 'Cashfree primary but not configured: Razorpay is NOT used instead')
  assert.equal((await registry.primaryAdapter(db({ provider: 'razorpay', environment: 'test', status: 'suspended', is_primary: true }), resolver)).adapter, null)
  assert.equal((await registry.primaryAdapter(db({ provider: 'razorpay', environment: 'test', status: 'enabled', is_primary: true }), resolver)).adapter.code, 'razorpay')
})

console.log(`\nPayment adapters: ${passed} checks passed.`)
