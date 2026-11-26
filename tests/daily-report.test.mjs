// tests/daily-report.test.mjs — the 8 AM daily reports: exact numbers from fixed rows and a fixed clock (IST days),
// and the e-mails built from them (real modules via jiti).
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const { computeDay, istDay } = await jiti.import(path.join(root, 'lib/jobs/daily-reports.ts'))
const { memberDayEmail, managerDayEmail, quietDay, firstStep } = await jiti.import(path.join(root, 'lib/email/daily-report.ts'))
const { customerEmails } = await jiti.import(path.join(root, 'lib/email/customer.ts'))
let passed = 0
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`) }

// 21 Nov 2026, 08:01 IST = 02:31 UTC. "Yesterday" = 20 Nov IST = 19 Nov 18:30 UTC → 20 Nov 18:30 UTC.
const NOW = Date.parse('2026-11-21T02:31:00Z')
const Y = (h) => new Date(Date.parse('2026-11-19T18:30:00Z') + h * 3600_000).toISOString() // h hours into yesterday (IST)
const T = (h) => new Date(Date.parse('2026-11-20T18:30:00Z') + h * 3600_000).toISOString() // h hours into today (IST)
const rows = {
  members: [{ profileId: 'asha', name: 'Asha Rao', role: 'sales_exec' }, { profileId: 'ravi', name: 'Ravi Kumar', role: 'sales_exec' }, { profileId: 'mona', name: 'Mona Shah', role: 'owner' }],
  leads: [
    { id: 'l1', name: 'Arjun', assigned_to: 'asha', status: 'new', created_at: Y(10), received_at: Y(10), assigned_at: Y(10), first_action_at: null, source: 'meta_ads' },
    { id: 'l2', name: 'Bela', assigned_to: 'asha', status: 'contacted', created_at: Y(11), received_at: Y(11), assigned_at: Y(11), first_action_at: new Date(Date.parse(Y(11)) + 10 * 60_000).toISOString(), source: 'meta_ads' },
    { id: 'l3', name: 'Chirag', assigned_to: 'ravi', status: 'contacted', created_at: Y(12), received_at: Y(12), assigned_at: Y(12), first_action_at: new Date(Date.parse(Y(12)) + 30 * 60_000).toISOString(), source: 'website' },
    { id: 'l4', name: 'Divya', assigned_to: null, status: 'new', created_at: Y(13), received_at: Y(13), assigned_at: null, first_action_at: null, source: 'portal_99acres' },
    { id: 'l5', name: 'Old waiting', assigned_to: 'asha', status: 'new', created_at: '2026-11-10T05:00:00Z', received_at: '2026-11-10T05:00:00Z', assigned_at: '2026-11-10T05:00:00Z', first_action_at: null, source: 'website' },
    { id: 'l6', name: 'Booked', assigned_to: 'ravi', status: 'booked', created_at: Y(1), received_at: Y(1), assigned_at: Y(1), first_action_at: Y(2), source: 'website' },
  ],
  tasks: [
    { assigned_to: 'asha', due_at: T(11), status: 'open' }, { assigned_to: 'asha', due_at: Y(15), status: 'open' }, { assigned_to: 'ravi', due_at: Y(9), status: 'open' },
    { assigned_to: 'ravi', due_at: T(9), status: 'done' },
  ],
  visits: [
    { assigned_to: 'ravi', scheduled_at: T(15), status: 'scheduled', completed_at: null }, { assigned_to: 'asha', scheduled_at: Y(16), status: 'completed', completed_at: Y(17) },
    { assigned_to: 'ravi', scheduled_at: Y(11), status: 'no_show', completed_at: null },
  ],
  bookings: [{ created_at: Y(14), total_amount: 9500000, status: 'confirmed' }, { created_at: Y(15), total_amount: 100, status: 'cancelled' }],
}

console.log('DAILY REPORTS')
test('IST day boundaries', () => {
  const d = istDay(NOW)
  assert.equal(new Date(d.today).toISOString(), '2026-11-20T18:30:00.000Z'); assert.equal(new Date(d.yesterday).toISOString(), '2026-11-19T18:30:00.000Z')
})
const { team, people } = computeDay(rows, NOW)
test('each person: new yesterday, waiting for a first call (oldest first), follow-ups, visits', () => {
  const a = people.get('asha')
  assert.deepEqual({ ...a, callFirst: a.callFirst }, { name: 'Asha Rao', newAssigned: 2, waitingFirstCall: 2, followUpsToday: 1, followUpsOverdue: 1, visitsToday: 0, callFirst: ['Old waiting', 'Arjun'] })
  const r = people.get('ravi')
  assert.equal(r.newAssigned, 2); assert.equal(r.waitingFirstCall, 0); assert.equal(r.followUpsOverdue, 1); assert.equal(r.followUpsToday, 0, 'done tasks do not count'); assert.equal(r.visitsToday, 1)
  assert.equal(quietDay(people.get('mona')), true)
})
test('the team: leads by source, median first answer, unanswered, unassigned, visits, bookings', () => {
  assert.equal(team.newLeads, 5)
  assert.deepEqual(team.bySource[0], ['meta ads', 2])
  assert.equal(team.answeredMedianMinutes, 30, 'median of 10, 30 and 60 minutes')
  assert.equal(team.notYetAnswered, 2); assert.equal(team.unassigned, 1); assert.equal(team.followUpsOverdue, 2)
  assert.deepEqual(team.visitsYesterday, { done: 1, noShow: 1 }); assert.equal(team.visitsToday, 1)
  assert.equal(team.bookingsYesterday, 1, 'cancelled bookings do not count'); assert.equal(team.bookingValueYesterday, 9500000)
})
test('e-mails: one clear first step; names only, never phone numbers; the manager sees the team and their own list', () => {
  assert.match(firstStep(people.get('asha')), /2 leads waiting for a first call/)
  const m = memberDayEmail({ orgName: 'Skyline', firstName: 'Asha', dateLabel: 'Saturday, 21 November', day: people.get('asha'), url: 'https://app.example.org/skyline/today' })
  assert.match(m.subject, /Your day at Skyline: 2 leads to call/); assert.match(m.text, /Call first: Old waiting, Arjun/); assert.doesNotMatch(m.text, /\+91|\d{10}/)
  const g = managerDayEmail({ orgName: 'Skyline', firstName: 'Mona', dateLabel: 'Saturday, 21 November', team, own: people.get('asha'), url: 'https://app.example.org/skyline' })
  assert.match(g.subject, /Skyline yesterday: 5 new leads, 1 booking — needs attention/)
  for (const s of ['half were answered within 30 min', '₹95,00,000', '2 leads from yesterday still not answered', 'Asha Rao: 2 · 2 · 1/1 · 0', 'Your own list']) assert.ok(g.text.includes(s), s)
  assert.match(g.html, /E-mail notifications/, 'footer says how to turn it off')
})
test('account e-mails: trial started in the welcome, plan active, team-member welcome by role', () => {
  assert.match(customerEmails.welcome({ orgName: 'Skyline', url: 'https://x.example.org', trialEndsAt: '2026-12-05T00:00:00Z', plan: 'Growth' }).text, /free trial has started on the Growth plan\. It runs until 5 Dec 2026/)
  assert.match(customerEmails.plan_active({ orgName: 'Skyline', plan: 'Growth', seats: 10, renewsAt: '2027-11-21T00:00:00Z', url: 'https://x.example.org' }).text, /on the Growth plan with 10 seats/)
  const j = customerEmails.member_joined({ orgName: 'Skyline', firstName: 'Asha', role: 'sales_exec', url: 'https://x.example.org' })
  assert.match(j.subject, /Welcome to Skyline on RE/); assert.match(j.text, /as sales exec\. New leads assigned to you/)
})
console.log(`\nDaily reports: ${passed} checks passed.`)
