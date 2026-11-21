// tests/documents.test.mjs
// Document templates: merge fields (lib/documents/merge.ts), the text-to-blocks parser behind the safe display
// (lib/documents/blocks.ts), link-preview detection, and that nothing renders document text as HTML.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const m = await jiti.import(path.join(root, 'lib/documents/merge.ts'))
const b = await jiti.import(path.join(root, 'lib/documents/blocks.ts'))
const lh = await jiti.import(path.join(root, 'lib/documents/letterhead.ts'))
const lib = await jiti.import(path.join(root, 'lib/documents/library.ts'))

let passed = 0
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`) }
const ctx = m.SAMPLE_CONTEXT

console.log('DOCUMENTS')

test('fields fill in; prices in Indian format; dates in the organisation’s time zone', () => {
  const out = m.renderTemplate('{{lead.name}} · {{unit.total_price}} · {{unit.base_rate}} · {{unit.carpet_area}} · {{today}} · {{valid_until}}', ctx)
  assert.equal(out, 'Priya Sharma · ₹1,44,99,000 · ₹8,950 per sq ft · 1,180 sq ft · 18 November 2026 · 3 December 2026')
})

test('a missing value shows “—” and is listed before creating; unknown placeholders are left visible and reported', () => {
  const noUnit = { ...ctx, unit: null, agent: null }
  assert.equal(m.renderTemplate('Unit {{unit.number}} by {{agent.name}}', noUnit), 'Unit — by —')
  assert.deepEqual(m.missingFields('{{lead.name}} {{unit.number}} {{agent.phone}} {{unit.number}}', noUnit), ['unit.number', 'agent.phone'])
  assert.equal(m.renderTemplate('Hi {{lead.nmae}}', ctx), 'Hi {{lead.nmae}}')
  assert.deepEqual(m.unknownFields('{{lead.nmae}} {{ lead.name }} {{foo}}'), ['lead.nmae', 'foo'])
  assert.deepEqual(m.unknownFields(m.STARTER_COST_SHEET), [], 'the starter template only uses real fields')
})

test('the price breakup becomes a table; values that are not numbers are skipped; | and new lines cannot break it', () => {
  const t = m.fieldValue('unit.price_breakup', { ...ctx, unit: { ...ctx.unit, pricing_breakup: { 'Base | price\nx': 100, Note: 'n/a', GST: 5 } } })
  assert.equal(t, '| Item | Amount |\n|---|---|\n| Base   price x | ₹100 |\n| GST | ₹5 |')
  assert.equal(m.fieldValue('unit.price_breakup', { ...ctx, unit: { ...ctx.unit, pricing_breakup: [] } }), null)
  const order = m.fieldValue('unit.price_breakup', { ...ctx, unit: { ...ctx.unit, pricing_breakup: { 'GST (5%)': 5, 'Stamp duty': 6, 'Base price': 100, 'Car park': 10 } } })
  assert.deepEqual(order.split('\n').slice(2).map((r) => r.split('|')[1].trim()), ['Base price', 'Car park', 'GST (5%)', 'Stamp duty'], 'price items first, taxes and charges last')
})

test('every field in the picker has a value in the sample, so the editor preview is never empty', () => {
  for (const g of m.FIELD_GROUPS) for (const f of g.fields) assert.notEqual(m.fieldValue(f.key, ctx), null, f.key)
})

test('display blocks: headings, paragraphs, bold, lists and tables', () => {
  const blocks = b.toBlocks('# Title\n\nHello **Priya**,\nwelcome.\n\n- one\n- two\n\n| A | B |\n|---|---|\n| 1 | 2 |')
  assert.deepEqual(blocks.map((x) => x.type), ['h1', 'p', 'ul', 'table'])
  assert.deepEqual(blocks[1].inline, [{ text: 'Hello ', bold: false }, { text: 'Priya', bold: true }, { text: ',\nwelcome.', bold: false }])
  assert.deepEqual(blocks[3].head.map((c) => c[0].text), ['A', 'B'])
  assert.deepEqual(blocks[3].rows[0].map((c) => c[0].text), ['1', '2'])
})

test('markup in a template or a lead’s name stays text: the display never renders HTML', () => {
  const evil = m.renderTemplate('Dear {{lead.name}}', { ...ctx, lead: { ...ctx.lead, name: '<img src=x onerror=alert(1)>' } })
  const blocks = b.toBlocks(evil)
  assert.equal(blocks[0].inline[0].text, 'Dear <img src=x onerror=alert(1)>')
  for (const f of ['components/documents/DocumentBody.tsx', 'app/d/[token]/page.tsx', 'components/documents/LeadDocuments.tsx', 'components/documents/TemplateEditor.tsx']) {
    assert.doesNotMatch(fs.readFileSync(path.join(root, f), 'utf8'), /dangerouslySetInnerHTML/, f)
  }
})

test('link previews (WhatsApp, Facebook, Slack, bots) do not count as the buyer opening the document', async () => {
  const src = fs.readFileSync(path.join(root, 'lib/dal/documents.ts'), 'utf8')
  const re = new RegExp(src.match(/const PREVIEW_AGENTS = \/(.+)\/i/)[1], 'i')
  for (const ua of ['WhatsApp/2.23.20.0 A', 'facebookexternalhit/1.1', 'Slackbot-LinkExpanding 1.0', 'TelegramBot (like TwitterBot)', 'Googlebot/2.1', 'HeadlessChrome']) assert.ok(re.test(ua), ua)
  for (const ua of ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Version/18.1 Mobile/15E148 Safari/604.1']) assert.ok(!re.test(ua), ua)
})

test('share links are 256-bit random tokens; the public page sends no referrer and is not indexed', () => {
  const dal = fs.readFileSync(path.join(root, 'lib/dal/documents.ts'), 'utf8')
  assert.match(dal, /share_token: crypto\.randomBytes\(32\)\.toString\('base64url'\)/)
  const page = fs.readFileSync(path.join(root, 'app/d/[token]/page.tsx'), 'utf8')
  assert.match(page, /robots: \{ index: false, follow: false \}/)
  assert.match(page, /referrer: 'no-referrer'/)
})

test('built-in templates: only real fields, every kind valid, filled in completely with sample data', () => {
  const kinds = Object.keys((fs.readFileSync(path.join(root, 'lib/documents/kinds.ts'), 'utf8').match(/TEMPLATE_KINDS = \{([\s\S]*?)\}/)[1]).match(/(\w+):/g).map((k) => k.slice(0, -1)).reduce((o, k) => ({ ...o, [k]: 1 }), {}))
  const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20260071_document_letterhead.sql'), 'utf8')
  assert.ok(lib.LIBRARY.length >= 8)
  for (const t of lib.LIBRARY) {
    assert.deepEqual(m.unknownFields(t.body), [], t.key)
    assert.ok(kinds.includes(t.kind) && migration.includes(`'${t.kind}'`), `${t.key}: kind ${t.kind} is allowed by the database`)
    assert.deepEqual(m.missingFields(t.body, ctx), [], `${t.key}: every field has a sample value`)
    assert.ok(t.body.length < 20000 && t.name.length <= 80)
  }
  assert.equal(new Set(lib.LIBRARY.map((t) => t.name)).size, lib.LIBRARY.length, 'names are unique')
  const dev = lib.libraryFor('developer').map((t) => t.audience); const cp = lib.libraryFor('channel_partner').map((t) => t.audience)
  assert.ok(!dev.includes('channel_partner') && !cp.includes('developer'), 'each workspace sees the templates that suit it')
  assert.ok(cp.includes('channel_partner'), 'agencies get agency templates')
})

test('business details: codes upper-cased, blanks dropped, every rule matches the database CHECK', () => {
  const ok = lh.normaliseProfile({ legalName: '  Skyline Pvt Ltd ', gstin: '29abcde1234f1z5', pan: 'abcde1234f', bankIfsc: 'hdfc0000123', bankAccountNumber: '5020 0012 3456', pincode: '560001', city: '' })
  assert.deepEqual(ok.errors, {})
  assert.deepEqual([ok.profile.legalName, ok.profile.gstin, ok.profile.pan, ok.profile.bankIfsc, ok.profile.bankAccountNumber, ok.profile.city], ['Skyline Pvt Ltd', '29ABCDE1234F1Z5', 'ABCDE1234F', 'HDFC0000123', '502000123456', null])
  const bad = lh.normaliseProfile({ gstin: '29ABC', pan: '1234', pincode: '012345', email: 'nope', website: 'skyline.in', logoUrl: 'http://x.in/l.png', bankIfsc: 'HDFC1000123' })
  assert.deepEqual(Object.keys(bad.errors).sort(), ['bankIfsc', 'email', 'gstin', 'logoUrl', 'pan', 'pincode', 'website'])
  const sql = fs.readFileSync(path.join(root, 'supabase/migrations/20260071_document_letterhead.sql'), 'utf8')
  for (const col of Object.values(lh.PROFILE_COLUMNS)) assert.match(sql, new RegExp(`\\n  ${col}\\s+TEXT`), `column ${col}`)
})

test('letterhead: registered name, address line, contacts and registrations; malformed stored data is dropped', () => {
  const l = lh.buildLetterhead('Skyline', ctx.org.profile)
  assert.equal(l.name, 'Skyline Developers Private Limited')
  assert.equal(l.address, '4th Floor, Prestige Meridian, 29 MG Road, Bengaluru, Karnataka 560001')
  assert.deepEqual(l.contact, ['+91 80 4000 1234', 'sales@skyline.example', 'skyline.example'])
  assert.deepEqual(l.registrations, ['GSTIN 29ABCDE1234F1Z5', 'RERA PRM/KA/RERA/1251/446/PR/010125/007321'])
  assert.equal(lh.buildLetterhead('Skyline', lh.EMPTY_PROFILE).name, 'Skyline', 'falls back to the workspace name')
  assert.deepEqual(lh.parseLetterhead(JSON.parse(JSON.stringify(l))), l, 'survives the jsonb round trip')
  assert.equal(lh.parseLetterhead({ name: '' }), null)
  assert.equal(lh.parseLetterhead({ name: 'X', logoUrl: 'javascript:alert(1)' }).logoUrl, null, 'only https logos')
  assert.deepEqual(lh.missingForLetterhead(lh.EMPTY_PROFILE), ['registered company name', 'address', 'phone or e-mail', 'GSTIN'])
})

test('bank details print only when account number and IFSC are both set; company fields fall back sensibly', () => {
  assert.match(m.fieldValue('org.bank_details', ctx), /\| Account number \| 50200012345678 \|\n\| IFSC \| HDFC0000123 \|/)
  const half = { ...ctx, org: { name: 'X', profile: { ...ctx.org.profile, bankIfsc: null } } }
  assert.equal(m.fieldValue('org.bank_details', half), null)
  assert.equal(m.fieldValue('org.legal_name', { ...ctx, org: { name: 'Skyline' } }), 'Skyline', 'no profile: the workspace name')
})

test('the bank account and PAN never reach the audit log; only owners and admins save business details', () => {
  const route = fs.readFileSync(path.join(root, 'app/api/settings/business-profile/route.ts'), 'utf8')
  assert.match(route, /authorizeOrgAccess\(parsed\.data\.orgId, \['owner', 'admin'\]\)/)
  assert.match(route, /\{ fields_filled: filled \}/)
  assert.doesNotMatch(route, /auditMember\([^)]*profile\)/)
})

console.log(`\nDocuments: ${passed} checks passed.`)
