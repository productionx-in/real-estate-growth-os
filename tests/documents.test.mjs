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

console.log(`\nDocuments: ${passed} checks passed.`)
