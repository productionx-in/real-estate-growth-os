// tests/billing.test.mjs — self-serve billing rules (lib/billing/*) and the guards on the billing routes.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const rz = await jiti.import(path.join(root, 'lib/billing/razorpay.ts'))
const plans = await jiti.import(path.join(root, 'lib/billing/plans.ts'))
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8')

let passed = 0
async function test(name, fn) { await fn(); passed++; console.log(`  ✓ ${name}`) }
const hmac = (secret, data) => crypto.createHmac('sha256', secret).update(data).digest('hex')

console.log('BILLING')

await test('online payment is off unless both Razorpay keys are set; the webhook secret is separate', () => {
  assert.equal(rz.razorpayConfig({}), null)
  assert.equal(rz.razorpayConfig({ RAZORPAY_KEY_ID: 'rzp_test_x' }), null)
  assert.deepEqual(rz.razorpayConfig({ RAZORPAY_KEY_ID: ' rzp_test_x ', RAZORPAY_KEY_SECRET: 's' }), { keyId: 'rzp_test_x', keySecret: 's', webhookSecret: null })
})

await test('checkout signature: HMAC of "order|payment" with the key secret; anything else is refused', () => {
  const sig = hmac('secret', 'order_A|pay_B')
  assert.equal(rz.verifyCheckoutSignature('order_A', 'pay_B', sig, 'secret'), true)
  assert.equal(rz.verifyCheckoutSignature('order_A', 'pay_C', sig, 'secret'), false, 'another payment')
  assert.equal(rz.verifyCheckoutSignature('order_X', 'pay_B', sig, 'secret'), false, 'another order')
  assert.equal(rz.verifyCheckoutSignature('order_A', 'pay_B', sig, 'other-secret'), false, 'another secret')
  for (const bad of [undefined, null, '', 'zz', sig.slice(0, 10), sig.toUpperCase().replace(/./, 'G'), 123]) {
    assert.equal(rz.verifyCheckoutSignature('order_A', 'pay_B', bad, 'secret'), false, String(bad))
  }
})

await test('webhook signature: HMAC of the exact raw body with the webhook secret', () => {
  const body = '{"event":"payment.captured"}'
  assert.equal(rz.verifyWebhookSignature(body, hmac('wh', body), 'wh'), true)
  assert.equal(rz.verifyWebhookSignature(body + ' ', hmac('wh', body), 'wh'), false, 'a changed body')
  assert.equal(rz.verifyWebhookSignature(body, null, 'wh'), false)
})

await test('only captured payments in payment.captured / order.paid events are acted on', () => {
  const ev = (event, entity) => ({ event, payload: { payment: { entity } } })
  const ok = { id: 'pay_1', order_id: 'order_1', amount: 141600, currency: 'INR', status: 'captured' }
  assert.deepEqual(rz.capturedPaymentFromEvent(ev('payment.captured', ok)), ok)
  assert.deepEqual(rz.capturedPaymentFromEvent(ev('order.paid', ok)), ok)
  assert.equal(rz.capturedPaymentFromEvent(ev('payment.failed', ok)), null)
  assert.equal(rz.capturedPaymentFromEvent(ev('payment.captured', { ...ok, status: 'authorized' })), null)
  assert.equal(rz.capturedPaymentFromEvent(ev('payment.captured', { ...ok, order_id: null })), null)
  assert.equal(rz.capturedPaymentFromEvent(null), null)
})

await test('orders are created with the invoice amount and the key pair; payment ids are validated before any call', async () => {
  const calls = []
  const fakeFetch = async (url, init) => { calls.push({ url, init }); return new Response(JSON.stringify({ id: 'order_9', amount: 141600, currency: 'INR', status: 'created' }), { status: 200 }) }
  const cfg = { keyId: 'rzp_test_k', keySecret: 'sec', webhookSecret: null }
  const order = await rz.createOrder(cfg, { amountPaise: 141600, currency: 'INR', receipt: 'PLAN-202611-ABCDEF12-123456', notes: { invoice_id: 'i' } }, fakeFetch)
  assert.equal(order.id, 'order_9')
  assert.equal(calls[0].url, 'https://api.razorpay.com/v1/orders')
  assert.equal(JSON.parse(calls[0].init.body).amount, 141600)
  assert.equal(calls[0].init.headers.Authorization, `Basic ${Buffer.from('rzp_test_k:sec').toString('base64')}`)
  await assert.rejects(rz.fetchPayment(cfg, '../orders', fakeFetch), /Invalid payment id/)
  const failing = async () => new Response(JSON.stringify({ error: { description: 'Bad key' } }), { status: 401 })
  await assert.rejects(rz.createOrder(cfg, { amountPaise: 1, currency: 'INR', receipt: 'r', notes: {} }, failing), /Bad key/)
})

