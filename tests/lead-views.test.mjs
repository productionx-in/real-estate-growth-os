// tests/lead-views.test.mjs
// Lead filters, saved-view permissions and the pipeline rules (lib/leads/view-filters.ts, transitions.ts).
// The filters arrive from URLs and stored JSON written by other members, so they must never widen what a
// reader sees, and the search text must never be able to inject PostgREST filter syntax.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const vf = await jiti.import(path.join(root, 'lib/leads/view-filters.ts'))
const tr = await jiti.import(path.join(root, 'lib/leads/transitions.ts'))

let passed = 0
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`) }

/** Records the calls a Supabase query builder would receive. */
function recorder() {
  const calls = []
  const q = new Proxy({}, { get: (_, op) => (...args) => { calls.push([op, ...args]); return q } })
  return { q, calls }
}
const ME = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const NOW = new Date('2026-11-17T10:00:00Z')

console.log('LEAD VIEWS')

test('filters keep only known values, in a canonical order; junk is dropped, not rejected', () => {
  assert.deepEqual(vf.normalizeFilters({
    status: 'qualified,new,bogus', source: ['website', 'nope'], priority: 'urgent', project: 'not-a-uuid',
    assignee: 'everyone', focus: 'overdue', created: '1y', q: ' a ', extra: 1,
  }), { status: ['new', 'qualified'], source: ['website'], focus: 'overdue' })
  assert.deepEqual(vf.normalizeFilters(null), {})
  assert.deepEqual(vf.normalizeFilters('status=new'), {})
})

test('URL round trip: equal filters give equal URLs; old ?scope links still work', () => {
  const f = { status: ['qualified', 'new'], assignee: 'me', q: 'Priya' }
  const qs = vf.toLeadSearch(f, { layout: 'board', viewId: OTHER })
  const back = vf.parseLeadSearch(Object.fromEntries(new URLSearchParams(qs.slice(1))))
  assert.deepEqual(back, { filters: vf.normalizeFilters(f), layout: 'board', viewId: OTHER })
  assert.equal(vf.toLeadSearch({ status: ['new', 'qualified'] }), vf.toLeadSearch({ status: ['qualified', 'new'] }))
  assert.equal(vf.parseLeadSearch({ scope: 'my' }).filters.assignee, 'me')
  assert.equal(vf.parseLeadSearch({ scope: 'unassigned' }).filters.assignee, 'none')
  assert.equal(vf.parseLeadSearch({ view: 'x' }).viewId, null)
  assert.equal(vf.toLeadSearch({}), '')
})

test('search text cannot carry PostgREST syntax (commas, brackets, quotes, wildcards, backslashes)', () => {
  assert.equal(vf.cleanSearch('a,b),or(id.eq.1'), 'aborid.eq.1')
  for (const evil of ['x",phone.neq."', 'x*', 'x%', 'x\\', "x'", 'x()']) {
    assert.doesNotMatch(vf.cleanSearch(evil) ?? '', /[,()"'*%\\]/)
  }
  assert.equal(vf.cleanSearch('+91 98450 12345'), '+91 98450 12345')
  assert.equal(vf.cleanSearch('priya.s@example.com'), 'priya.s@example.com')
  assert.equal(vf.cleanSearch('प्रिया'), 'प्रिया')
  assert.equal(vf.cleanSearch('a'), undefined)
  assert.equal(vf.cleanSearch('x'.repeat(200)).length, 80)
})

test('a sales executive only ever gets their own leads, whatever the filter or shared view asks', () => {
  for (const assignee of [undefined, 'none', OTHER, 'me']) {
    const { q, calls } = recorder()
    vf.applyLeadFilters(q, { assignee }, { role: 'sales_exec', profileId: ME }, NOW)
    assert.deepEqual(calls.filter((c) => c[1] === 'assigned_to'), [['eq', 'assigned_to', ME]], `assignee=${assignee}`)
  }
})

test('a team lead sees their team; a filter can narrow within the team but never reach outside it', () => {
  const MATE = '33333333-3333-4333-8333-333333333333'
  const tl = { role: 'team_lead', profileId: ME, teamProfileIds: [ME, MATE] }
  const run = (assignee) => { const { q, calls } = recorder(); vf.applyLeadFilters(q, { assignee }, tl, NOW); return calls.filter((c) => c[1] === 'assigned_to') }
  assert.deepEqual(run(undefined), [['in', 'assigned_to', [ME, MATE]]])
  assert.deepEqual(run('none'), [['in', 'assigned_to', [ME, MATE]]], 'unassigned is not their team')
  assert.deepEqual(run(OTHER), [['in', 'assigned_to', [ME, MATE]]], 'someone outside the team is ignored')
  assert.deepEqual(run(MATE), [['eq', 'assigned_to', MATE]])
  assert.deepEqual(run('me'), [['eq', 'assigned_to', ME]])
  const { q, calls } = recorder(); vf.applyLeadFilters(q, {}, { role: 'team_lead', profileId: ME }, NOW)
  assert.deepEqual(calls, [['in', 'assigned_to', [ME]]], 'team not resolved → only their own')
})

test('post-sales only ever gets booked customers, whatever status filter is asked for', () => {
  const { q, calls } = recorder()
  vf.applyLeadFilters(q, { status: ['new', 'negotiation'] }, { role: 'post_sales', profileId: ME }, NOW)
  assert.deepEqual(calls.slice(0, 1), [['eq', 'status', 'booked']])
})

test('managers can filter by me, unassigned or a person; other filters map to the right columns', () => {
  const run = (f) => { const { q, calls } = recorder(); vf.applyLeadFilters(q, f, { role: 'manager', profileId: ME }, NOW); return calls }
  assert.deepEqual(run({}), [])
  assert.deepEqual(run({ assignee: 'me' }), [['eq', 'assigned_to', ME]])
  assert.deepEqual(run({ assignee: 'none' }), [['is', 'assigned_to', null]])
  assert.deepEqual(run({ assignee: OTHER }), [['eq', 'assigned_to', OTHER]])
  assert.deepEqual(run({ status: ['new'], source: ['website'], priority: ['high'], project: OTHER }), [
    ['in', 'status', ['new']], ['in', 'source', ['website']], ['in', 'priority', ['high']], ['eq', 'project_id', OTHER],
  ])
  assert.deepEqual(run({ created: '7d' }), [['gte', 'created_at', '2026-11-10T10:00:00.000Z']])
  assert.deepEqual(run({ q: 'Priya' }), [['or', 'name.ilike."%Priya%",phone.ilike."%Priya%",email.ilike."%Priya%"']])
})

test('saved views: owners edit their own; managers edit shared ones; nobody edits another person\'s private view', () => {
  const mine = { owner_id: ME, shared: false }
  const theirsShared = { owner_id: OTHER, shared: true }
  const theirsPrivate = { owner_id: OTHER, shared: false }
  const exec = { role: 'sales_exec', profileId: ME }
  const manager = { role: 'manager', profileId: ME }
  assert.equal(vf.canEditView(mine, exec), true)
  assert.equal(vf.canEditView(theirsShared, exec), false)
  assert.equal(vf.canEditView(theirsShared, manager), true)
  assert.equal(vf.canEditView(theirsPrivate, manager), false)
  assert.equal(vf.canSeeView(theirsPrivate, manager), false)
  assert.equal(vf.canSeeView(theirsShared, exec), true)
  assert.deepEqual(['owner', 'admin', 'manager', 'sales_exec', 'readonly'].map(vf.canShareViews), [true, true, true, false, false])
})

test('pipeline: one rule set — the status API, the stage panel and the board all use it', () => {
  assert.equal(tr.canTransition('new', 'contacted'), true)
  assert.equal(tr.canTransition('new', 'booked'), false)
  assert.equal(tr.canTransition('booked', 'lost'), false)
  assert.deepEqual(tr.nextStatuses('lost'), [])
  assert.equal(tr.STATUS_ORDER.length, Object.keys(tr.STATUS_LABELS).length)
  for (const f of ['app/api/leads/[leadId]/status/route.ts', 'components/leads/StatusTransitionPanel.tsx', 'components/leads/LeadsBoard.tsx']) {
    const src = fs.readFileSync(path.join(root, f), 'utf8')
    assert.match(src, /@\/lib\/leads\/transitions/, `${f} uses the shared rules`)
    assert.doesNotMatch(src, /new:\s*\['contacted'/, `${f} has no private copy of the rules`)
  }
})

test('the CSV export applies the same filters (and the same visibility limit) as the page', () => {
  const src = fs.readFileSync(path.join(root, 'app/api/leads/export/route.ts'), 'utf8')
  assert.match(src, /parseLeadSearch/)
  // The caller's own viewer (their role, their profile, a team lead's team), resolved on the server.
  assert.match(src, /applyLeadFilters\(query, filters, await resolveLeadViewer\(org\.id, role, auth\.profile\.id\)/)
})

console.log(`\nLead views: ${passed} checks passed.`)
