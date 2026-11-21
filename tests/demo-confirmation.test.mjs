// tests/demo-confirmation.test.mjs — the e-mail a person gets when they ask for a demo, and the sales alert
// (real modules via jiti; wiring checked in source).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const { leadMath, volumeRange, demoConfirmationEmail, demoAlertEmail } = await jiti.import(path.join(root, 'lib/email/demo-request.ts'))
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8')
let passed = 0
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`) }
const base = { name: 'Ravi Kumar', phone: '+91 98765 43210', email: 'ravi@skyline.in', companyName: 'Skyline Developers', companyType: 'developer', teamSize: 10,
  interest: 'A product demo · REGrow for Developers', leadVolume: '300–1,000', currentTool: 'Excel / Google Sheets / WhatsApp', message: null }

console.log('DEMO REQUEST E-MAILS')
test('the arithmetic: leads per salesperson per month and per working day', () => {
  assert.deepEqual(volumeRange('300–1,000'), [300, 1000]); assert.deepEqual(volumeRange('Under 300'), [100, 300]); assert.deepEqual(volumeRange('Over 3,000'), [3000, 6000])
  assert.match(leadMath('300–1,000', 10), /30–100 new leads per salesperson a month — 1–4 every working day/)
  assert.match(leadMath('1,000–3,000', 5), /200–600 .* 8–24 every working day/)
  assert.match(leadMath('300–1,000', 50), /about one every 2 working days/)
  assert.match(leadMath('Over 3,000', 20), /^With over 3,000 leads/)
  assert.equal(leadMath(null, 10), null); assert.equal(leadMath('300–1,000', null), null)
})
test('the confirmation is personal: first name, company, their phone, their tool, the next step', () => {
  const e = demoConfirmationEmail(base, { site: 'https://site.example.org' })
  assert.match(e.subject, /^Thanks, Ravi — we’ve received your REGrow demo request$/)
  for (const s of ['Hi Ravi', 'Skyline Developers', '+91 98765 43210', '30–100 new leads per salesperson', 'sheets and WhatsApp', 'the projects you’re selling'])
    assert.ok(e.text.includes(s), s)
  assert.ok(e.text.includes('https://site.example.org/features'))
})
test('agencies, migrations and consultations each get their own wording', () => {
  const a = demoConfirmationEmail({ ...base, companyType: 'channel_partner', interest: 'A migration assessment · REGrow for Agencies', currentTool: 'A real estate CRM' }, { site: 'https://s.example.org' })
  assert.match(a.subject, /migration request/); assert.match(a.text, /your buyers stay yours/); assert.match(a.text, /run both side by side/); assert.match(a.text, /developers and projects you sell/)
  assert.match(demoConfirmationEmail({ ...base, interest: 'A consultation about our sales process' }, { site: 'https://s.example.org' }).subject, /consultation request/)
})
test('no promises REGrow cannot keep, and nothing unsafe from the form gets into the HTML', () => {
  const e = demoConfirmationEmail({ ...base, name: '<b>Evil</b>', companyName: '<script>x</script>' }, { site: 'https://s.example.org' })
  assert.doesNotMatch(e.text, /within \d+ (hours|minutes)|guarantee|%/i)
  assert.doesNotMatch(e.html, /<script>x|<b>Evil/)
  const minimal = demoConfirmationEmail({ ...base, leadVolume: null, teamSize: null, currentTool: null, companyName: null }, { site: 'https://s.example.org' })
  assert.match(minimal.text, /We’ve received your request/)
})
test('sales alert lists every answer and links to the console; says when no confirmation went out', () => {
  const a = demoAlertEmail({ ...base, email: null, message: 'Launching in January' }, { console: 'https://app.example.org/platform/sales?stage=new' })
  assert.match(a.subject, /New demo request: Skyline Developers \(developer, team of 10\)/)
  for (const s of ['+91 98765 43210', '300–1,000', 'Excel / Google Sheets / WhatsApp', 'Launching in January', 'no confirmation was sent']) assert.ok(a.text.includes(s), s)
})
test('the endpoint sends after saving (never blocks or fails the request), only for real submissions', () => {
  const r = read('app/api/website/demo-request/route.ts')
  assert.match(r, /after\(async \(\) => \{/); assert.match(r, /if \(details\.email\)/); assert.match(r, /REGROW_SALES_NOTIFY_EMAIL/)
  assert.ok(r.indexOf('after(async') > r.indexOf("from('internal_prospects').insert"), 'e-mails only after the request is saved')
  assert.ok(r.indexOf('if (b.website_url_hp || tooFast) return') < r.indexOf('after(async'), 'bots get no e-mail')
  assert.ok(r.indexOf('if (recent?.length) return') < r.indexOf('after(async'), 'a repeat within a day gets no second e-mail')
})
console.log(`\nDemo request e-mails: ${passed} checks passed.`)
