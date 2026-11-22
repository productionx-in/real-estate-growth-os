// tests/plot-map-setup.test.mjs — Interactive Plot Map set-up tracking (20260084, lib/plots/setup.ts): stages complete
// only from recorded steps, estimates are business hours (Mon–Sat 10:00–19:00 IST) scaled by the work, the clock
// pauses only for an open blocker waiting on the customer, staff see metadata only; and embedding is limited to the
// workspace's own websites (lib/plots/embed.ts, proxy.ts).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const S = await jiti.import(path.join(root, 'lib/plots/setup.ts'))
const E = await jiti.import(path.join(root, 'lib/plots/embed.ts'))
let passed = 0
const test = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`) }
// IST wall-clock → Date (IST = UTC+5:30).
const ist = (s) => new Date(`${s}+05:30`)
const base = { activatedAt: null, firstUploadAt: null, firstRenderedAt: null, firstSubmittedAt: null, linkedAt: null, qaPassedAt: null,
  approvedAt: null, publishedAt: null, kind: 'pdf', pages: 1, plots: 0, units: 100, avgVertices: 4, unlinked: 0, blockers: [] }

console.log('PLOT MAP SET-UP')

test('business hours: Mon–Sat 10:00–19:00 IST; Sundays and nights are skipped', () => {
  // Sat 2026-11-21 18:00 + 2h → Mon 2026-11-23 11:00 (Sunday skipped)
  assert.equal(S.addBusinessHours(ist('2026-11-21T18:00:00'), 2).toISOString(), ist('2026-11-23T11:00:00').toISOString())
  // Before opening: starts at 10:00
  assert.equal(S.addBusinessHours(ist('2026-11-23T07:00:00'), 1).toISOString(), ist('2026-11-23T11:00:00').toISOString())
  // After closing: next working day
  assert.equal(S.addBusinessHours(ist('2026-11-23T20:00:00'), 9).toISOString(), ist('2026-11-24T19:00:00').toISOString())
  assert.equal(S.businessHoursBetween(ist('2026-11-21T18:00:00'), ist('2026-11-23T11:00:00')), 2)
  assert.equal(S.businessHoursBetween(ist('2026-11-23T11:00:00'), ist('2026-11-23T10:00:00')), 0)
  assert.equal(S.businessHoursBetween(ist('2026-11-22T00:00:00'), ist('2026-11-22T23:00:00')), 0, 'a Sunday has no business hours')
})

test('planned hours scale with the work: plots, pages, raster files and complex outlines', () => {
  const p = (f) => S.plannedHours({ ...base, ...f })
  assert.equal(p({ units: 100 }).mapped.hours, 10)
  assert.equal(p({ units: 100, pages: 3 }).mapped.hours, 12)
  assert.equal(p({ units: 100, kind: 'png' }).mapped.hours, 13)
  assert.equal(p({ units: 100, avgVertices: 12 }).mapped.hours, 12.5)
  assert.equal(p({ units: 100 }).qa.hours, 4)
  assert.equal(p({}).uploaded.assumed, true, 'customer steps are a stated assumption, not a service level')
})

test('stages complete only from recorded steps, in order; progress is completed ÷ 8', () => {
  const v = S.setupView({ ...base, activatedAt: '2026-11-20T05:00:00Z', firstUploadAt: '2026-11-20T06:00:00Z' }, ist('2026-11-20T12:00:00'))
  assert.deepEqual(v.stages.map((s) => s.state), ['done', 'done', 'current', 'pending', 'pending', 'pending', 'pending', 'pending'])
  assert.equal(v.completed, 2); assert.equal(v.progress, 0.25); assert.equal(v.current.key, 'processed')
  // A later recorded step implies the earlier ones (a version approved without a separate linked record, etc.).
  const w = S.setupView({ ...base, activatedAt: '2026-11-20T05:00:00Z', approvedAt: '2026-11-21T05:00:00Z' }, ist('2026-11-21T12:00:00'))
  assert.equal(w.completed, 7); assert.equal(w.current.key, 'published')
  const done = S.setupView({ ...base, publishedAt: '2026-11-21T05:00:00Z' }, ist('2026-11-21T12:00:00'))
  assert.equal(done.completed, 8); assert.equal(done.current, null); assert.equal(done.estimate, null)
})

test('REGrow stages get a due time and can be overdue; customer stages never get a countdown', () => {
  const facts = { ...base, activatedAt: '2026-11-16T04:30:00Z', firstUploadAt: '2026-11-16T04:30:00Z', firstRenderedAt: '2026-11-16T04:30:00Z' } // Mon 10:00 IST
  const early = S.setupView(facts, ist('2026-11-16T12:00:00'))
  assert.equal(early.current.key, 'mapped'); assert.ok(early.currentDue); assert.equal(early.overdue, false)
  const late = S.setupView(facts, ist('2026-11-18T12:00:00')) // 20 business hours later, 10 planned
  assert.equal(late.overdue, true)
  const customer = S.setupView({ ...facts, activatedAt: '2026-11-16T04:30:00Z', firstUploadAt: null, firstRenderedAt: null }, ist('2026-11-25T12:00:00'))
  assert.equal(customer.current.key, 'uploaded'); assert.equal(customer.currentDue, null); assert.equal(customer.overdue, false)
})

test('the clock pauses only while a blocker waits on the customer, and the pause is visible', () => {
  const facts = { ...base, activatedAt: '2026-11-16T04:30:00Z', firstUploadAt: '2026-11-16T04:30:00Z', firstRenderedAt: '2026-11-16T04:30:00Z' }
  const blocked = { ...facts, blockers: [{ id: 'b', stage: 'mapped', waitingOn: 'customer', raisedAt: ist('2026-11-16T11:00:00').toISOString(), resolvedAt: null, reason: 'Send the approved layout' }] }
  const v = S.setupView(blocked, ist('2026-11-18T12:00:00'))
  assert.equal(v.overdue, false); assert.equal(v.currentDue, null)
  assert.equal(v.waitingOnCustomer.reason, 'Send the approved layout')
  const resolved = { ...facts, blockers: [{ ...blocked.blockers[0], resolvedAt: ist('2026-11-18T11:00:00').toISOString() }] }
  assert.equal(S.setupView(resolved, ist('2026-11-18T12:00:00')).overdue, false, 'paused time does not count')
  const ours = { ...facts, blockers: [{ ...blocked.blockers[0], waitingOn: 'regrow' }] }
  assert.equal(S.setupView(ours, ist('2026-11-18T12:00:00')).overdue, true, 'waiting on REGrow does not pause the clock')
})

test('the database: derived stages, immutable blockers, project ownership, server-only tables', () => {
  const sql = read('supabase/migrations/20260084_plot_map_setup.sql')
  assert.match(sql, /rendered_at TIMESTAMPTZ/)
  assert.match(sql, /a blocker is not edited/)
  assert.match(sql, /this blocker is already resolved/)
  assert.match(sql, /project belongs to another organisation/)
  assert.match(sql, /ENABLE ROW LEVEL SECURITY[\s\S]*REVOKE ALL ON public\.plot_map_setup_blockers, public\.plot_map_setup_assignments FROM PUBLIC, anon, authenticated/)
  assert.doesNotMatch(sql, /GRANT [^;]*plot_map_setup_[a-z]+ TO (anon|authenticated)/)
  assert.match(sql, /'document_viewed', 'plot_map'\)/)
  assert.match(sql, /plot_map_activated', 'plot_map_action_needed', 'plot_map_published', 'plot_map_delayed'/)
})

test('staff see set-up metadata only; workspace resolves only its own blockers; everything is audited', () => {
  const dal = read('lib/dal/plot-map-setup.ts')
  const queue = dal.slice(dal.indexOf('export async function setupQueue'))
  assert.doesNotMatch(queue.slice(0, queue.indexOf('export async function assignSetup')), /inventory_items|leads|plot_map_shapes'\)\.select\('label/)
  const admin = read('app/api/admin/plot-map-setup/route.ts')
  assert.match(admin, /authenticatePlatformAdmin\(\[\.\.\.CAN\.plotMapSetup\], true\)/)
  assert.match(admin, /logPlatformAction/)
  const ws = read('app/api/plot-maps/setup/blockers/[blockerId]/route.ts')
  assert.match(ws, /gatePlotMapWrite/); assert.match(ws, /waiting_on !== 'customer'/); assert.match(ws, /auditMember/)
  assert.match(read('lib/platform/portal.ts'), /plotMapSetup: \['super_admin', 'platform_admin', 'support_agent'\]/)
})

test('embedding: https origins only, at most 10, and a frame-ancestors policy on /m/ pages', () => {
  assert.equal(E.normaliseEmbedDomain('www.Example.com'), 'https://www.example.com')
  assert.equal(E.normaliseEmbedDomain('https://example.co.in/plots?x=1'), 'https://example.co.in')
  for (const bad of ['http://example.com', '*.example.com', 'https://1.2.3.4', 'example.com:8443', 'javascript:alert(1)', 'localhost', "a.com 'unsafe-inline'", ''])
    assert.equal(E.normaliseEmbedDomain(bad), null, bad)
  assert.deepEqual(E.parseEmbedDomains(['a.com', 'https://a.com', ' ']), { ok: true, origins: ['https://a.com'] })
  assert.equal(E.parseEmbedDomains(Array.from({ length: 11 }, (_, i) => `s${i}.com`)).ok, false)
  assert.equal(E.frameAncestors([]), "frame-ancestors 'self'")
  assert.equal(E.frameAncestors(['https://a.com', "https://b.com; script-src *"]), "frame-ancestors 'self' https://a.com")
  const proxy = read('proxy.ts')
  assert.match(proxy, /rpc\('plot_map_embed_origins'/); assert.match(proxy, /Content-Security-Policy', frameAncestors\(origins\)/)
  assert.match(read('supabase/migrations/20260084_plot_map_setup.sql'), /share_enabled AND l\.status = 'published'\s+AND public\.project_addon_state\(l\.project_id, 'plot_maps'\) = 'active'/)
})

console.log(`\nPlot map set-up: ${passed} checks passed.`)
