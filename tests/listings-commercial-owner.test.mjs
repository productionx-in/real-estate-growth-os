// tests/listings-commercial-owner.test.mjs — agency listings part 2 (20260095): commercial details and matching
// (fit-out, seats, frontage, parking), and e-mails to a property's owner (lib/listings/owner-email.ts).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const L = await jiti.import(path.join(root, 'lib/listings/listing.ts'))
const E = await jiti.import(path.join(root, 'lib/listings/owner-email.ts'))
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8')
let passed = 0
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`) }

const office = { kind: 'rent', propertyType: 'office', title: 'Office floor, HITEC City', locality: 'HITEC City', city: 'Hyderabad', monthlyRent: '350000', area: '4200', fitOut: 'warm_shell', seats: '60', frontageFt: '', parking: '6', ownerName: 'Lakshmi Rao', ownerPhone: '+91 98480 22222', ownerEmail: 'owner@example.com', address: 'Plot 12, Road 3' }
const row = (over = {}) => L.listingFromRow({ id: 'l1', status: 'available', area_unit: 'sqft', ...L.normaliseListing({ ...office, ...over }).row }, true)
const needs = (over = {}) => ({ req_purpose: 'rent', budget_min: null, budget_max: null, req_rent_max: null, req_configurations: [], req_categories: [], req_property_types: ['office'], req_locations: [], req_min_area: null, req_max_area: null, ...over })

console.log('LISTINGS — COMMERCIAL AND OWNER E-MAILS')

test('commercial details are kept for commercial types only, and checked', () => {
  const ok = L.normaliseListing(office)
  assert.deepEqual(ok.errors, {})
  assert.equal(ok.row.fit_out, 'warm_shell'); assert.equal(ok.row.seats, 60); assert.equal(ok.row.parking, 6); assert.equal(ok.row.frontage_ft, null)
  const flat = L.normaliseListing({ ...office, propertyType: 'apartment' }).row
  assert.equal(flat.fit_out, null); assert.equal(flat.seats, null); assert.equal(flat.parking, null, 'a flat never carries commercial details')
  assert.ok(L.normaliseListing({ ...office, seats: '4.5' }).errors.seats)
  assert.ok(L.normaliseListing({ ...office, seats: '0' }).errors.seats)
  assert.equal(L.normaliseListing({ ...office, fitOut: 'luxury' }).row.fit_out, null, 'unknown fit-out is dropped')
  assert.equal(L.commercialLine(row()), 'Warm shell · 60 seats · 6 parking')
  assert.equal(L.commercialLine(row({ propertyType: 'apartment' })), '')
})

test('matching: too few seats is no fit; a few short is a gap; fit-out is a preference', () => {
  assert.equal(L.scoreListing(needs({ req_min_seats: 80 }), row()), null, '60 < 80% of 80')
  const short = L.scoreListing(needs({ req_min_seats: 70 }), row())
  assert.ok(short && short.gaps.includes('10 seats short'))
  const enough = L.scoreListing(needs({ req_min_seats: 50, req_fit_out: ['warm_shell', 'plug_and_play'] }), row())
  assert.ok(enough.reasons.includes('60 seats') && enough.reasons.includes('Warm shell'))
  const other = L.scoreListing(needs({ req_fit_out: ['plug_and_play'] }), row())
  assert.ok(other && other.gaps.some((g) => /Warm shell, not plug and play/.test(g)), 'a different fit-out is shown, not hidden')
  assert.ok(L.scoreListing(needs({ req_fit_out: ['plug_and_play'] }), row()).score < enough.score)
  assert.ok(L.hasListingNeeds({ ...needs({ req_property_types: [], req_purpose: null }), req_min_seats: 10 }), 'seats alone count as a need')
  // Residential matching is unchanged by commercial needs.
  assert.ok(L.scoreListing(needs({ req_property_types: ['apartment'], req_min_seats: 500 }), row({ propertyType: 'apartment', seats: '' })))
})

test('the share message carries the commercial line, and still never the owner', () => {
  const text = L.shareText(L.DEFAULT_SHARE_TEMPLATE, row(), { agent: 'Asha', agentPhone: '+91 90000 00000', agency: 'Prime Realty' })
  assert.match(text, /4,200 sq ft · Warm shell · 60 seats · 6 parking/)
  assert.doesNotMatch(text, /Lakshmi|98480 22222|owner@example|Plot 12/)
  const flat = L.shareText(L.DEFAULT_SHARE_TEMPLATE, row({ propertyType: 'apartment', bhk: '3BHK' }), { agent: 'Asha', agentPhone: null, agency: 'Prime Realty' })
  assert.doesNotMatch(flat, /seats|·\s*$/m, 'nothing commercial, and no dangling separator, for homes')
  assert.match(flat, /^3BHK · 4,200 sq ft$/m)
  assert.equal(L.checkTemplate('{title} — {commercial} — call {agent}').error, null)
})

test('owner e-mails: listed and update; the owner’s own phone and address are not repeated; blocked without an address', () => {
  const who = { agent: 'Asha Menon', agentPhone: '+91 90000 00000', agency: 'Prime Realty' }
  const listed = E.ownerEmailContent('listed', row(), who)
  assert.equal(listed.subject, 'Your property is listed with Prime Realty')
  assert.ok(listed.paragraphs[0] === 'Dear Lakshmi,')
  const all = listed.paragraphs.join('\n')
  assert.match(all, /Warm shell · 60 seats/); assert.match(all, /₹3,50,000\/month/); assert.match(all, /Asha Menon \(\+91 90000 00000\)/)
  assert.doesNotMatch(all, /98480 22222|Plot 12/, 'the owner’s own phone and address are not echoed')
  assert.match(all, /never shared with them/)
  const upd = E.ownerEmailContent('update', row({ status: 'on_hold' }), who)
  assert.match(upd.paragraphs.join('\n'), /on hold/)
  const closed = E.ownerEmailContent('update', { ...row(), status: 'closed' }, who)
  assert.doesNotMatch(closed.paragraphs.join('\n'), /offered at/, 'no price once closed')
  assert.match(E.ownerEmailBlocker('listed', { ...row(), owner: { name: 'x', phone: null, email: null } }), /e-mail/)
  assert.match(E.ownerEmailBlocker('listed', { ...row(), status: 'closed' }), /status update/)
  assert.equal(E.ownerEmailBlocker('update', { ...row(), status: 'closed' }), null)
})

test('wiring: who may send, once a day, rendered at delivery for the right organisation; requirements accept the new needs', () => {
  const route = read('app/api/listings/[listingId]/owner-email/route.ts')
  assert.match(route, /authorizeOrgAccess\(orgId, \['owner', 'admin', 'manager', 'team_lead', 'sales_exec'\]\)/)
  assert.match(route, /requireAgency\(orgId\)/)
  assert.match(route, /if \(!listing\.canEdit \|\| !listing\.owner\)/, 'only people who may see the owner and change the listing')
  assert.match(route, /idempotencyKey: `listing-owner:\$\{listingId\}:\$\{kind\}:\$\{day\}`/)
  assert.match(route, /to: listing\.owner\.email!/, 'only to the address on the listing')
  assert.match(route, /'listing\.owner_emailed', \{ type: 'listing', id: listingId \}, \{ kind, outcome: result\.outcome \}\)/, 'the audit entry has no address')
  const tpl = read('lib/email/templates.ts')
  assert.match(tpl, /async 'listing\.owner'\(p, \{ db, orgId \}\)/)
  assert.match(tpl, /if \(row\.org_id !== orgId\) throw new TemplateError\('permanent'/)
  assert.match(tpl, /if \(!row\.owner_email\) return \{ skip:/)
  const req = read('app/api/leads/[leadId]/requirements/route.ts')
  assert.match(req, /req_fit_out: z\.array\(z\.enum\(Object\.keys\(FIT_OUT\)/); assert.match(req, /req_min_seats: z\.number\(\)\.int\(\)\.min\(1\)/)
  assert.match(read('lib/dal/matching.ts'), /req_fit_out, req_min_seats'/)
  const mig = read('supabase/migrations/20260095_listing_commercial_owner_emails.sql')
  assert.match(mig, /ALTER TABLE public\.listings/); assert.match(mig, /ALTER TABLE public\.leads_all/)
  assert.match(mig, /CREATE OR REPLACE VIEW public\.leads WITH \(security_invoker = true\) AS\s+SELECT \* FROM public\.leads_all WHERE deleted_at IS NULL;/)
  assert.match(mig, /req_fit_out <@ ARRAY\['bare_shell', 'warm_shell', 'plug_and_play'\]/)
  assert.doesNotMatch(mig, /GRANT .* TO (anon|authenticated)/, 'listings stays server-only')
})

console.log(`\nListings — commercial and owner e-mails: ${passed} checks passed.`)
