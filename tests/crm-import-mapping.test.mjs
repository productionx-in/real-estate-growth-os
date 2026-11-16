// tests/crm-import-mapping.test.mjs — CRM export → REGrow mapping (real lib/import/crm-mapping.ts via jiti).
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const m = await createJiti(import.meta.url, { alias: { '@': root } }).import(path.join(root, 'lib/import/crm-mapping.ts'))
let passed = 0
const test = (n, fn) => { fn(); passed++; console.log(`  ✓ ${n}`) }
console.log('CRM IMPORT MAPPING')
test('sources from Sell.Do / spreadsheets', () => {
  const cases = { 'Facebook': 'meta_ads', 'FB Lead Ads': 'meta_ads', 'Instagram': 'meta_ads', 'Google Ads': 'google_ads', 'Adwords': 'google_ads',
    '99 Acres': '99acres', 'MagicBricks': 'magicbricks', 'Housing.com': 'housing', 'WhatsApp': 'whatsapp', 'Walk-in': 'walk_in',
    'Channel Partner': 'referral', 'Website': 'website', 'Landing Page': 'website', 'meta_ads': 'meta_ads', '': 'csv_import', 'Hoarding': 'other' }
  for (const [raw, want] of Object.entries(cases)) assert.equal(m.mapSource(raw), want, raw)
})
test('stages map to statuses without false positives', () => {
  const cases = { 'Not Interested': 'lost', 'Interested': 'qualified', 'Site Visit Done': 'site_visited', 'Site Visit Scheduled': 'site_visit_scheduled',
    'Booked': 'booked', 'Junk': 'junk', 'Wrong Number': 'junk', 'Follow Up': 'contacted', 'Call Back': 'contacted', 'New': 'new', '': 'new',
    'Negotiation': 'negotiation', 'Closed Lost': 'lost', 'Something odd': 'contacted' }
  for (const [raw, want] of Object.entries(cases)) assert.equal(m.mapStatus(raw), want, raw)
})
test('created dates: Indian formats kept; future and absurd dates dropped', () => {
  assert.equal(m.mapCreatedAt('16/11/2026 02:05 PM', Date.UTC(2026, 11, 1)), '2026-11-16T14:05:00.000Z')
  assert.equal(m.mapCreatedAt('16/11/2030', Date.UTC(2026, 11, 1)), null)
  assert.equal(m.mapCreatedAt('01/01/1990'), null)
  assert.equal(m.mapCreatedAt(''), null)
})
test('name normalisation for owner matching', () => {
  assert.equal(m.normaliseName('  Asha  K. '), 'asha k.')
  assert.equal(m.normaliseName('ASHA.K@Skyline.in'), 'asha.k@skyline.in')
})
console.log(`\nALL ${passed} CRM IMPORT MAPPING TESTS PASSED`)
