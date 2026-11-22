// tests/notification-rules.test.mjs — alert choices, team defaults and quiet hours (lib/notifications/prefs.ts),
// the weekly digest numbers (lib/email/weekly-digest.ts), and the wiring (20260076).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const p = await jiti.import(path.join(root, 'lib/notifications/prefs.ts'))
const wd = await jiti.import(path.join(root, 'lib/email/weekly-digest.ts'))
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8')
let passed = 0
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`) }
const at = (ist) => new Date(new Date(`2026-11-23T${ist}:00Z`).getTime() - 330 * 60_000) // an India time on 23 Nov

console.log('NOTIFICATION RULES')

test('a person’s choice beats the team default; unchanged types follow the team', () => {
  const team = { push: { ...p.DEFAULT_TEAM.push, document_viewed: false } }
  const person = { ...p.DEFAULT_PERSON, push: { follow_up_due: false } }
  const now = at('12:00')
  assert.deepEqual(p.pushDecision('follow_up_due', person, team, now), { send: false, reason: 'turned off by recipient' })
  assert.deepEqual(p.pushDecision('document_viewed', person, team, now), { send: false, reason: 'turned off for the team' })
  assert.deepEqual(p.pushDecision('document_viewed', { ...person, push: { document_viewed: true } }, team, now), { send: true })
  assert.deepEqual(p.pushDecision('lead_assigned', person, team, now), { send: true })
  assert.deepEqual(p.pushDecision('some_future_type', person, team, now), { send: true }, 'types added later default to on')
})

test('quiet hours (India time) hold back alerts, including across midnight; urgent ones still come if allowed', () => {
  const quiet = { enabled: true, start: '21:00', end: '08:00', allowUrgent: true }
  const person = { push: {}, quiet }
  assert.equal(p.inQuietHours(quiet, at('22:30')), true)
  assert.equal(p.inQuietHours(quiet, at('07:59')), true)
  assert.equal(p.inQuietHours(quiet, at('08:00')), false)
  assert.equal(p.inQuietHours({ ...quiet, start: '13:00', end: '14:00' }, at('13:30')), true)
  assert.deepEqual(p.pushDecision('follow_up_due', person, p.DEFAULT_TEAM, at('23:00')), { send: false, reason: 'quiet hours' })
  assert.deepEqual(p.pushDecision('lead_assigned', person, p.DEFAULT_TEAM, at('23:00')), { send: true }, 'urgent alerts still come')
  assert.deepEqual(p.pushDecision('lead_assigned', { push: {}, quiet: { ...quiet, allowUrgent: false } }, p.DEFAULT_TEAM, at('23:00')), { send: false, reason: 'quiet hours' })
  assert.equal(p.inQuietHours({ ...quiet, enabled: false }, at('23:00')), false)
})

test('choices are validated; stored values of any shape fall back to defaults', () => {
  assert.ok(p.normalisePerson({ quiet: { enabled: true, start: '25:00', end: '08:00' } }).errors.start)
  assert.ok(p.normalisePerson({ quiet: { enabled: true, start: '08:00', end: '08:00' } }).errors.end)
  assert.ok(p.normalisePerson({ push: { lead_assigned: 'yes' } }).errors.lead_assigned)
  assert.deepEqual(p.normalisePerson({ push: { lead_assigned: false, bogus: true } }).value.push, { lead_assigned: false })
  assert.deepEqual(p.personFromStored(null), p.DEFAULT_PERSON)
  assert.deepEqual(p.teamFromStored({ push: { sla_nudge: false, x: 1 } }).push, { ...p.DEFAULT_TEAM.push, sla_nudge: false })
  assert.ok(Object.values(p.DEFAULT_TEAM.push).every(Boolean), 'everything on by default, as before')
})

test('every notification the database can create has a setting', () => {
  const m = read('supabase/migrations/20260052_document_templates.sql').match(/notifications_type_check CHECK \(type IN \(\s*([^)]+)\)/)[1]
  const types = m.match(/'(\w+)'/g).map((x) => x.slice(1, -1))
  assert.deepEqual([...types].sort(), [...p.ALERT_TYPES].sort())
})

test('the dispatcher applies the choices to push only; the inbox row is untouched', () => {
  const h = read('lib/jobs/handlers.ts')
  assert.match(h, /pushDecision\(notification\.type, personFromStored\(person\?\.notification_prefs\), teamFromStored\(team\?\.notifications\), new Date\(\)\)/)
  assert.match(h, /adapter\.channel === 'push' && !push\.send\s*\? \{ status: 'skipped', detail: push\.reason \}/)
  assert.match(h, /'email\.weekly_digest': \(job, db\) => weeklyDigest\(job, db\)/)
})

test('weekly digest: last 7 India days against the 7 before, sources, lost reasons and people', () => {
  const now = new Date('2026-11-23T03:00:00Z').getTime() // Monday 08:30 IST
  const { prevStart, start, end } = wd.weekWindow(now)
  assert.equal(new Date(start).toISOString(), '2026-11-15T18:30:00.000Z', 'Mon 16 Nov 00:00 IST')
  assert.equal(end - start, 7 * 86_400_000); assert.equal(start - prevStart, 7 * 86_400_000)
  const L = (created, extra = {}) => ({ assigned_to: 'a', status: 'new', source: 'meta_ads', created_at: created, received_at: null, first_action_at: null, ...extra })
  const w = wd.computeWeek({
    members: [{ profileId: 'a', name: 'Asha' }, { profileId: 'b', name: 'Bala' }],
    leads: [
      L('2026-11-16T05:00:00Z', { first_action_at: '2026-11-16T05:10:00Z' }),
      L('2026-11-18T05:00:00Z', { source: 'website', first_action_at: '2026-11-18T05:30:00Z' }),
      L('2026-11-20T05:00:00Z', { assigned_to: 'b' }),
      L('2026-11-20T05:00:00Z', { status: 'junk' }),
      L('2026-11-10T05:00:00Z'), // the week before
      L('2026-11-15T18:00:00Z'), // Sunday 23:30 IST: the week before
    ],
    closed: [{ to: 'lost', reason: 'Budget does not match' }, { to: 'lost', reason: 'Budget does not match' }, { to: 'lost', reason: null }, { to: 'junk', reason: 'Spam or test' }],
    visits: [{ assigned_to: 'b', scheduled_at: '2026-11-19T06:00:00Z', status: 'completed', completed_at: '2026-11-19T07:00:00Z' }, { assigned_to: 'a', scheduled_at: '2026-11-21T06:00:00Z', status: 'no_show', completed_at: null }],
    bookings: [{ created_at: '2026-11-21T06:00:00Z', total_amount: 9500000, status: 'confirmed' }, { created_at: '2026-11-21T06:00:00Z', total_amount: 100, status: 'cancelled' }],
  }, now)
  assert.equal(w.newLeads, 4); assert.equal(w.prevNewLeads, 2)
  assert.deepEqual(w.bySource, [['meta ads', 3], ['website', 1]])
  assert.equal(w.answeredMedianMinutes, 20); assert.equal(w.notAnswered, 1, 'junk is not counted as waiting')
  assert.deepEqual([w.visitsDone, w.noShows, w.bookings, w.bookingValue], [1, 1, 1, 9500000])
  assert.deepEqual([w.lost, w.junk], [3, 1]); assert.deepEqual(w.topReasons, [['Budget does not match', 2]])
  assert.deepEqual(w.people, [{ name: 'Asha', newAssigned: 3, answered: 2, visitsDone: 0 }, { name: 'Bala', newAssigned: 1, answered: 0, visitsDone: 1 }])
  assert.equal(wd.trend(4, 2), ' (↑ 100% on the week before)'); assert.equal(wd.trend(3, 0), ''); assert.equal(wd.trend(2, 2), ' (same as the week before)')
  const mail = wd.weeklyDigestEmail({ orgName: 'Acme', firstName: 'Ravi', rangeLabel: '16 Nov – 22 Nov', week: w, url: 'https://app.example/acme' })
  assert.match(mail.subject, /Acme last week: 4 new leads, 1 booking/)
  assert.match(mail.text, /Budget does not match: 2/)
  assert.doesNotMatch(mail.text, /\+91|@/, 'no phone numbers or e-mail addresses')
})

test('migration: weekly digest is a report e-mail, scheduled Monday 08:13 IST, once per week; own profile choices', () => {
  const m = read('supabase/migrations/20260076_notification_rules.sql')
  assert.match(m, /p_kind LIKE 'daily_%' OR p_kind LIKE 'weekly_%' THEN 'report'/)
  assert.match(m, /cron\.schedule\('regrow-weekly-digest', '43 2 \* \* 1'/)
  assert.match(m, /'email\.weekly_digest:' \|\| to_char\(now\(\) AT TIME ZONE 'Asia\/Kolkata', 'IYYY-IW'\)/)
  assert.match(m, /REVOKE ALL ON FUNCTION public\.enqueue_customer_email/)
  assert.match(read('app/api/account/notifications/route.ts'), /\.update\(patch as never\)\.eq\('auth_user_id', user\.id\)/)
  assert.match(read('app/(dashboard)/[orgSlug]/settings/alerts/page.tsx'), /if \(!isAdmin\) redirect/)
  assert.match(read('lib/email/templates.ts'), /'weekly\.manager'\(p\)/)
})

console.log(`\nNotification rules: ${passed} checks passed.`)