await test('labels and rules: who manages billing, days left, rupees, banner text', () => {
  assert.deepEqual(['owner', 'admin', 'manager', 'team_lead', 'sales_exec', 'post_sales', 'readonly'].filter(plans.canManageBilling), ['owner', 'admin'])
  const now = new Date('2026-11-18T10:00:00Z')
  assert.equal(plans.daysLeft('2026-11-18T09:00:00Z', now), 0)
  assert.equal(plans.daysLeft('2026-11-19T09:00:00Z', now), 1)
  assert.equal(plans.daysLeft(null, now), null)
  assert.equal(plans.rupees(14160000), '₹1,41,600')
  assert.equal(plans.rupees(499950), '₹4,999.50')
  assert.equal(plans.billingNotice('trial', '2026-12-30T00:00:00Z', now), null, 'early in a trial: no banner')
  assert.equal(plans.billingNotice('trial', '2026-11-21T00:00:00Z', now).tone, 'warning')
  assert.equal(plans.billingNotice('trial', '2026-11-01T00:00:00Z', now).tone, 'danger')
  assert.equal(plans.billingNotice('active', '2027-11-18T00:00:00Z', now), null)
  assert.equal(plans.billingNotice('past_due', null, now).tone, 'danger')
  assert.equal(plans.billingNotice(null, null, now), null)
})

await test('billing access: owners/admins; their real role counts only during a billing hold, never otherwise', async () => {
  const { billingRoleOf } = await jiti.import(path.join(root, 'lib/billing/access.ts'))
  assert.equal(billingRoleOf({ role: 'owner', status: 'active' }, false), 'owner')
  assert.equal(billingRoleOf({ role: 'manager', status: 'active' }, false), null)
  assert.equal(billingRoleOf({ role: 'readonly', status: 'active', lifecycle_saved_role: 'owner' }, true), 'owner', 'billing hold: the owner can pay')
  assert.equal(billingRoleOf({ role: 'readonly', status: 'active', lifecycle_saved_role: 'owner' }, false), null, 'suspended by RE staff: no')
  assert.equal(billingRoleOf({ role: 'readonly', status: 'active', lifecycle_saved_role: 'sales_exec' }, true), null)
  assert.equal(billingRoleOf({ role: 'owner', status: 'suspended' }, true), null, 'deactivated workspace: no')
})

await test('routes: owners/admins only; amounts never come from the browser; webhooks check the signature first', () => {
  for (const f of ['app/api/billing/actions/route.ts', 'app/api/billing/invoices/[invoiceId]/checkout/route.ts', 'app/api/billing/razorpay/confirm/route.ts',
    'app/api/billing/payments/confirm/route.ts', 'app/api/billing/payments/return/route.ts', 'app/api/billing/mandates/route.ts']) {
    assert.match(read(f), /authorizeBillingAccess\(/, f)
    assert.doesNotMatch(read(f), /amount\s*:\s*z\./, `${f} accepts no amount`)
  }
  // Both provider webhooks go through one handler that verifies the signature before anything is parsed.
  for (const f of ['app/api/webhooks/razorpay/route.ts', 'app/api/webhooks/cashfree/route.ts']) assert.match(read(f), /handleWebhook\(/, f)
  const svc = read('lib/payments/service.ts')
  const handler = svc.slice(svc.indexOf('export async function handleWebhook'), svc.indexOf('export async function processEvent'))
  assert.ok(handler.indexOf('verifyWebhook(') > 0 && handler.indexOf('verifyWebhook(') < handler.indexOf('parseWebhook(') && handler.indexOf('verifyWebhook(') < handler.indexOf('JSON.parse'), 'signature before parsing')
  assert.match(handler, /status: 503/, 'refuses when not configured')
  assert.match(read('lib/payments/razorpay/adapter.ts'), /verifyCheckoutSignature\(/, 'Razorpay checkout signature still verified')
  for (const f of ['app/(dashboard)/[orgSlug]/billing/page.tsx', 'app/(dashboard)/[orgSlug]/billing/invoices/[invoiceId]/page.tsx']) {
    assert.match(read(f), /billingRoleFor\(org\.id, profile\.id\)/, f)
  }
})

console.log(`\nBilling: ${passed} checks passed.`)
