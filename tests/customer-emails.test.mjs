// tests/customer-emails.test.mjs — the account e-mails customers receive (real templates via jiti).
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const { customerEmails } = await jiti.import(path.join(root, 'lib/email/customer.ts'))
let passed = 0
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`) }
const u = 'https://app.example.org/acme'
console.log('CUSTOMER E-MAILS')
test('every e-mail has a subject, HTML, a text version and one button', () => {
  const all = [
    customerEmails.welcome({ orgName: 'Acme', url: u }),
    customerEmails.trial_ending({ orgName: 'Acme', endsAt: '2026-12-01T00:00:00Z', daysLeft: 3, url: u }),
    customerEmails.trial_ended({ orgName: 'Acme', url: u }),
    customerEmails.invoice_issued({ orgName: 'Acme', invoiceNumber: 'INV-1', amountCents: 1416000, dueDate: '2026-12-01', url: u }),
    customerEmails.payment_received({ orgName: 'Acme', amountCents: 1416000, reference: 'pay_1', invoiceNumber: 'INV-1', url: u }),
    customerEmails.payment_failed({ orgName: 'Acme', amountCents: 1416000, invoiceNumber: null, url: u }),
    customerEmails.workspace_state({ orgName: 'Acme', to: 'suspended', reason: 'Payment overdue', url: u }),
  ]
  for (const e of all) { assert.ok(e.subject.length > 5); assert.match(e.html, /<html/); assert.ok(e.text.includes(u)); assert.equal((e.html.match(/href="https:\/\/app\.example\.org\/acme"/g) ?? []).length, 2) }
})
test('amounts are in rupees with GST wording; dates in Indian format', () => {
  const e = customerEmails.invoice_issued({ orgName: 'Acme', invoiceNumber: 'INV-1', amountCents: 1416000, dueDate: '2026-12-01', url: u })
  assert.match(e.subject, /₹14,160/); assert.match(e.text, /including GST/); assert.match(e.text, /1 Dec 2026/)
})
test('trial wording changes on the last day; names are escaped', () => {
  assert.match(customerEmails.trial_ending({ orgName: 'A', endsAt: '2026-12-01T00:00:00Z', daysLeft: 1, url: u }).subject, /tomorrow/)
  assert.doesNotMatch(customerEmails.welcome({ orgName: '<script>x</script>', url: u }).html, /<script>x/)
})
console.log(`\nCustomer e-mails: ${passed} checks passed.`)
