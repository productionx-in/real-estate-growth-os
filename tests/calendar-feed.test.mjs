// tests/calendar-feed.test.mjs — calendar sync: the iCalendar feed is well formed, private, and only ever the owner's.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const I = await jiti.import(path.join(root, 'lib/calendar/ics.ts'))
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8')
let n = 0
const test = (name, fn) => { fn(); n++; console.log('  ✓', name) }
console.log('CALENDAR FEED')

const now = new Date('2026-11-27T05:00:00Z')
const item = (o) => ({ id: 't1', leadId: 'l1', leadName: 'Asha, Rao; test', leadStatus: 'new', kind: 'call', dueAt: '2026-11-28T06:30:00Z', status: 'open', note: 'Line one\nLine two', assigneeId: 'p', assigneeName: 'P', siteVisitId: null, ...o })

test('a valid calendar: CRLF lines, one event per follow-up, escaped text, reminder for future open items', () => {
  const ics = I.buildIcs([item(), item({ id: 't2', kind: 'site_visit', status: 'done' }), item({ id: 't3', status: 'cancelled' })], { calendarName: 'RE · Test', leadUrl: (id) => `https://re.example/${id}`, now })
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.endsWith('END:VCALENDAR\r\n'))
  assert.equal((ics.match(/BEGIN:VEVENT/g) ?? []).length, 2, 'cancelled follow-ups are left out')
  assert.match(ics, /SUMMARY:Call: Asha\\, Rao\; test/)
  assert.match(ics, /DTSTART:20261128T063000Z/)
  assert.match(ics, /DTEND:20261128T064500Z/, 'calls last 15 minutes')
  assert.match(ics, /SUMMARY:✓ Site visit/)
  assert.equal((ics.match(/BEGIN:VALARM/g) ?? []).length, 1, 'reminders only for open, future items')
  for (const line of ics.split('\r\n')) assert.ok(Buffer.byteLength(line, 'utf8') <= 75, line)
})
test('folding keeps every line within 75 octets and joins back to the original', () => {
  const long = 'DESCRIPTION:' + 'ಕನ್ನಡ '.repeat(40)
  const folded = I.fold(long)
  for (const l of folded.split('\r\n')) assert.ok(Buffer.byteLength(l, 'utf8') <= 75)
  assert.equal(folded.split('\r\n').map((l, i) => (i ? l.slice(1) : l)).join(''), long)
})
test('privacy: only a hash of the link is stored; the table is server-only; the feed shows the owner only', () => {
  const mig = read('supabase/migrations/20260112_calendar_feeds.sql')
  assert.match(mig, /ENABLE ROW LEVEL SECURITY/); assert.match(mig, /REVOKE ALL ON public\.calendar_feeds FROM anon, authenticated/)
  assert.match(mig, /token_hash\s+TEXT NOT NULL UNIQUE/)
  const dal = read('lib/dal/calendar-feed.ts')
  assert.match(dal, /createHash\('sha256'\)/); assert.match(dal, /randomBytes\(32\)/)
  assert.match(dal, /member\.status !== 'active'/, 'a link stops working when the person leaves the workspace')
  const route = read('app/api/calendar/feed/[token]/route.ts')
  assert.match(route, /calendarItems\(feed\.orgId, days, tz, \[feed\.profileId\], now\)/, 'only the link owner’s own follow-ups')
  assert.match(route, /checkDistributedRateLimit/)
  const api = read('app/api/calendar/feed/route.ts')
  assert.match(api, /issueFeed\(parsed\.data\.orgId, access\.context\.profile\.id\)/, 'people make links for themselves only')
})
console.log(`Calendar feed: ${n} checks passed.`)
