// tests/notification-panel.test.mjs — the header inbox (components/notifications/NotificationBell.tsx,
// lib/notifications/kinds.ts): every kind the database can send has a label, an emoji, a badge and an action; links go
// where the notification is about; the panel offers All / Unread, an unread dot, per-item and mark-all reading.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const K = await jiti.import(path.join(root, 'lib/notifications/kinds.ts'))
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
let passed = 0
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`) }
console.log('NOTIFICATION PANEL')

test('every notification kind the database allows has a label, an emoji, a badge icon and an action', () => {
  const dir = path.join(root, 'supabase/migrations')
  const latest = fs.readdirSync(dir).sort().map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).filter((t) => t.includes('notifications_type_check CHECK')).pop()
  const list = latest.slice(latest.lastIndexOf('notifications_type_check CHECK')).split(');')[0]
  const kinds = [...list.matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
  assert.ok(kinds.length >= 10)
  for (const k of kinds) {
    const s = K.NOTIFICATION_KINDS[k]
    assert.ok(s, `missing ${k}`)
    assert.ok(s.label && s.action && s.icon && /\p{Extended_Pictographic}/u.test(s.emoji), k)
  }
  assert.equal(K.kindStyle('something_new').emoji, '🔔')
})
test('links go to the lead, the plot map or the achievements', () => {
  assert.equal(K.notificationHref('acme', { type: 'lead_new', lead_id: 'L1' }), '/acme/leads/L1')
  assert.equal(K.notificationHref('acme', { type: 'plot_map', lead_id: null, project_id: 'P1' }), '/acme/projects/P1/map')
  assert.equal(K.notificationHref('acme', { type: 'achievement', lead_id: null }), '/acme/performance/achievements')
  assert.equal(K.notificationHref('acme', { type: 'sla_nudge', lead_id: null }), '/acme/leads')
})
test('celebrations say what they are and go to the right place: rewards to Rewards, trophies to achievements', () => {
  assert.equal(K.kindStyle('achievement', 'reward').emoji, '🎁')
  assert.equal(K.notificationHref('acme', { type: 'achievement', lead_id: null, topic: 'reward' }), '/acme/rewards')
  assert.equal(K.notificationHref('acme', { type: 'achievement', lead_id: null, topic: 'trophy' }), '/acme/performance/achievements')
  assert.equal(K.notificationHref('acme', { type: 'achievement', lead_id: 'L1', topic: 'credit' }), '/acme/performance?me=1')
  assert.equal(K.kindStyle('achievement', 'unknown').label, 'Celebration')
  for (const t of ['reward', 'trophy', 'level', 'mission', 'target', 'credit', 'achievement']) assert.ok(K.CELEBRATIONS[t], t)
  const dal = read('lib/dal/notifications.ts')
  assert.match(dal, /topic: n\.type === 'achievement' \? topicOf\(dedupe_key\) : null/)
})
test('time reads naturally', () => {
  const now = Date.parse('2026-11-26T12:00:00Z')
  assert.equal(K.timeAgo('2026-11-26T11:59:30Z', now), 'just now')
  assert.equal(K.timeAgo('2026-11-26T11:55:00Z', now), '5m ago')
  assert.equal(K.timeAgo('2026-11-26T09:00:00Z', now), '3h ago')
  assert.equal(K.timeAgo('2026-11-24T12:00:00Z', now), '2d ago')
})
test('the panel: All / Unread, an unread dot, mark one or all read, closes on Escape, fits a phone', () => {
  const c = read('components/notifications/NotificationBell.tsx')
  assert.match(c, /\(\['all', 'unread'\] as const\)/)
  assert.match(c, /aria-label="Unread"/)
  assert.match(c, /markRead\(\{ ids: \[n\.id\] \}\)/)
  assert.match(c, /markRead\(\{ all: true \}\)/)
  assert.match(c, /e\.key === 'Escape'/)
  assert.match(c, /fixed inset-x-2 top-14[^"]*sm:absolute/)
  assert.match(c, /\/api\/notifications\?orgId=/)
})

console.log(`\nNotification panel: ${passed} checks passed.`)
