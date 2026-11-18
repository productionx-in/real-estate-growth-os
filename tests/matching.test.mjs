// tests/matching.test.mjs — property matching rules (lib/matching/score.ts).
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const s = await jiti.import(path.join(root, 'lib/matching/score.ts'))

let passed = 0
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`) }

const P1 = 'p1111111-1111-4111-8111-111111111111'
const req = (over = {}) => ({
  budget_min: 9_000_000, budget_max: 12_000_000, project_id: null,
  req_configurations: ['3BHK'], req_categories: [], req_locations: ['Whitefield'], req_facing: ['East'],
  req_min_area: 1100, req_max_area: 1500, ...over,
})
const unit = (over = {}) => ({
  id: 'u1', project_id: P1, status: 'available', category: 'apartments', bhk_config: '3 BHK', facing: 'East',
  total_price: 11_500_000, carpet_area: 1180, super_built_up_area: 1620, area_value: 1620,
  project: { name: 'Skyline Towers', city: 'Bengaluru', location: 'Whitefield, ITPL Road' }, ...over,
})

console.log('PROPERTY MATCHING')

test('a unit that fits everything scores high and says why', () => {
  const m = s.scoreUnit(req({ project_id: P1 }), unit())
  assert.equal(m.score, 100) // configuration 25 + budget 35 + location 20 + area 10 + facing 5 + project 5
  assert.deepEqual(m.reasons, ['3BHK', 'Within budget', 'Whitefield', '1,180 sq ft', 'East facing', 'Project they asked about'])
  assert.deepEqual(m.gaps, [])
})

test('never suggested: not available, wrong configuration, wrong property type, more than 10% over budget', () => {
  assert.equal(s.scoreUnit(req(), unit({ status: 'blocked' })), null)
  assert.equal(s.scoreUnit(req(), unit({ bhk_config: '2BHK' })), null)
  assert.equal(s.scoreUnit(req(), unit({ bhk_config: null })), null, 'unknown configuration when the buyer asked for one')
  assert.equal(s.scoreUnit(req({ req_categories: ['plotted_developments'] }), unit()), null)
  assert.equal(s.scoreUnit(req(), unit({ total_price: 13_200_001 })), null, 'just over 10% above 1.2 Cr')
})

test('a little over budget is still suggested, with the gap in lakhs', () => {
  const m = s.scoreUnit(req(), unit({ total_price: 12_800_000 }))
  assert.ok(m && m.score < 100)
  assert.deepEqual(m.gaps, ['₹8 L over budget'])
})

test('gaps are explained: different area, smaller than wanted, no price yet', () => {
  const m = s.scoreUnit(req(), unit({ project: { name: 'Lakeview', city: 'Mysuru', location: null }, carpet_area: 900, total_price: null }))
  assert.deepEqual(m.gaps, ['No price yet', 'Different area', 'Smaller than wanted'])
})

test('configurations are compared loosely ("3 bhk" = "3BHK"); 5 BHK and above is "5BHK+"', () => {
  assert.equal(s.normConfig('3 bhk'), '3BHK')
  assert.equal(s.normConfig('2.5 BHK'), '2.5BHK')
  assert.equal(s.normConfig('6BHK'), '5BHK+')
  assert.ok(s.scoreUnit(req({ req_configurations: ['5BHK+'] }), unit({ bhk_config: '5 BHK' })))
})

test('locations match on locality, city or project name, ignoring case and punctuation', () => {
  for (const place of ['whitefield', 'BENGALURU', 'skyline towers', 'ITPL road']) {
    assert.ok(s.scoreUnit(req({ req_locations: [place] }), unit()).reasons.length > 0, place)
  }
})

test('a buyer who told us nothing gets no suggestions (no guessing)', () => {
  const empty = req({ budget_min: null, budget_max: null, req_configurations: [], req_locations: [], req_facing: [], req_min_area: null, req_max_area: null })
  assert.equal(s.hasRequirements(empty), false)
  assert.equal(s.hasRequirements({ ...empty, project_id: P1 }), false, 'the project alone says nothing about which unit fits')
  assert.equal(s.hasRequirements({ ...empty, project_id: P1, req_locations: ['Whitefield'] }), true)
})

test('best first; equal scores show the cheaper unit first; prices read as lakh / crore', () => {
  const items = [
    { id: 'a', price: 12_000_000, match: { score: 80 } }, { id: 'b', price: 9_000_000, match: { score: 80 } },
    { id: 'c', price: null, match: { score: 95 } }, { id: 'd', price: 1, match: { score: 10 } },
  ]
  assert.deepEqual(s.rank(items, 3).map((i) => i.id), ['c', 'b', 'a'])
  assert.deepEqual([s.shortInr(14_499_000), s.shortInr(840_000), s.shortInr(99_999)], ['₹1.45 Cr', '₹8.4 L', '₹99,999'])
})

console.log(`\nMatching: ${passed} checks passed.`)
