// tests/lead-segments.test.mjs — lead segments (lib/segments/segments.ts, lib/dal/segments.ts, app/api/segments).
// Templates must only use filters the leads page understands; a segment never stores a person filter; only owners,
// admins and managers manage segments; every route authorises the organisation and audits what it changed.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const seg = await jiti.import(path.join(root, 'lib/segments/segments.ts'))
const vf = await jiti.import(path.join(root, 'lib/leads/view-filters.ts'))
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')

let passed = 0
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`) }
console.log('LEAD SEGMENTS')

test('every template is valid, unique, and survives filter normalisation unchanged', () => {
  const keys = new Set()
  for (const t of seg.SEGMENT_TEMPLATES) {
    assert.match(t.key, /^[a-z_]{1,40}$/, t.key)
    assert.ok(!keys.has(t.key), `duplicate ${t.key}`); keys.add(t.key)
    assert.ok(t.name.length <= 60 && t.description.length <= 200, t.key)
    assert.deepEqual(seg.segmentFilters(t.filters), vf.normalizeFilters(t.filters), `${t.key} uses only known filters`)
    assert.ok(seg.describeFilters(t.filters).length > 0, t.key)
  }
  assert.equal(seg.templateByKey('nope'), undefined)
  assert.equal(seg.templateByKey('hot_open').name, 'Hot and open')
})

test('a segment never stores a person filter, and needs at least one real filter', () => {
  assert.equal(seg.segmentFilters({ assignee: 'me' }), null)
  assert.deepEqual(seg.segmentFilters({ assignee: 'none', status: 'new' }), { status: ['new'] })
  assert.equal(seg.segmentFilters({ bogus: 1 }), null)
  assert.equal(seg.segmentFilters(null), null)
})

test('only owners, admins and managers manage segments', () => {
  for (const r of ['owner', 'admin', 'manager']) assert.equal(seg.canManageSegments(r), true, r)
  for (const r of ['team_lead', 'sales_exec', 'post_sales', 'readonly', null, undefined]) assert.equal(seg.canManageSegments(r), false, String(r))
})

test('names and descriptions are trimmed and bounded; criteria read in plain language', () => {
  assert.equal(seg.cleanName('  Hot   buyers '), 'Hot buyers')
  assert.equal(seg.cleanName(' '), null)
  assert.equal(seg.cleanName('x'.repeat(61)), null)
  assert.equal(seg.cleanDescription('a'.repeat(300)).length, 200)
  assert.deepEqual(seg.describeFilters({ status: ['new', 'contacted', 'qualified'], source: ['website'], project: '11111111-1111-4111-8111-111111111111' }, { '11111111-1111-4111-8111-111111111111': 'Seaview' }),
    ['Stage: New, Contacted or Qualified', 'Source: Website', 'Project: Seaview'])
})

test('every segment route authorises the organisation, checks ids and audits the change', () => {
  for (const f of ['app/api/segments/route.ts', 'app/api/segments/[segmentId]/route.ts', 'app/api/segments/[segmentId]/leads/route.ts']) {
    const src = read(f)
    assert.match(src, /authorizeOrgAccess\(/, f)
    assert.match(src, /auditMember\(/, f)
    assert.match(src, /z\.string\(\)\.uuid\(\)/, f)
    assert.doesNotMatch(src, /createServiceClient/, `${f} goes through the DAL`)
  }
})

test('the data layer scopes every query by organisation and applies the reader’s lead scope', () => {
  const dal = read('lib/dal/segments.ts')
  // Each query up to the end of its statement (an insert sets org_id on the next line).
  const froms = dal.match(/\.from\('(?:lead_segments|lead_segment_members|leads)'\)[\s\S]*?(?:\n\s*\n|\n\s*(?:const|let|if|return|\])\b)/g) ?? []
  assert.ok(froms.length >= 10)
  for (const q of froms) assert.match(q, /org_id|segment_id/, q)
  assert.match(dal, /applyLeadFilters\(q, fixed \? \{\} : segment\.filters, viewer/)
  assert.equal((dal.match(/canManageSegments\(actor\.role\)/g) ?? []).length, 5, 'create, update, delete, add, remove')
})

test('the migration turns RLS on and gives clients no write or member access', () => {
  const sql = read('supabase/migrations/20260087_lead_segments.sql')
  assert.match(sql, /ALTER TABLE public\.lead_segments ENABLE ROW LEVEL SECURITY/)
  assert.match(sql, /ALTER TABLE public\.lead_segment_members ENABLE ROW LEVEL SECURITY/)
  assert.match(sql, /REVOKE ALL ON public\.lead_segments, public\.lead_segment_members FROM PUBLIC, anon, authenticated/)
  assert.match(sql, /GRANT SELECT ON public\.lead_segments TO authenticated;/)
  assert.doesNotMatch(sql, /GRANT [^;]*lead_segment_members[^;]*TO authenticated/)
  assert.match(sql, /REFERENCES public\.leads_all\(id\) ON DELETE CASCADE/)
})

console.log(`\nLead segments: ${passed} checks passed.`)
