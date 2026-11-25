// tests/whatsapp-numbers.test.mjs — several WhatsApp numbers per workspace (lib/integrations/whatsapp/numbers.ts):
// each incoming message reaches only the connection of the number it was sent to; old connections without a stored
// number still work through their business account, but never when that would be ambiguous; both metadata spellings
// are read everywhere.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const N = await jiti.import(path.join(root, 'lib/integrations/whatsapp/numbers.ts'))
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')

let passed = 0
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`) }
console.log('WHATSAPP NUMBERS')

const change = (phone, text) => ({ field: 'messages', value: { metadata: { phone_number_id: phone }, messages: [{ text: { body: text } }] } })

test('two numbers of one business account: each message reaches only its own number', () => {
  const conns = [
    { id: 'A', metadata: { wabaId: 'W1', selectedPhoneNumberId: 'P1' } },
    { id: 'B', metadata: { wabaId: 'W1', phone_number_id: 'P2' } },
  ]
  const routed = N.routeWebhookEntries([{ id: 'W1', changes: [change('P1', 'to A'), change('P2', 'to B'), change('P9', 'nobody')] }], conns)
  assert.deepEqual([...routed.keys()].sort(), ['A', 'B'])
  assert.deepEqual(routed.get('A')[0].changes.map((c) => c.value.messages[0].text.body), ['to A'])
  assert.deepEqual(routed.get('B')[0].changes.map((c) => c.value.messages[0].text.body), ['to B'])
})

test('an older connection without a stored number still receives its account’s messages — unless that is ambiguous', () => {
  const legacy = [{ id: 'L', metadata: { wabaId: 'W2' } }]
  assert.deepEqual([...N.routeWebhookEntries([{ id: 'W2', changes: [change('P5', 'hi')] }], legacy).keys()], ['L'])
  const two = [{ id: 'L1', metadata: { wabaId: 'W2' } }, { id: 'L2', metadata: {}, external_account_id: 'W2' }]
  assert.equal(N.routeWebhookEntries([{ id: 'W2', changes: [change('P5', 'hi')] }], two).size, 0, 'never guessed')
  assert.equal(N.routeWebhookEntries([{ id: 'W3', changes: [change('P5', 'hi')] }], legacy).size, 0, 'another account: nobody')
})

test('both metadata spellings are read; labels read like people talk', () => {
  assert.equal(N.phoneNumberIdOf({ selectedPhoneNumberId: 'X' }), 'X')
  assert.equal(N.phoneNumberIdOf({ phone_number_id: 'Y', selectedPhoneNumberId: 'X' }), 'Y')
  assert.equal(N.phoneNumberIdOf({}), null)
  assert.equal(N.numberLabel({ name: 'WhatsApp · Seaview Sales', metadata: { verifiedName: 'Seaview Sales', displayPhoneNumber: '+91 80000 00000' } }), 'Seaview Sales · +91 80000 00000')
  assert.equal(N.numberLabel({ name: 'WhatsApp', metadata: { display_phone_number: '918000000000' } }), '918000000000')
  assert.equal(N.numberLabel({ name: 'WhatsApp Business', metadata: {} }), 'WhatsApp number')
})

test('wiring: sending reads either spelling; the webhook routes per number; sign-up adds numbers up to the limit', () => {
  assert.match(read('lib/integrations/whatsapp/client.ts'), /const phoneNumberId = phoneNumberIdOf\(meta\)/)
  const hook = read('app/api/webhooks/whatsapp/route.ts')
  assert.match(hook, /routeWebhookEntries\(payload\.entry \?\? \[\], activeConnections\)/)
  assert.doesNotMatch(hook, /entry\.id === wabaId/, 'no more whole-account matching')
  const signup = read('app/api/integrations/whatsapp/embedded-signup/route.ts')
  assert.match(signup, /phoneNumberIdOf\(c\.metadata\) === input\.phoneNumberId/)
  assert.match(signup, />= MAX_WHATSAPP_NUMBERS/)
  assert.equal(N.MAX_WHATSAPP_NUMBERS, 5)
})

console.log(`\nWhatsApp numbers: ${passed} checks passed.`)
