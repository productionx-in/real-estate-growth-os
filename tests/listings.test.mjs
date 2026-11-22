// tests/listings.test.mjs — resale and rental listings for agencies (lib/listings/listing.ts, 20260079): what a
// listing must have, the share message (never the owner or the full address), matching buyers and tenants, and
// the access rules in the routes and pages.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const L = await jiti.import(path.join(root, 'lib/listings/listing.ts'))
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8')
let passed = 0
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`) }

const base = { kind: 'rent', propertyType: 'apartment', title: '3BHK park view', locality: 'Kondapur', city: 'Hyderabad', monthlyRent: '42,000', deposit: '200000', bhk: '3BHK', area: '1650', ownerName: 'Mr Rao', ownerPhone: '+91 98480 11111', ownerEmail: 'Rao@Example.com', address: 'Flat 702, Tower B' }
const listing = (over = {}) => L.listingFromRow({ id: 'l1', status: 'available', area_unit: 'sqft', ...L.normaliseListing({ ...base, ...over }).row }, true)
const needs = (over = {}) => ({ req_purpose: null, budget_min: null, budget_max: null, req_rent_max: null, req_configurations: [], req_categories: [], req_property_types: [], req_locations: [], req_min_area: null, req_max_area: null, ...over })

console.log('LISTINGS')

test('a listing needs its basics; sale has a price, rent a rent; owner contact is checked', () => {
  const ok = L.normaliseListing(base)
  assert.deepEqual(ok.errors, {})
  assert.equal(ok.row.monthly_rent, 42000); assert.equal(ok.row.owner_email, 'rao@example.com')
  assert.ok(L.normaliseListing({ ...base, title: 'x' }).errors.title)
  assert.ok(L.normaliseListing({ ...base, kind: 'sale' }).errors.monthlyRent, 'a sale with a rent')
  assert.ok(L.normaliseListing({ ...base, price: '9000000' }).errors.price, 'a rental with a price')
  assert.ok(L.normaliseListing({ ...base, ownerPhone: 'call me' }).errors.ownerPhone)
  assert.ok(L.normaliseListing({ ...base, propertyType: 'castle' }).errors.propertyType)
})

test('the share message never contains the owner or the full address, even if the template asks', () => {
  const l = listing()
  const msg = L.shareText(L.DEFAULT_SHARE_TEMPLATE, l, { agent: 'Priya', agentPhone: '+91 90000 00000', agency: 'Acme Realty' })
  for (const secret of ['Rao', '98480', 'Flat 702', 'Example.com']) assert.ok(!msg.toLowerCase().includes(secret.toLowerCase()), secret)
  assert.match(msg, /₹42,000\/month/); assert.match(msg, /Kondapur, Hyderabad/); assert.match(msg, /Priya/)
  assert.equal(L.checkTemplate('{title} {owner_phone} call now').error, 'Not a field: {owner_phone}.')
  assert.equal(L.checkTemplate('{title} in {locality}').error, null)
})

test('matching: buy or rent, property type (incl. commercial), BHK and budget decide; area and place score', () => {
  const l = listing()
  assert.equal(L.scoreListing(needs({ req_purpose: 'buy' }), l), null, 'a buyer is not offered a rental')
  assert.ok(L.scoreListing(needs({ req_purpose: 'rent', req_rent_max: 45000 }), l).reasons.includes('Within budget'))
  assert.equal(L.scoreListing(needs({ req_purpose: 'rent', req_rent_max: 35000 }), l), null, 'more than 10% over the rent')
  assert.equal(L.scoreListing(needs({ req_property_types: ['office', 'shop'] }), l), null, 'commercial need, residential listing')
  const office = listing({ propertyType: 'office', bhk: '' })
  assert.ok(L.scoreListing(needs({ req_property_types: ['office'], req_purpose: 'rent' }), office))
  assert.ok(L.scoreListing(needs({ req_categories: ['commercial_sale'] }), office), 'developer categories map to listing types')
  assert.equal(L.scoreListing(needs({ req_configurations: ['2BHK'] }), l), null)
  assert.ok(L.scoreListing(needs({ req_locations: ['kondapur'] }), l).reasons.includes('kondapur'))
  assert.equal(L.scoreListing(needs(), { ...l, status: 'closed' }), null)
})

test('routes: agencies only; selling roles add; changes by the agent, their creator or managers; deletes by owners and admins; audited', () => {
  const create = read('app/api/listings/route.ts')
  assert.match(create, /authorizeOrgAccess\(orgId, \['owner', 'admin', 'manager', 'team_lead', 'sales_exec'\]\)/)
  assert.match(create, /requireAgency\(orgId\)/)
  assert.match(create, /isManagement\(access\.context\.role\) \? \(parsed\.data\.assignedTo \?\? me\) : me/)
  const one = read('app/api/listings/[listingId]/route.ts')
  assert.match(one, /canEditListing\(viewer, current\)/)
  assert.match(one, /Only a manager can hand a listing to another agent/)
  assert.match(one, /if \(!\('status' in parsed\.data\.listing\)\) delete patch\.status/, 'editing details never resets the status')
  assert.match(one.slice(one.indexOf('export async function DELETE')), /authorizeOrgAccess\(orgId, \['owner', 'admin'\]\)/)
  assert.ok((one.match(/requireAgency\(orgId\)/g) ?? []).length === 2)
  for (const a of ["'listing.created'", "'listing.updated'", "'listing.deleted'"]) assert.ok((create + one).includes(a), a)
  const dal = read('lib/dal/listings.ts')
  assert.match(dal, /isManagement\(v\.role\) \|\| row\.assigned_to === v\.profileId \|\| row\.created_by === v\.profileId/)
  assert.match(dal, /listingFromRow\(r, false\)/, 'matches never carry owner details')
})

test('migration: server-only listings with an in-organisation agent; new requirement columns on the table behind the view', () => {
  const m = read('supabase/migrations/20260079_listings.sql')
  assert.match(m, /ALTER TABLE public\.listings ENABLE ROW LEVEL SECURITY;\s*REVOKE ALL ON public\.listings FROM PUBLIC, anon, authenticated;/)
  assert.match(m, /the agent is not a member of this organisation/)
  assert.match(m, /ALTER TABLE public\.leads_all\s+ADD COLUMN IF NOT EXISTS req_purpose/)
  assert.match(m, /CREATE OR REPLACE VIEW public\.leads WITH \(security_invoker = true\) AS\s+SELECT \* FROM public\.leads_all WHERE deleted_at IS NULL/)
  const earlier = fs.readdirSync(path.join(root, 'supabase/migrations')).filter((f) => f < '20260079')
  for (const f of earlier) assert.doesNotMatch(read(`supabase/migrations/${f}`), /\breq_purpose\b|\breq_rent_max\b|\breq_property_types\b|TABLE[^;]*\blistings\b/, f)
})

console.log(`\nListings: ${passed} checks passed.`)
