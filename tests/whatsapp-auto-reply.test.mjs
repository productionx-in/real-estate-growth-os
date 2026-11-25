// tests/whatsapp-auto-reply.test.mjs — Settings → WhatsApp auto-replies (lib/integrations/whatsapp/auto-reply.ts,
// lib/settings/workspace.ts). Off by default; welcome only once and only in hours; away at most every 12 hours; never
// to an opted-out buyer, for STOP/START, or for a webhook retry; only {{first_name}} can be filled in.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const A = await jiti.import(path.join(root, 'lib/integrations/whatsapp/auto-reply.ts'))
const W = await jiti.import(path.join(root, 'lib/settings/workspace.ts'))
const C = await jiti.import(path.join(root, 'lib/settings/catalog.ts'))
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')

let passed = 0
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`) }
console.log('WHATSAPP AUTO-REPLIES')

// Tuesday 2026-11-24, 11:00 and 22:00 India time.
const DAY = new Date('2026-11-24T05:30:00Z'), NIGHT = new Date('2026-11-24T16:30:00Z'), SUNDAY = new Date('2026-11-29T05:30:00Z')
const on = { ...W.DEFAULT_SETTINGS.whatsapp, welcomeEnabled: true, awayEnabled: true }
const base = { settings: on, firstMessage: true, consentKeyword: false, optedOut: false, newMessage: true, lastAutoReplyAt: null, now: DAY }

test('off by default; both messages are the workspace’s to turn on', () => {
  assert.equal(W.DEFAULT_SETTINGS.whatsapp.welcomeEnabled, false)
  assert.equal(W.DEFAULT_SETTINGS.whatsapp.awayEnabled, false)
  assert.equal(A.decideAutoReply({ ...base, settings: W.DEFAULT_SETTINGS.whatsapp }), null)
  assert.equal(A.decideAutoReply({ ...base, settings: W.DEFAULT_SETTINGS.whatsapp, now: NIGHT }), null)
})

test('business hours are India time, on working days only', () => {
  assert.equal(A.isBusinessHours(on, DAY), true)
  assert.equal(A.isBusinessHours(on, NIGHT), false)
  assert.equal(A.isBusinessHours(on, SUNDAY), false)
  assert.deepEqual(A.indiaClock(DAY), { day: 2, hour: 11 })
})

test('welcome: first message, in hours, once; away: outside hours, at most every 12 hours', () => {
  assert.equal(A.decideAutoReply(base).kind, 'welcome')
  assert.equal(A.decideAutoReply({ ...base, firstMessage: false }), null)
  assert.equal(A.decideAutoReply({ ...base, lastAutoReplyAt: new Date(DAY.getTime() - 86400000 * 30) }), null, 'already welcomed once')
  assert.equal(A.decideAutoReply({ ...base, now: NIGHT }).kind, 'away')
  assert.equal(A.decideAutoReply({ ...base, now: NIGHT, firstMessage: false, lastAutoReplyAt: new Date(NIGHT.getTime() - 3600000) }), null)
  assert.equal(A.decideAutoReply({ ...base, now: NIGHT, firstMessage: false, lastAutoReplyAt: new Date(NIGHT.getTime() - 13 * 3600000) }).kind, 'away')
})

test('never for STOP/START, an opted-out buyer, or a webhook retry', () => {
  for (const over of [{ consentKeyword: true }, { optedOut: true }, { newMessage: false }]) {
    assert.equal(A.decideAutoReply({ ...base, ...over }), null)
    assert.equal(A.decideAutoReply({ ...base, ...over, now: NIGHT }), null)
  }
})

test('first name from the WhatsApp profile; "there" when there is none; capped length', () => {
  assert.equal(A.fillAutoReply('Hi {{first_name}}!', 'priya sharma'), 'Hi Priya!')
  assert.equal(A.fillAutoReply('Hi {{ first_name }}!', ''), 'Hi there!')
  assert.equal(A.fillAutoReply('Hi {{first_name}}!', '🙂'), 'Hi there!')
  assert.equal(A.fillAutoReply('x'.repeat(1200), 'A').length, 1000)
})

test('settings: messages required when on, only {{first_name}}, sensible hours and days', () => {
  const ok = W.normaliseSection('whatsapp', { ...on, welcomeMessage: 'Hello {{first_name}}' })
  assert.deepEqual(ok.errors, {})
  assert.match(W.normaliseSection('whatsapp', { ...on, welcomeMessage: ' ' }).errors.welcomeMessage, /write the message/)
  assert.match(W.normaliseSection('whatsapp', { ...on, awayMessage: 'Hi {{price}}' }).errors.awayMessage, /only \{\{first_name\}\}/)
  assert.match(W.normaliseSection('whatsapp', { ...on, hoursStart: 19, hoursEnd: 10 }).errors.hoursEnd, /end after/)
  assert.match(W.normaliseSection('whatsapp', { ...on, workDays: [] }).errors.workDays, /working day/)
  assert.deepEqual(W.normaliseSection('whatsapp', { ...on, workDays: [6, 1, 1, 9, 'x'] }).value.workDays, [1, 6])
  assert.equal(W.settingsFromRow({}).whatsapp.welcomeEnabled, false, 'nothing stored → off')
})

test('wiring: the processor replies after recording the message; the API accepts the section; settings page for admins', () => {
  const p = read('lib/integrations/whatsapp/processor.ts')
  assert.match(p, /newMessage: !!recorded/)
  assert.match(p, /\.eq\('is_opted_out', false\)/, 'the claim refuses an opted-out conversation')
  assert.match(read('app/api/settings/workspace/route.ts'), /'whatsapp'\]\)/)
  const page = C.SETTINGS.flatMap((g) => g.pages).find((x) => x.key === 'whatsapp-auto-replies')
  assert.equal(page.audience, 'admins')
  assert.match(read('app/(dashboard)/[orgSlug]/settings/whatsapp/page.tsx'), /if \(!isAdmin\) redirect/)
  assert.match(read('supabase/migrations/20260089_whatsapp_auto_reply.sql'), /ADD COLUMN IF NOT EXISTS last_auto_reply_at/)
})

console.log(`\nWhatsApp auto-replies: ${passed} checks passed.`)
