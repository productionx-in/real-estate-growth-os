// tests/plot-map-versions-ux.test.mjs — how the project map page lays out versions (lib/plots/version-groups.ts):
// live and in-progress up front, everything else folded; and the next step on a version says whose turn it is.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const G = await jiti.import(path.join(root, 'lib/plots/version-groups.ts'))
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')

let passed = 0
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`) }
console.log('PLOT MAP VERSIONS PAGE')

const v = (id, layoutId, versionNo, status, renderStatus = 'ready') => ({ id, layoutId, versionNo, status, renderStatus })

test('live = published; in progress = newest version still in review; the rest fold away newest first', () => {
  const g = G.groupVersions(['A'], [v('1', 'A', 1, 'superseded'), v('2', 'A', 2, 'published'), v('3', 'A', 3, 'draft'), v('4', 'A', 4, 'in_review')])
  assert.equal(g.length, 1)
  assert.equal(g[0].live.id, '2'); assert.equal(g[0].inProgress.id, '4')
  assert.deepEqual(g[0].earlier.map((x) => x.id), ['3', '1'])
})

test('a version still rendering (or failed) counts as in progress; nothing published leaves live empty', () => {
  const g = G.groupVersions(['A'], [v('1', 'A', 1, 'draft', 'failed')])
  assert.equal(g[0].live, null); assert.equal(g[0].inProgress.id, '1'); assert.deepEqual(g[0].earlier, [])
})

test('a draft older than the live version is not shown as in progress', () => {
  const g = G.groupVersions(['A'], [v('1', 'A', 1, 'draft'), v('2', 'A', 2, 'published')])
  assert.equal(g[0].inProgress, null); assert.deepEqual(g[0].earlier.map((x) => x.id), ['1'])
})

test('maps keep their listed order; maps with no versions are left out', () => {
  const g = G.groupVersions(['B', 'A', 'C'], [v('1', 'A', 1, 'draft'), v('2', 'B', 1, 'published')])
  assert.deepEqual(g.map((x) => x.layoutId), ['B', 'A'])
})

test('next step says whose turn it is: drawing, QA, the approver, or you', () => {
  assert.equal(G.nextStep({ status: 'draft', renderStatus: 'ready' }, true, false).waitingOn, 'drawing')
  assert.equal(G.nextStep({ status: 'rejected', renderStatus: 'ready' }, true, false).waitingOn, 'drawing')
  assert.equal(G.nextStep({ status: 'in_review', renderStatus: 'ready' }, true, false).waitingOn, 'qa')
  assert.equal(G.nextStep({ status: 'in_review', renderStatus: 'ready' }, true, true).waitingOn, 'you', 'owner/admin approves')
  assert.equal(G.nextStep({ status: 'in_review', renderStatus: 'ready' }, false, true).waitingOn, 'approver', 'a manager waits')
  assert.equal(G.nextStep({ status: 'approved', renderStatus: 'ready' }, true, true).waitingOn, 'you')
  assert.equal(G.nextStep({ status: 'approved', renderStatus: 'ready' }, false, true).waitingOn, 'approver')
  assert.equal(G.nextStep({ status: 'draft', renderStatus: 'failed' }, false, false).waitingOn, 'you')
  assert.equal(G.nextStep({ status: 'published', renderStatus: 'ready' }, true, true), null)
})

test('QA counts only after the latest submission (history newest first)', () => {
  assert.ok(G.qaPassedSinceSubmit([{ action: 'qa_passed' }, { action: 'submitted' }]))
  assert.ok(!G.qaPassedSinceSubmit([{ action: 'submitted' }, { action: 'qa_passed' }, { action: 'submitted' }]))
  assert.ok(!G.qaPassedSinceSubmit([]))
})

test('wiring: the page uses the grouping, folds earlier versions and the upload, and the review buttons share the QA rule', () => {
  const docs = read('components/plots/MapDocuments.tsx')
  assert.match(docs, /groupVersions\(/)
  assert.match(docs, /Earlier versions \(\{g\.earlier\.length\}\)/)
  assert.match(docs, /<details className="group rounded-lg border border-default" open=\{versions\.length === 0\}>/, 'upload folds once there are versions')
  assert.match(read('components/plots/VersionReview.tsx'), /qaPassedSinceSubmit\(history\)/)
})

console.log(`\nPlot map versions page: ${passed} checks passed.`)
