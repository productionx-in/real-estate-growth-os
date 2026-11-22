// tests/lead-next-action.test.mjs — the lead page's next best action (lib/leads/next-action.ts), stage stepper and
// "More" menu: suggestions come only from recorded facts, urgent work comes first, closed leads get none.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const N = await jiti.import(path.join(root, 'lib/leads/next-action.ts'))
let passed = 0
const test = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`) }
const now = new Date('2026-11-23T06:00:00Z')
const base = { status: 'contacted', merged: false, firstActionAt: '2026-11-20T06:00:00Z', slaDueAt: null, openTasks: [{ due_at: '2026-11-24T06:00:00Z', kind: 'call' }], matches: 0, documentsShared: 0, lastActivityAt: '2026-11-22T06:00:00Z' }
const act = (o) => N.nextAction({ ...base, ...o }, now)

console.log('LEAD NEXT ACTION')

test('nobody has acted yet: call now — urgent once the response deadline has passed', () => {
  const a = act({ status: 'new', firstActionAt: null, slaDueAt: '2026-11-23T05:00:00Z' })
  assert.equal(a.title, 'Call now'); assert.equal(a.tone, 'danger'); assert.match(a.detail, /was due 1 h ago/); assert.equal(a.target, 'work')
  assert.equal(act({ status: 'new', firstActionAt: null, slaDueAt: '2026-11-23T08:00:00Z' }).tone, 'warning')
})

test('an overdue follow-up beats the stage suggestion', () => {
  const a = act({ status: 'qualified', matches: 3, openTasks: [{ due_at: '2026-11-21T06:00:00Z', kind: 'call' }] })
  assert.equal(a.title, 'Call back — overdue'); assert.match(a.detail, /2 days ago/)
})

test('each stage suggests its next step', () => {
  assert.equal(act({ status: 'contacted' }).title, 'Qualify the buyer')
  assert.equal(act({ status: 'qualified', matches: 3 }).title, 'Share 3 matching units')
  assert.equal(act({ status: 'qualified', matches: 1 }).title, 'Share 1 matching unit')
  assert.equal(act({ status: 'qualified' }).title, 'Schedule a site visit')
  assert.equal(act({ status: 'site_visit_scheduled' }).title, 'Confirm the site visit')
  assert.equal(act({ status: 'site_visited' }).title, 'Send a cost sheet')
  assert.equal(act({ status: 'site_visited', documentsShared: 1 }).title, 'Follow up on the offer')
  assert.equal(act({ status: 'negotiation' }).title, 'Close the booking')
})

test('a missing follow-up or a quiet week is pointed out; closed and merged leads get nothing', () => {
  assert.match(act({ openTasks: [] }).secondary, /No follow-up is scheduled/)
  assert.match(act({ lastActivityAt: '2026-11-13T06:00:00Z' }).secondary, /Nothing recorded for 10 days/)
  assert.equal(act({}).secondary, null)
  for (const status of ['booked', 'lost', 'junk']) assert.equal(act({ status }), null, status)
  assert.equal(act({ merged: true }), null)
})

test('the lead page: stepper, next action for people who work the lead, secondary actions under More', () => {
  const page = read('app/(dashboard)/[orgSlug]/leads/[leadId]/page.tsx')
  assert.match(page, /<LeadStageStepper status=/)
  assert.match(page, /\{canWork && suggestion && <NextBestAction action=\{suggestion\} \/>\}/)
  const more = page.slice(page.indexOf('<MoreActions>'), page.indexOf('</MoreActions>'))
  for (const c of ['RegisterBuyerDialog', 'MergeLeadDialog', 'ArchiveLeadButton', 'Mark lost or junk']) assert.ok(more.includes(c), c)
  for (const id of ['lead-work', 'lead-stage', 'lead-matches', 'lead-documents', 'lead-actions']) assert.ok(page.includes(`id="${id}"`), id)
  assert.match(read('components/leads/MoreActions.tsx'), /!open && 'hidden'/, 'the panel stays mounted so dialogs keep working')
})

console.log(`\nLead next action: ${passed} checks passed.`)
