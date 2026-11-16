// tests/leakage-audit.test.mjs — lead-leakage audit maths (real lib/audit/leakage.ts via jiti).
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const a = await createJiti(import.meta.url, { alias: { '@': root } }).import(path.join(root, 'lib/audit/leakage.ts'))
let passed = 0
const test = (n, fn) => { fn(); passed++; console.log(`  ✓ ${n}`) }
console.log('LEAD-LEAKAGE AUDIT')

test('parses Indian CRM date formats (day-first), ISO and Excel serials', () => {
  const u = (y, mo, d, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h, mi)
  assert.equal(a.parseDate('16/11/2026 14:05'), u(2026, 11, 16, 14, 5))
  assert.equal(a.parseDate('16-11-2026 2:05 PM'), u(2026, 11, 16, 14, 5))
  assert.equal(a.parseDate('05/01/26 12:30 am'), u(2026, 1, 5, 0, 30))
  assert.equal(a.parseDate('16 Nov 2026 09:00'), u(2026, 11, 16, 9))
  assert.equal(a.parseDate('16 November 2026'), u(2026, 11, 16))
  assert.equal(a.parseDate('2026-11-16T14:05:00Z'), u(2026, 11, 16, 14, 5))
  assert.equal(a.parseDate(46342), u(2026, 11, 16))
  assert.equal(a.parseDate('13/13/2026'), null)
  assert.equal(a.parseDate(''), null)
  assert.equal(a.parseDate('not a date'), null)
})
test('guesses columns from typical Sell.Do / spreadsheet headers', () => {
  const m = a.guessMapping(['Lead ID', 'Created At', 'First Call At', 'Lead Source', 'Stage', 'Sales Person'])
  assert.deepEqual(m, { createdAt: 'Created At', firstContactAt: 'First Call At', source: 'Lead Source', status: 'Stage', owner: 'Sales Person' })
})
const rec = (created, first, source, status, owner) => ({ c: created, f: first, s: source, st: status, o: owner })
const map = { createdAt: 'c', firstContactAt: 'f', source: 's', status: 'st', owner: 'o' }
const rows = a.toAuditRows([
  rec('01/11/2026 10:00', '01/11/2026 10:03', 'Facebook', 'Contacted', 'Asha'),   // 3 min
  rec('01/11/2026 11:00', '01/11/2026 11:20', 'Facebook', 'Qualified', 'Asha'),   // 20 min
  rec('02/11/2026 22:00', '03/11/2026 10:00', '99acres', 'Contacted', 'Ravi'),    // 12 h
  rec('03/11/2026 09:00', '05/11/2026 09:30', '99acres', 'Contacted', 'Ravi'),    // > 24 h
  rec('04/11/2026 09:00', '', 'Facebook', 'New', 'Ravi'),                          // never
  rec('05/11/2026 09:00', '', 'Google', 'Junk', 'Asha'),                           // junk, not "never"
  rec('', '', 'Google', 'New', 'Asha'),                                            // no date: skipped
  rec('06/11/2026 09:00', '06/11/2026 08:00', 'Google', 'Contacted', 'Asha'),     // contact before creation: bad data
], map)
const r = a.analyse(rows, { hasFirstContact: true })
test('overall: analysed vs skipped, contacted, never contacted, junk', () => {
  assert.deepEqual([r.totalRows, r.analysedLeads, r.skippedNoDate], [8, 7, 1])
  assert.deepEqual([r.contacted, r.neverContacted, r.junk], [4, 1, 1])
})
test('response times: median, within 5 min / 1 h, over 24 h, leaked', () => {
  assert.equal(r.medianMin, (20 + 720) / 2)
  assert.deepEqual([r.within5, r.within60, r.over24h], [1, 2, 1])
  assert.equal(r.leaked, 1 + 2) // never contacted + 2 contacted after an hour
})
test('by source and by salesperson', () => {
  const fb = r.bySource.find((g) => g.name === 'Facebook')
  assert.deepEqual([fb.leads, fb.contacted, fb.neverContacted, fb.within5], [3, 2, 1, 1])
  const ravi = r.byOwner.find((g) => g.name === 'Ravi')
  assert.deepEqual([ravi.leads, ravi.neverContacted], [3, 1])
})
test('without a first-contact column, "never contacted" falls back to the stage', () => {
  const r2 = a.analyse(a.toAuditRows([rec('01/11/2026', '', 'X', 'New', 'A'), rec('01/11/2026', '', 'X', 'Site visit', 'A')], { createdAt: 'c', status: 'st' }), { hasFirstContact: false })
  assert.equal(r2.neverContacted, 1)
  assert.equal(r2.medianMin, null)
})
test('wasted spend: leaked leads per month × cost per lead', () => {
  const w = a.wastedSpend(r, 300000)
  assert.ok(w.costPerLead > 0 && w.wasted > 0)
  assert.equal(a.wastedSpend(r, 0), null)
})
console.log(`\nALL ${passed} LEAKAGE AUDIT TESTS PASSED`)
