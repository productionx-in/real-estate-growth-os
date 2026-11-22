// tests/partner-network.test.mjs — channel partner network (PR 1) rules, request shapes and server guards
// (lib/partners/rules.ts, lib/validations/partners.ts, app/api/partners/**, lib/dal/partners.ts). Module test:
// no database (the database behaviour is covered by tests/db-integration/p19-partner-network.test.mjs).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const R = await jiti.import(path.join(root, 'lib/partners/rules.ts'))
const V = await jiti.import(path.join(root, 'lib/validations/partners.ts'))
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8')
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : e.name === 'route.ts' ? [path.join(d, e.name)] : [])

let passed = 0
async function test(name, fn) { await fn(); passed++; console.log(`  ✓ ${name}`) }
const ID = '11111111-1111-4111-8111-111111111111'

console.log('PARTNER NETWORK')

await test('approved defaults: availability without prices, 60 days, consent statement names both sides and the project', () => {
  assert.equal(R.DEFAULT_VISIBILITY, 'availability')
  assert.equal(R.DEFAULT_PROTECTION_DAYS, 60)
  const s = R.consentStatement('Brokers', 'Skyline', 'Skyline Towers')
  for (const w of ['Brokers', 'Skyline', 'Skyline Towers', 'authorised']) assert.ok(s.includes(w), w)
  assert.match(R.CONSENT_VERSION, /^cp-share-v\d+$/)
})

await test('roles: owners/admins manage partnerships; owners/admins/managers register and review; agents never', () => {
  assert.deepEqual(['owner', 'admin', 'manager', 'sales_exec'].map(R.canManagePartnerships), [true, true, false, false])
  assert.deepEqual(['owner', 'admin', 'manager', 'sales_exec', null].map(R.canRegisterOrReview), [true, true, true, false, false])
})

await test('lifecycle actions offered match the database: only the pausing side resumes; ended is final', () => {
  assert.deepEqual(R.allowedActions('invited', 'agency', false), ['accept', 'reject'])
  assert.deepEqual(R.allowedActions('invited', 'developer', false), ['cancel'])
  assert.deepEqual(R.allowedActions('active', 'agency', false), ['pause', 'end'])
  assert.deepEqual(R.allowedActions('paused', 'developer', true), ['resume', 'end'])
  assert.deepEqual(R.allowedActions('paused', 'agency', false), ['end'])
  for (const s of ['rejected', 'cancelled', 'ended']) assert.deepEqual(R.allowedActions(s, 'developer', true), [])
})

await test('partner codes: tolerant of case and spaces, strict alphabet', () => {
  assert.equal(R.normalizePartnerCode(' rgp-abcd234567 '), 'RGP-ABCD234567')
  assert.equal(R.normalizePartnerCode('RGP-ABCD 2345 67'), 'RGP-ABCD234567')
  for (const bad of ['RGP-ABCD23456', 'RGP-ABCD2345670', 'RGP-ABCD23456O', 'RGP-ABCD234561', 'XYZ-ABCD234567', null, 7]) assert.equal(R.normalizePartnerCode(bad), null, String(bad))
})

await test('requests: consent must be literally true; unknown fields (prices, phones, org ids of the other side) are refused', () => {
  const base = { orgId: ID, partnershipId: ID, projectId: ID, agencyLeadId: ID, note: 'x', consent: true }
  assert.equal(V.SubmitRegistration.safeParse(base).success, true)
  for (const consent of [false, 'true', 1, undefined]) assert.equal(V.SubmitRegistration.safeParse({ ...base, consent }).success, false, String(consent))
  for (const extra of [{ buyerPhone: '9845011111' }, { buyerName: 'X' }, { price: 1 }, { developerOrgId: ID }]) {
    assert.equal(V.SubmitRegistration.safeParse({ ...base, ...extra }).success, false, Object.keys(extra)[0])
  }
  assert.equal(V.SubmitRegistration.safeParse({ ...base, note: 'x'.repeat(1001) }).success, false)
  assert.equal(V.ShareProject.safeParse({ orgId: ID, projectId: ID, visibility: null }).success, true, 'null stops sharing')
  assert.equal(V.ShareProject.safeParse({ orgId: ID, projectId: ID, visibility: 'everything' }).success, false)
  assert.equal(V.ReviewRegistration.safeParse({ orgId: ID, accept: false }).success, false, 'a rejection needs a reason')
  assert.equal(V.ReviewRegistration.safeParse({ orgId: ID, accept: false, reason: 'Already in talks' }).success, true)
  assert.equal(V.ReviewRegistration.safeParse({ orgId: ID, accept: true, commission: 2 }).success, false)
})

