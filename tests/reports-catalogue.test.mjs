// tests/reports-catalogue.test.mjs — the reports catalogue counts only recorded facts (a first action, a completed site
// visit, a booking that is not cancelled) for the leads created in the period; nothing is estimated; the overview no
// longer invents visits or a default sales velocity; CSV cells cannot run as formulas; access is server-checked.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const C = await jiti.import(path.join(root, 'lib/reports/catalogue.ts'))
const X = await jiti.import(path.join(root, 'lib/reports/csv.ts'))
let passed = 0
const test = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`) }

const L = (id, o = {}) => ({ id, source: 'website', status: 'new', assigned_to: 'a', created_at: '2026-11-20T05:00:00Z', first_action_at: null, ...o })
const leads = [
  L('1', { first_action_at: 'x', status: 'booked' }), L('2', { first_action_at: 'x', status: 'site_visited' }), L('3', { source: 'meta_ads', assigned_to: 'b' }),
  L('4', { source: 'meta_ads', assigned_to: null, first_action_at: 'x', status: 'lost', created_at: '2026-11-21T20:00:00Z' }),
]
const visits = [{ lead_id: '1', status: 'completed' }, { lead_id: '2', status: 'completed' }, { lead_id: '3', status: 'scheduled' }, { lead_id: '4', status: 'cancelled' }]
const bookings = [{ lead_id: '1', status: 'confirmed', total_amount: 5_000_000 }, { lead_id: '4', status: 'cancelled', total_amount: 9_000_000 }]
const c = C.buildCatalogue(leads, visits, bookings, { from: new Date('2026-11-19T00:00:00Z'), to: new Date('2026-11-22T00:00:00Z') })

console.log('REPORTS CATALOGUE')

test('funnel from recorded facts: contacted, completed visits, bookings not cancelled', () => {
  assert.deepEqual(c.funnel.map((s) => [s.key, s.count]), [['enquiries', 4], ['contacted', 3], ['visited', 2], ['booked', 1]])
  assert.equal(c.funnel[1].fromPrevious, 75); assert.equal(c.funnel[3].fromTop, 25); assert.equal(c.funnel[0].fromPrevious, null)
  assert.equal(c.totals.value, 5_000_000, 'a cancelled booking adds no value')
})

test('sources and team: each lead counted under its own source and assignee; sorted by bookings', () => {
  assert.deepEqual(c.sources.map((s) => [s.source, s.leads, s.visited, s.booked, s.value, s.bookingRate]), [['website', 2, 2, 1, 5_000_000, 50], ['meta_ads', 2, 0, 0, 0, 0]])
  assert.deepEqual(c.people.map((p) => [p.profileId, p.leads, p.booked, p.contactRate]), [['a', 2, 1, 100], [null, 1, 0, 100], ['b', 1, 0, 0]])
})

test('leads report: status counts and one row per India day, zeros included', () => {
  assert.deepEqual(c.byStatus, { booked: 1, site_visited: 1, new: 1, lost: 1 })
  assert.deepEqual(c.daily, [{ day: '2026-11-19', leads: 0 }, { day: '2026-11-20', leads: 3 }, { day: '2026-11-21', leads: 0 }, { day: '2026-11-22', leads: 1 }], '20:00 UTC on the 21st is the 22nd in India')
  assert.equal(C.buildCatalogue([], [], []).funnel[1].fromPrevious, null, 'no division by zero')
})

test('CSV: formula-looking cells are escaped, quotes doubled', () => {
  assert.equal(X.cell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`); assert.equal(X.cell('-5'), "'-5"); assert.equal(X.cell('@a'), "'@a"); assert.equal(X.cell('plain'), 'plain')
  assert.match(X.catalogueCsv('funnel', c, new Map()), /^Stage,Leads,% of previous,% of enquiries\r\nEnquiries,4,,\r\n/)
})

test('the overview no longer invents numbers; access is checked on the server', () => {
  const a = read('lib/dal/analytics.ts')
  assert.doesNotMatch(a, /\* 0\.25|: 18 \/\/ default/, 'no fabricated visits or default velocity')
  assert.match(a, /if \(src && v\.status === 'completed'\) bump\(src\)\.visits\+\+/)
  assert.match(read('app/(dashboard)/[orgSlug]/analytics/page.tsx'), /if \(leadScopeOf\(role\) !== 'all'\) redirect/)
  const api = read('app/api/reports/catalogue/route.ts')
  assert.match(api, /authorizeOrgAccess\(orgId, \['owner', 'admin', 'manager', 'readonly'\]\)/); assert.match(api, /requireModule\(orgId, 'analytics'\)/)
  const dal = read('lib/dal/report-catalogue.ts')
  for (const t of ["from('leads')", "from('site_visits')", "from('bookings')"]) assert.ok(dal.includes(`${t}.select`), t)
  assert.equal((dal.match(/\.eq\('org_id', orgId\)/g) ?? []).length, 4, 'every query scoped by organisation')
})

console.log(`\nReports catalogue: ${passed} checks passed.`)
