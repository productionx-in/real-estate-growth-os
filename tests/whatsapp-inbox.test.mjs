// tests/whatsapp-inbox.test.mjs
// WhatsApp inbox rules (lib/integrations/whatsapp/inbox-rules.ts): who sees and replies, Meta's 24-hour window
// and opt-out, template blanks; and the webhook routes refuse unsigned posts.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const r = await jiti.import(path.join(root, 'lib/integrations/whatsapp/inbox-rules.ts'))

let passed = 0
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`) }
const ME = 'a1111111-1111-4111-8111-111111111111'
const NOW = new Date('2026-11-18T10:00:00Z')
const hoursAgo = (h) => new Date(NOW.getTime() - h * 3600_000).toISOString()

console.log('WHATSAPP INBOX')

test('a sales executive sees only conversations with their own leads; everyone else sees all', () => {
  assert.equal(r.canSeeConversation(ME, { role: 'sales_exec', profileId: ME }), true)
  assert.equal(r.canSeeConversation('someone-else', { role: 'sales_exec', profileId: ME }), false)
  assert.equal(r.canSeeConversation(null, { role: 'sales_exec', profileId: ME }), false, 'no lead → not theirs')
  for (const role of ['owner', 'admin', 'manager', 'readonly']) assert.equal(r.canSeeConversation(null, { role, profileId: ME }), true)
  // Team lead: their own and their teammates' buyers; post-sales: booked customers only; neither sees unlinked chats.
  const TL = { role: 'team_lead', profileId: ME, teamProfileIds: [ME, 'mate'] }
  assert.deepEqual([ME, 'mate', 'someone-else', null].map((a) => r.canSeeConversation(a, TL)), [true, true, false, false])
  const PS = { role: 'post_sales', profileId: ME }
  assert.deepEqual([['x', 'booked'], ['x', 'negotiation'], [null, null]].map(([a, st]) => r.canSeeConversation(a, PS, st)), [true, false, false])
  assert.deepEqual(['owner', 'admin', 'manager', 'sales_exec', 'readonly'].map(r.canReply), [true, true, true, true, false])
})

test('opening a chat clears “unread” only for the buyer’s salesperson (or anyone who can reply if nobody owns it)', () => {
  assert.equal(r.readClears(ME, { role: 'sales_exec', profileId: ME }), true)
  assert.equal(r.readClears(ME, { role: 'manager', profileId: 'mgr' }), false, 'a manager looking in does not clear it')
  assert.equal(r.readClears(null, { role: 'manager', profileId: 'mgr' }), true)
  assert.equal(r.readClears(null, { role: 'readonly', profileId: 'ro' }), false)
})

test('free text only within 24 hours of the buyer’s last message; then templates; never after STOP', () => {
  assert.equal(r.replyMode({ is_opted_out: false, last_inbound_at: hoursAgo(23.9) }, NOW).mode, 'text')
  assert.equal(r.replyMode({ is_opted_out: false, last_inbound_at: hoursAgo(23.9) }, NOW).windowEndsAt, '2026-11-18T10:06:00.000Z') // 6 minutes left
  assert.equal(r.replyMode({ is_opted_out: false, last_inbound_at: hoursAgo(24) }, NOW).mode, 'template')
  assert.equal(r.replyMode({ is_opted_out: false, last_inbound_at: null }, NOW).mode, 'template')
  assert.equal(r.replyMode({ is_opted_out: true, last_inbound_at: hoursAgo(1) }, NOW).mode, 'blocked')
})

test('template blanks: counted from {{n}}, filled in order, missing ones left visible', () => {
  const body = 'Hi {{1}}, your visit to {{2}} is at {{ 3 }}. See you, {{1}}!'
  assert.equal(r.templateParamCount(body), 3)
  assert.equal(r.templateParamCount('No blanks'), 0)
  assert.equal(r.fillTemplate(body, ['Priya', 'Skyline', '11 am']), 'Hi Priya, your visit to Skyline is at 11 am. See you, Priya!')
  assert.equal(r.fillTemplate('{{1}} {{2}}', ['A']), 'A {{2}}')
  assert.equal(r.templateBody([{ type: 'HEADER', text: 'x' }, { type: 'BODY', text: 'Hello {{1}}' }]), 'Hello {{1}}')
  assert.equal(r.templateBody('nope'), '')
})

test('media messages get a readable label; text is shown as is', () => {
  assert.equal(r.messageLabel('image', '[IMAGE]'), 'Photo')
  assert.equal(r.messageLabel('audio', null), 'Voice message')
  assert.equal(r.messageLabel('text', 'Is the 3 BHK still available?'), 'Is the 3 BHK still available?')
  assert.equal(r.messageLabel('weird', '[WEIRD]'), 'Message')
  assert.equal(r.messageLabel('', '[IMAGE]'), 'Photo', 'list previews carry no type')
})

test('both WhatsApp webhook routes refuse posts when no signing secret is configured (fail closed)', () => {
  for (const f of ['app/api/webhooks/whatsapp/route.ts', 'app/api/webhooks/whatsapp/[connectionId]/route.ts']) {
    const src = fs.readFileSync(path.join(root, f), 'utf8')
    assert.match(src, /if \(!appSecret\) \{\s*return NextResponse\.json\(\{ error: 'WhatsApp webhook signing secret is not configured\.' \}, \{ status: 503 \}\)/, f)
    assert.doesNotMatch(src, /if \(appSecret\) \{/, `${f} must not skip verification when the secret is missing`)
  }
})

test('an ordinary message never clears an opt-out; only STOP / START change it', () => {
  const src = fs.readFileSync(path.join(root, 'lib/integrations/whatsapp/processor.ts'), 'utf8')
  assert.match(src, /consentResult\.isOptOutKeyword\s*\?\s*\{ is_opted_out: true/)
  assert.match(src, /consentResult\.isOptInKeyword\s*\?\s*\{ is_opted_out: false/)
  assert.doesNotMatch(src, /\? false\s*:\s*false/)
})

console.log(`\nWhatsApp inbox: ${passed} checks passed.`)
