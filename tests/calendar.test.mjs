// tests/calendar.test.mjs — the sales calendar (lib/calendar/rules.ts, lib/dal/calendar.ts, the page and board): the days
// each view covers, the workspace's time zone, who may open whose calendar, overdue and workload, and that changes go
// through the existing follow-up and assignment APIs (no second copy of the data, no new write path).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const C = await jiti.import(path.join(root, 'lib/calendar/rules.ts'))
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')

let passed = 0
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`) }
console.log('SALES CALENDAR')

test('views: a day; Monday to Sunday; whole weeks covering the month; two weeks of agenda', () => {
  assert.deepEqual(C.viewDays('day', '2026-11-25'), ['2026-11-25'])
  const week = C.viewDays('week', '2026-11-25') // a Wednesday
  assert.equal(week[0], '2026-11-23'); assert.equal(week[6], '2026-11-29'); assert.equal(week.length, 7)
  const month = C.viewDays('month', '2026-11-25')
  assert.equal(month[0], '2026-10-26', 'starts on the Monday before 1 November')
  assert.equal(month[month.length - 1], '2026-12-06', 'ends on the Sunday after 30 November')
  assert.equal(month.length % 7, 0)
  assert.equal(C.viewDays('agenda', '2026-11-25').length, 14)
})

test('previous and next move by the view’s own length, across months and years', () => {
  assert.equal(C.step('week', '2026-11-25', 1), '2026-12-02')
  assert.equal(C.step('month', '2026-12-15', 1), '2027-01-01')
  assert.equal(C.step('month', '2026-03-31', -1), '2026-02-01')
  assert.equal(C.step('day', '2026-12-31', 1), '2027-01-01')
})

test('days start at local midnight in the workspace’s time zone', () => {
  assert.equal(C.dayStart('2026-11-25', 'Asia/Kolkata').toISOString(), '2026-11-24T18:30:00.000Z')
  assert.equal(C.dayStart('2026-11-25', 'UTC').toISOString(), '2026-11-25T00:00:00.000Z')
  assert.equal(C.localDay(new Date('2026-11-24T19:00:00Z'), 'Asia/Kolkata'), '2026-11-25', '00:30 in India is the next day')
  assert.equal(C.parseDay('2026-13-40', '2026-11-25'), '2026-11-25', 'nonsense dates fall back to today')
  assert.equal(C.parseView('year'), 'week')
})

test('who may open whose calendar: managers anyone’s; a team lead their team’s; everyone else their own', () => {
  for (const r of ['owner', 'admin', 'manager']) assert.ok(C.canOpenCalendarOf(r, 'me', [], 'someone'), r)
  assert.ok(C.canOpenCalendarOf('team_lead', 'me', ['me', 'asha'], 'asha'))
  assert.ok(!C.canOpenCalendarOf('team_lead', 'me', ['me', 'asha'], 'ravi'))
  for (const r of ['sales_exec', 'post_sales']) {
    assert.ok(C.canOpenCalendarOf(r, 'me', [], 'me'), r)
    assert.ok(!C.canOpenCalendarOf(r, 'me', [], 'someone'), r)
  }
  assert.equal(C.calendarScope('sales_exec'), 'own')
})

const item = (id, dueAt, extra = {}) => ({ id, leadId: 'l' + id, leadName: 'Lead ' + id, leadStatus: 'new', kind: 'call', dueAt, status: 'open', note: null, assigneeId: 'asha', assigneeName: 'Asha', siteVisitId: null, ...extra })

test('items group by local day in time order; overdue is open and past; workload counts per person', () => {
  const now = new Date('2026-11-25T06:00:00Z')
  const items = [item('b', '2026-11-25T10:00:00Z'), item('a', '2026-11-25T04:00:00Z'), item('c', '2026-11-24T19:00:00Z'), item('d', '2026-11-26T05:00:00Z', { assigneeId: 'ravi', assigneeName: 'Ravi', status: 'done' })]
  const g = C.byDay(items, 'Asia/Kolkata')
  assert.deepEqual(g.get('2026-11-25').map((i) => i.id), ['c', 'a', 'b'], 'c is 00:30 on the 25th in India')
  assert.ok(C.isOverdue(items[1], now) && !C.isOverdue(items[0], now) && !C.isOverdue(items[3], now))
  const w = C.workload(items, 'Asia/Kolkata', now)
  assert.deepEqual(w.map((x) => [x.name, x.open, x.overdue, x.done]), [['Asha', 3, 2, 0], ['Ravi', 0, 0, 1]])
  assert.equal(w[0].busiestDay, '2026-11-25')
})

test('wiring: permission checks on the server, existing APIs for changes, site visits changed on the visit, archived leads hidden', () => {
  const page = read('app/(dashboard)/[orgSlug]/calendar/page.tsx')
  assert.match(page, /if \(!canOpenCalendarOf\(role, profile\.id, teamIds, sp\.person\)\) notFound\(\)/)
  assert.match(page, /if \(role === 'readonly'\) notFound\(\)/)
  const board = read('components/calendar/CalendarBoard.tsx')
  assert.match(board, /fetch\(`\/api\/leads\/\$\{item\.leadId\}\/tasks\/\$\{item\.id\}`, \{ method: 'PATCH'/, 'complete and reschedule use the follow-up API')
  assert.match(board, /<AssignLeadDialog /, 'reassign uses the assignment dialog and its API')
  assert.match(board, /const movable = it\.status === 'open' && !it\.siteVisitId/, 'site visits are not dragged')
  assert.match(board, /item\.status === 'open' && !item\.siteVisitId &&/, 'nor completed or moved from the calendar')
  assert.doesNotMatch(board, /createServiceClient|supabase/, 'the board has no data access of its own')
  const dal = read('lib/dal/calendar.ts')
  assert.equal((dal.match(/\.is\('lead\.deleted_at', null\)/g) ?? []).length, 2)
  assert.equal((dal.match(/\.eq\('org_id', orgId\)/g) ?? []).length, 3, 'every query is scoped to the workspace')
})

console.log(`\nSales calendar: ${passed} checks passed.`)
