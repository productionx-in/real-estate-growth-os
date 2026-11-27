// tests/lead-alerts.test.mjs — lead alerts (lib/notifications/lead-alerts.ts, Settings → Notification defaults, the
// in-app banners, 20260093). The settings the form saves are the keys the database reads; anything malformed falls
// back to the defaults; each alert gets the right banner and sound; and the wiring is in place.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const A = await jiti.import(path.join(root, 'lib/notifications/lead-alerts.ts'))
const W = await jiti.import(path.join(root, 'lib/settings/workspace.ts'))
const P = await jiti.import(path.join(root, 'lib/notifications/prefs.ts'))
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')

let passed = 0
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`) }
console.log('LEAD ALERTS')

test('defaults: everything on, reminders every 10 minutes, follow-ups 5 minutes before, three different sounds', () => {
  const d = A.DEFAULT_LEAD_ALERTS
  assert.deepEqual([d.enabled, d.newLead, d.uncontacted, d.followUp, d.sounds], [true, true, true, true, true])
  assert.equal(d.uncontactedMinutes, 10)
  assert.equal(d.followUpMinutes, 5)
  assert.equal(new Set([d.newLeadSound, d.reminderSound, d.followUpSound]).size, 3)
  assert.deepEqual(W.DEFAULT_SETTINGS.alerts, d)
  assert.deepEqual(W.settingsFromRow(null).alerts, d)
})

test('saving: bad values are refused with a reason; stored junk falls back to the defaults', () => {
  const bad = A.normaliseLeadAlerts({ uncontactedMinutes: 2, followUpMinutes: 61, newLeadSound: 'siren', enabled: 'yes' })
  assert.ok(bad.errors.uncontactedMinutes && bad.errors.followUpMinutes && bad.errors.newLeadSound)
  assert.equal(bad.value.enabled, true, 'a non-boolean keeps the default')
  const ok = W.normaliseSection('alerts', { ...A.DEFAULT_LEAD_ALERTS, uncontacted: false, uncontactedMinutes: 15, followUpSound: 'marimba' })
  assert.deepEqual(ok.errors, {})
  assert.equal(ok.value.uncontactedMinutes, 15)
  assert.equal(ok.value.followUpSound, 'marimba')
  assert.deepEqual(W.settingsFromRow({ alerts: { uncontactedMinutes: 'ten', followUp: false } }).alerts, { ...A.DEFAULT_LEAD_ALERTS, followUp: false })
})

test('the database reads the same keys and limits the form saves', () => {
  const sql = read('supabase/migrations/20260093_lead_alerts.sql')
  for (const key of ['enabled', 'newLead', 'uncontacted', 'followUp']) assert.match(sql, new RegExp(`'${key}'`), key)
  assert.match(sql, /'uncontactedMinutes', 10, 5, 60/)
  assert.match(sql, /'followUpMinutes', 5, 1, 60/)
  assert.deepEqual(A.ALERT_LIMITS, { uncontacted: [5, 60], followUp: [1, 60] })
})

test('banners: new leads, "not contacted" reminders and follow-ups — and nothing else', () => {
  assert.equal(A.bannerKind('lead_new'), 'newLead')
  assert.equal(A.bannerKind('lead_assigned', 'new_lead'), 'newLead')
  assert.equal(A.bannerKind('lead_unassigned', 'new_lead'), 'newLead')
  assert.equal(A.bannerKind('lead_assigned'), null, 'a reassignment is not a new lead')
  assert.equal(A.bannerKind('lead_uncontacted'), 'reminder')
  assert.equal(A.bannerKind('sla_nudge'), 'reminder')
  assert.equal(A.bannerKind('follow_up_due'), 'followUp')
  for (const t of ['follow_up_overdue', 'sla_breach', 'document_viewed', 'plot_map']) assert.equal(A.bannerKind(t), null, t)
})

test('sounds follow the switches; several alerts at once make one sound, the most important', () => {
  const s = A.DEFAULT_LEAD_ALERTS
  assert.equal(A.soundFor('newLead', s), 'chime')
  assert.equal(A.soundFor('reminder', s), 'pulse')
  assert.equal(A.soundFor('followUp', s), 'bell')
  assert.equal(A.soundFor('newLead', { ...s, sounds: false }), null)
  assert.equal(A.soundFor('reminder', { ...s, enabled: false }), null)
  assert.equal(A.soundFor('followUp', { ...s, followUp: false }), null)
  assert.equal(A.loudest(['followUp', 'reminder']), 'reminder')
  assert.equal(A.loudest(['followUp', 'newLead', 'reminder']), 'newLead')
  assert.equal(A.loudest([]), null)
  const sounds = read('lib/notifications/sounds.ts')
  for (const id of A.SOUND_IDS) assert.match(sounds, new RegExp(`\\b${id}:`), `a pattern for ${id}`)
  assert.match(sounds, /GAP_MS = 1500/, 'never two sounds on top of each other')
})

test('the new alert types can be turned off per person like the others', () => {
  assert.ok(P.ALERT_TYPES.includes('lead_new') && P.ALERT_TYPES.includes('lead_uncontacted'))
  assert.equal(P.ALERTS.lead_uncontacted.urgent, false, 'repeating reminders respect quiet hours')
})

test('wiring: banners in every workspace page, owner/admin-only settings, the number read live and only for who may see it', () => {
  assert.match(read('app/(dashboard)/[orgSlug]/layout.tsx'), /<LiveAlerts orgId=\{workspace\.org\.id\} orgSlug=\{workspace\.org\.slug\} settings=\{alerts\} \/>/)
  const page = read('app/(dashboard)/[orgSlug]/settings/alerts/page.tsx')
  assert.match(page, /if \(!isAdmin\) redirect/)
  assert.match(page, /LeadAlertSettingsForm/)
  assert.match(read('app/api/settings/workspace/route.ts'), /'alerts'[,\]]/)
  const live = read('app/api/notifications/live/route.ts')
  assert.match(live, /authorizeOrgAccess\(orgId\)/)
  assert.match(live, /profileId: auth\.context\.profile\.id/)
  const dal = read('lib/dal/notifications.ts')
  assert.match(dal, /\.eq\('recipient_profile_id', viewer\.profileId\)/)
  assert.match(dal, /viewer\.seesAllLeads \|\| l\.assigned_to === viewer\.profileId/)
  const sql = read('supabase/migrations/20260093_lead_alerts.sql')
  assert.doesNotMatch(sql.split('BEGIN;')[1], /NEW\.phone|l\.phone|NEW\.email/, 'no buyer contact details stored in alerts')
  const banner = read('components/notifications/LiveAlerts.tsx')
  assert.match(banner, /document\.visibilityState !== 'visible'/, 'only the tab someone is looking at checks')
  assert.match(banner, /aria-live="polite"/)
})

console.log(`\nLead alerts: ${passed} checks passed.`)