await test('guards: every partner route authorises on the server with the right roles and the module switch', () => {
  const routes = walk(path.join(root, 'app/api/partners')).map((f) => path.relative(root, f))
  assert.equal(routes.length, 10, routes.join(', '))
  const expect = {
    'app/api/partners/code/route.ts': /authorizeOrgAccess\([^)]*\['owner', 'admin'\]\)/,
    'app/api/partners/[partnershipId]/status/route.ts': /authorizeOrgAccess\([^)]*\['owner', 'admin'\]\)/,
    'app/api/partners/[partnershipId]/projects/route.ts': /authorizeOrgAccess\([^)]*\['owner', 'admin'\]\)/,
    'app/api/partners/registrations/route.ts': /authorizeLeadAccess\(input\.data\.agencyLeadId, \[\.\.\.MANAGEMENT_ROLES\]\)/,
    'app/api/partners/registrations/[registrationId]/review/route.ts': /authorizeOrgAccess\([^)]*\[\.\.\.MANAGEMENT_ROLES\]\)/,
    'app/api/partners/unit-requests/route.ts': /authorizeOrgAccess\([^)]*\[\.\.\.MANAGEMENT_ROLES\]\)/,
    'app/api/partners/unit-requests/[requestId]/review/route.ts': /authorizeOrgAccess\([^)]*\[\.\.\.MANAGEMENT_ROLES\]\)/,
    'app/api/partners/unit-requests/[requestId]/withdraw/route.ts': /authorizeOrgAccess\([^)]*\[\.\.\.MANAGEMENT_ROLES\]\)/,
  }
  for (const [f, re] of Object.entries(expect)) assert.match(read(f), re, f)
  for (const f of routes) {
    const src = read(f)
    assert.doesNotMatch(src, /createClient\(|\.from\(/, `${f} reads no tables directly; everything goes through lib/dal/partners`)
    assert.match(src, /auth\.context\.profile\.id|auth\.context\.orgId/, `${f} acts as the authorised caller`)
  }
  assert.match(read('app/api/partners/registrations/route.ts'), /auth\.context\.orgId !== input\.data\.orgId/, 'the lead must be in the organisation acted for')
})

await test('shaping: prices only for availability_and_price; no lead ids cross sides; conflicts never name the other claim', () => {
  const dal = read('lib/dal/partners.ts')
  assert.match(dal, /const withPrice = vis === 'availability_and_price'\n.*withPrice \? ', total_price' : ''/, 'the price column is read only at that share level')
  const forDev = dal.slice(dal.indexOf('export async function listRegistrationsForDeveloper'), dal.indexOf('export interface AgencyRegistrationView'))
  const selected = (block) => (block.match(/\.select\('([^']+)'\)/) ?? [])[1] ?? ''
  assert.ok(selected(forDev).length > 0)
  assert.doesNotMatch(selected(forDev), /agency_lead_id/, 'the developer never receives the agency’s lead id')
  const forAgency = dal.slice(dal.indexOf('export async function listRegistrationsForAgency'), dal.indexOf('export interface PartnerUnit'))
  assert.ok(selected(forAgency).length > 0)
  assert.doesNotMatch(selected(forAgency), /developer_lead_id|notes|leads\(/, 'the agency never receives the developer’s lead or notes')
  const sql = read('supabase/migrations/20260058_channel_partner_network.sql')
  assert.match(sql, /pg_advisory_xact_lock\(hashtextextended\('partner_reg:'/, 'claims on one buyer are serialised')
  assert.match(sql, /uq_deal_registrations_live_buyer[\s\S]*WHERE status IN \('submitted', 'accepted'\)/, 'one live claim per buyer per developer')
  assert.doesNotMatch(sql, /GRANT [^;]*partner_[a-z_]+[^;]* TO authenticated/i, 'browsers cannot call the partner functions')
})

console.log(`\nPartner network: ${passed} checks passed.`)
