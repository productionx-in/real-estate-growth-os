// tests/lead-fields.test.mjs — the workspace's own fields on leads and its locations list (lib/settings/fields.ts,
// lib/settings/workspace.ts, 20260075): definitions, value checks, and that every place that uses them is wired.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const f = await jiti.import(path.join(root, 'lib/settings/fields.ts'))
const w = await jiti.import(path.join(root, 'lib/settings/workspace.ts'))
const { CSV_FORMULA } = await jiti.import(path.join(root, 'lib/utils/csv.ts'))
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
let passed = 0
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`) }

console.log('FIELDS ON LEADS')

test('new fields get a stable key from their name; duplicates and blanks are refused', () => {
  const { value, errors } = f.normaliseFields([{ label: 'Purpose of purchase', type: 'choice', options: ['Own use', 'own use', 'Investment'] }, { label: 'Family size', type: 'number' }], [])
  assert.deepEqual(errors, {})
  assert.deepEqual(value.map((x) => [x.key, x.type, x.options]), [['purpose_of_purchase', 'choice', ['Own use', 'Investment']], ['family_size', 'number', []]])
  assert.ok(f.normaliseFields([{ label: 'A', type: 'text' }, { label: 'a', type: 'text' }], []).errors.label)
  assert.ok(f.normaliseFields([{ label: '', type: 'text' }], []).errors.label)
  assert.ok(f.normaliseFields([{ label: 'Loan', type: 'choice', options: [] }], []).errors.options)
  assert.equal(f.keyFromLabel('2nd home?'), 'f_2nd_home')
})

test('a saved field keeps its key and type; renaming keeps its values; a removed field is archived, never dropped', () => {
  const prev = [{ key: 'home_loan', label: 'Home loan', type: 'choice', options: ['Yes', 'No'], archived: false }, { key: 'nri', label: 'NRI', type: 'yesno', options: [], archived: false }]
  const renamed = f.normaliseFields([{ key: 'home_loan', label: 'Loan status', type: 'choice', options: ['Needed', 'Not needed'] }], prev)
  assert.deepEqual(renamed.errors, {})
  assert.deepEqual(renamed.value.map((x) => [x.key, x.label, x.archived]), [['home_loan', 'Loan status', false], ['nri', 'NRI', true]])
  assert.ok(f.normaliseFields([{ key: 'nri', label: 'NRI', type: 'text' }], prev).errors.type, 'the type is fixed once saved')
  const clash = f.normaliseFields([{ label: 'NRI buyer', type: 'yesno' }], [{ key: 'nri_buyer', label: 'Old', type: 'text', options: [], archived: true }])
  assert.equal(clash.value[0].key, 'nri_buyer_2', 'a new field never reuses a removed field’s key')
  const many = Array.from({ length: 26 }, (_, i) => ({ label: `F${i}`, type: 'text' }))
  assert.ok(f.normaliseFields(many, []).errors.fields)
})

test('values are checked against each field’s type; removed or unknown fields cannot be written', () => {
  const defs = [
    { key: 'loan', label: 'Home loan', type: 'choice', options: ['Needed', 'Not needed'], archived: false },
    { key: 'size', label: 'Family size', type: 'number', options: [], archived: false },
    { key: 'nri', label: 'NRI', type: 'yesno', options: [], archived: false },
    { key: 'by', label: 'Book by', type: 'date', options: [], archived: false },
    { key: 'job', label: 'Occupation', type: 'text', options: [], archived: false },
    { key: 'old', label: 'Old', type: 'text', options: [], archived: true },
  ]
  const ok = f.checkValues(defs, { loan: 'needed', size: '4', nri: false, by: '2027-03-12', job: '  Software   engineer ', old: undefined })
  assert.deepEqual(ok.patch, { loan: 'Needed', size: 4, nri: false, by: '2027-03-12', job: 'Software engineer' })
  assert.ok(ok.errors.old, 'a removed field is not writable')
  const bad = f.checkValues(defs, { loan: 'Maybe', size: 'four', nri: 'yes', by: '2027-02-30', ghost: 'x' })
  assert.deepEqual(Object.keys(bad.errors).sort(), ['by', 'ghost', 'loan', 'nri', 'size'])
  assert.deepEqual(f.checkValues(defs, { loan: '' }).patch, { loan: null }, 'empty clears the value')
  assert.equal(f.displayValue(defs[2], true), 'Yes'); assert.equal(f.displayValue(defs[3], '2027-03-12'), '12 Mar 2027')
})

test('locations: trimmed, de-duplicated, capped; stored settings without new sections get defaults', () => {
  const { value } = w.normaliseSection('lists', { locations: [' Whitefield ', 'whitefield', 'X', 'Sarjapur  Road'] })
  assert.deepEqual(value.locations, ['Whitefield', 'Sarjapur Road'])
  assert.ok(w.normaliseSection('lists', { locations: Array.from({ length: 201 }, (_, i) => `Area ${i}`) }).errors.locations)
  const s = w.settingsFromRow({ leads: {}, fields: { lead: [{ key: 'ok_field', label: 'OK', type: 'text' }, { key: 'Bad Key', label: 'x', type: 'text' }] } })
  assert.deepEqual(s.lists, { locations: [] })
  assert.deepEqual(s.fields.lead.map((x) => x.key), ['ok_field'], 'malformed stored definitions are dropped')
})

test('CSV exports never run formulas, and phone numbers and amounts are left alone', () => {
  for (const v of ['=HYPERLINK("x")', '@SUM(A1)', '+cmd|x', '-2+3', '\tx']) assert.ok(CSV_FORMULA.test(v), v)
  for (const v of ['+91 98450 12345', '-500', '9845012345', 'Asha', '(080) 2345-6789']) assert.ok(!CSV_FORMULA.test(v), v)
  const route = read('app/api/leads/export/route.ts')
  assert.match(route, /Papa\.unparse\(rows, \{ escapeFormulae: CSV_FORMULA \}\)/)
  assert.match(route, /displayValue\(f, lead\.field_values\?\.\[f\.key\]\)/)
  assert.match(route, /'Closed Reason': lead\.closed_reason/)
})

test('wiring: values saved by whoever may work the lead, checked on the server; settings by owners and admins', () => {
  const api = read('app/api/leads/[leadId]/fields/route.ts')
  assert.match(api, /authorizeLeadWork\(leadId\)/)
  assert.match(api, /checkValues\(defs, parsed\.data\.values\)/)
  assert.match(read('lib/dal/lead-fields.ts'), /\.eq\('org_id', orgId\)\.eq\('id', leadId\)/)
  assert.match(read('app/api/settings/workspace/route.ts'), /section: z\.enum\(\[[^\]]*'lists', 'fields'/)
  assert.match(read('app/api/settings/workspace/route.ts'), /normaliseSection\(section, parsed\.data\.value, current\)/)
  for (const p of ['fields', 'locations']) assert.match(read(`app/(dashboard)/[orgSlug]/settings/${p}/page.tsx`), /if \(!isAdmin\) redirect/)
  const lead = read('app/(dashboard)/[orgSlug]/leads/[leadId]/page.tsx')
  assert.match(lead, /<LeadCustomFields[\s\S]*canEdit=\{canWork\}/)
  assert.match(lead, /locations=\{workspaceSettings\.lists\.locations\}/)
})

test('migration: values on the table behind the live-leads view, size-capped; new activity kind outside the transaction', () => {
  const m = read('supabase/migrations/20260075_lists_and_fields.sql')
  assert.match(m, /ALTER TABLE public\.leads_all\s+ADD COLUMN IF NOT EXISTS field_values JSONB NOT NULL DEFAULT '\{\}'::jsonb\s+CHECK \(jsonb_typeof\(field_values\) = 'object' AND pg_column_size\(field_values\) < 16384\)/)
  assert.match(m, /CREATE OR REPLACE VIEW public\.leads WITH \(security_invoker = true\) AS\s+SELECT \* FROM public\.leads_all WHERE deleted_at IS NULL/)
  assert.ok(m.indexOf("ADD VALUE IF NOT EXISTS 'details_updated'") < m.indexOf('BEGIN;'))
  // ADD COLUMN IF NOT EXISTS silently skips the CHECK when the column already exists, so the name must be new
  // (leads.custom_fields already holds raw import and integration data).
  const earlier = fs.readdirSync(path.join(root, 'supabase/migrations')).filter((f) => f < '20260075')
  for (const f of earlier) assert.doesNotMatch(read(`supabase/migrations/${f}`), /\bfield_values\b/, f)
})

console.log(`\nFields on leads: ${passed} checks passed.`)
