// tests/payments-gst.test.mjs — invoice tax lines from the issued snapshot (lib/billing/tax.ts), the missing-GST check
// used by alerts, and that the GST and billing-profile endpoints keep their authorisation.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root }, moduleCache: false })
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8')
let passed = 0
async function test(name, fn) { await fn(); passed++; console.log(`  ✓ ${name}`) }
const base = { tax_cents: 1800, gst_rate_bps: 1800, cgst_cents: 0, sgst_cents: 0, igst_cents: 0, supplier_gstin: '27ABCDE1234F1Z5', supplier_legal_name: 'S Pvt Ltd', supplier_state_code: '27', sac_code: '998314', customer_gstin: null, customer_legal_name: null, place_of_supply: '27' }

console.log('PAYMENTS GST')
const { invoiceTaxLines, isTaxInvoice } = await jiti.import(path.join(root, 'lib/billing/tax.ts'))
const { gstMissing } = await jiti.import(path.join(root, 'lib/payments/monitoring.ts'))

await test('tax lines: CGST+SGST, IGST, or a single GST line; the rate is never invented', async () => {
  assert.deepEqual(invoiceTaxLines({ ...base, cgst_cents: 900, sgst_cents: 900 }), [{ label: 'CGST (9%)', cents: 900 }, { label: 'SGST (9%)', cents: 900 }])
  assert.deepEqual(invoiceTaxLines({ ...base, igst_cents: 1800 }), [{ label: 'IGST (18%)', cents: 1800 }])
  assert.deepEqual(invoiceTaxLines(base), [{ label: 'GST (18%)', cents: 1800 }])
  assert.deepEqual(invoiceTaxLines({ ...base, gst_rate_bps: null }), [{ label: 'GST', cents: 1800 }])
  assert.deepEqual(invoiceTaxLines({ ...base, tax_cents: 1801, cgst_cents: 900, sgst_cents: 901 }).map((l) => l.cents), [900, 901], 'odd paise kept')
})

await test('a tax invoice needs every particular: supplier name, GSTIN, SAC, place of supply, rate and split', async () => {
  assert.equal(isTaxInvoice({ ...base, igst_cents: 1800 }), true)
  for (const k of ['supplier_gstin', 'supplier_legal_name', 'sac_code', 'place_of_supply', 'gst_rate_bps']) assert.equal(isTaxInvoice({ ...base, igst_cents: 1800, [k]: null }), false, k)
  assert.equal(isTaxInvoice(base), false, 'no split')
})

await test('missing GST particulars are listed, nothing assumed', async () => {
  assert.deepEqual(gstMissing(null), ['supplier legal name', 'supplier GSTIN', 'supplier state code', 'SAC code'])
  assert.deepEqual(gstMissing({ supplier_legal_name: 'X', supplier_gstin: '27ABCDE1234F1Z5', supplier_state_code: '27', sac_code: '998314' }), [])
})

await test('authorisation: GST particulars are Platform Owner only; billing details owners/admins only, audited', async () => {
  const admin = read('app/api/admin/payments/route.ts')
  assert.match(admin, /OWNER_ONLY = new Set\(\[[^\]]*'update_gst'/)
  assert.match(admin, /authenticatePlatformAdmin\(OWNER_ONLY\.has\(a\.action\) \? \['super_admin'\]/)
  const profile = read('app/api/billing/profile/route.ts')
  assert.match(profile, /authorizeBillingAccess\(b\.orgId\)/)
  assert.match(profile, /recordOrgAudit\(/)
  assert.doesNotMatch(profile, /^export const /m, 'route files export handlers only')
  const invoice = read('app/(dashboard)/[orgSlug]/billing/invoices/[invoiceId]/page.tsx')
  assert.doesNotMatch(invoice, /GST \(18%\)|Production X/, 'no hard-coded rate or supplier')
})

console.log(`Payments GST: ${passed} checks passed`)
