// tests/lead-foundation.test.mjs — lead tags, stage timing and merge guards (lib/leads/tags.ts,
// lib/integrations/inbound.ts, lib/dal/reports.ts, the tags and merge routes).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const tags = await jiti.import(path.join(root, 'lib/leads/tags.ts'))
const vf = await jiti.import(path.join(root, 'lib/leads/view-filters.ts'))
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8')

let passed = 0
async function test(name, fn) { await fn(); passed++; console.log(`  ✓ ${name}`) }

console.log('LEAD FOUNDATION')

await test('tags: lowercase, trimmed, letters/digits/spaces/hyphens, up to 30 characters and 10 per lead', () => {
  assert.equal(tags.normalizeTag('  Hot Buyer!! '), 'hot buyer')
  assert.equal(tags.normalizeTag('NRI'), 'nri')
  assert.equal(tags.normalizeTag('-x'), null, 'must start with a letter or digit')
  assert.equal(tags.normalizeTag('a'.repeat(40)).length, 30)
  assert.equal(tags.normalizeTag('<script>'), 'script')
  for (const bad of ['', '   ', '!!!', null, 42, {}]) assert.equal(tags.normalizeTag(bad), null, String(bad))
  assert.deepEqual(tags.normalizeTags(['Hot', 'hot', ' nri ', '', 'x!']), ['hot', 'nri', 'x'])
  assert.equal(tags.normalizeTags(Array.from({ length: 15 }, (_, i) => `t${i}`)).length, 10)
  assert.deepEqual(tags.normalizeTags('hot'), [], 'not a list')
  for (const t of tags.normalizeTags(['Hot Buyer', 'NRI', 'Site-Visit 2'])) assert.match(t, tags.TAG_RE)
})

await test('tags: most used first; the tag filter survives the URL and narrows the query', () => {
  assert.deepEqual(tags.rankTags([{ tags: ['nri', 'hot'] }, { tags: ['hot'] }, { tags: null }, { tags: ['b', 'a'] }]), ['hot', 'a', 'b', 'nri'])
  const { filters } = vf.parseLeadSearch({ tag: 'Hot Buyer', q: 'priya' })
  assert.deepEqual(filters, { tag: 'hot buyer', q: 'priya' })
  assert.equal(vf.toLeadSearch(filters), '?tag=hot+buyer&q=priya')
  const calls = []
  const q = new Proxy({}, { get: (_, op) => (...args) => { calls.push([op, ...args]); return q } })
  vf.applyLeadFilters(q, { tag: 'nri' }, { role: 'manager', profileId: 'p' }, new Date())
  assert.deepEqual(calls, [['contains', 'tags', ['nri']]])
  assert.deepEqual(vf.normalizeFilters({ tag: '!!!' }), {}, 'an unusable tag is dropped')
})

await test('timing: the source’s own submission time is used only when believable', async () => {
  const { plausibleSubmittedAt } = await jiti.import(path.join(root, 'lib/integrations/inbound.ts'))
  const now = new Date('2026-11-18T10:00:00Z')
  assert.equal(plausibleSubmittedAt('2026-11-18T09:59:40+0000', now), '2026-11-18T09:59:40.000Z')
  assert.equal(plausibleSubmittedAt(String(Math.floor(now.getTime() / 1000) - 20), now), '2026-11-18T09:59:40.000Z', 'unix seconds')
  assert.equal(plausibleSubmittedAt('2026-11-18T10:05:00Z', now), null, 'in the future')
  assert.equal(plausibleSubmittedAt('2026-09-01T00:00:00Z', now), null, 'a backfill, months old')
  for (const bad of [null, undefined, '', 'yesterday']) assert.equal(plausibleSubmittedAt(bad, now), null)
})

await test('timing: durations read naturally', async () => {
  const { duration, PIPELINE_STAGES } = await jiti.import(path.join(root, 'lib/dal/reports.ts'))
  assert.deepEqual([4, 65, 125.4, 3600, 3720, 200000, null].map(duration), ['4 s', '1 min 5 s', '2 min 5 s', '1 h', '1 h 2 min', '2 days', '—'])
  assert.deepEqual(PIPELINE_STAGES.map((s) => s.key), ['submit_to_receipt', 'receipt_to_saved', 'saved_to_assigned', 'assigned_to_first_action'])
})

await test('guards: merge is for managers, tags for whoever works the lead; duplicate lookup never splices filter text', () => {
  const merge = read('app/api/leads/[leadId]/merge/route.ts')
  assert.match(merge, /authorizeLeadAccess\(leadId, \[\.\.\.MANAGEMENT_ROLES\]\)/)
  assert.match(merge, /\.eq\('org_id', context\.orgId\)/, 'the duplicate must be in the same organisation')
  assert.match(read('app/api/leads/[leadId]/tags/route.ts'), /authorizeLeadWork\(leadId\)/)
  const inbound = read('lib/integrations/inbound.ts')
  assert.doesNotMatch(inbound, /\.or\(`[^`]*\$\{norm(Phone|Email)\}/, 'phone/email are never placed inside an or() filter string')
  assert.match(inbound, /\.is\('merged_into_id', null\)/, 'merged records are not duplicate candidates')
  assert.match(read('lib/dal/search.ts'), /\.is\('merged_into_id', null\)/)
  assert.match(read('app/(dashboard)/[orgSlug]/leads/page.tsx'), /\.is\('merged_into_id', null\)/)
})

console.log(`\nLead foundation: ${passed} checks passed.`)
