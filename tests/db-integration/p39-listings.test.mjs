// tests/db-integration/p39-listings.test.mjs — agency listings (migration 20260079, lib/dal/listings.ts) against the
// local Supabase stack: owner details only for the right people, organisation isolation, the agent guard, client
// lock-out, and matching a lead's requirements to listings.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) { console.error('FATAL: Supabase env required.'); process.exit(1) }
const RUN = crypto.randomBytes(4).toString('hex')
let passed = 0
async function test(name, fn) { try { await fn(); passed++; console.log(`  ✓ ${name}`) } catch (e) { console.error(`  ✗ ${name}`); throw e } }

async function main() {
  if (!globalThis.WebSocket) globalThis.WebSocket = class UnusedRealtimeTransport {}
  const jiti = createJiti(import.meta.url, { alias: { '@': root } })
  const dal = await jiti.import(path.join(root, 'lib/dal/listings.ts'))
  const { normaliseListing } = await jiti.import(path.join(root, 'lib/listings/listing.ts'))
  const pg = await import('pg')
  const db = new (pg.default || pg).Client({ connectionString: DATABASE_URL }); await db.connect()
  const one = async (s, p) => (await db.query(s, p)).rows[0]
  const mkProfile = async (n) => {
    const id = crypto.randomUUID()
    await db.query(`INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
      VALUES ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),now(),now(),'{}',$3)`, [id, `${n}-${RUN}@regrow.test`, JSON.stringify({ full_name: n })])
    return (await one('SELECT id FROM public.profiles WHERE auth_user_id=$1', [id])).id
  }

  console.log('P39 — LISTINGS')
  const org = (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,'channel_partner') RETURNING id`, [`Agency ${RUN}`, `ag-${RUN}`])).id
  const other = (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,'channel_partner') RETURNING id`, [`Agency2 ${RUN}`, `ag2-${RUN}`])).id
  const asha = await mkProfile('asha'); const ravi = await mkProfile('ravi'); const boss = await mkProfile('boss'); const outsider = await mkProfile('outsider')
  await db.query(`INSERT INTO public.org_members (org_id, profile_id, role) VALUES ($1,$2,'sales_exec'),($1,$3,'sales_exec'),($1,$4,'manager')`, [org, asha, ravi, boss])
  await db.query(`INSERT INTO public.org_members (org_id, profile_id, role) VALUES ($1,$2,'sales_exec')`, [other, outsider])
  const row = normaliseListing({ kind: 'rent', propertyType: 'apartment', title: '3BHK park view', locality: 'Kondapur', city: 'Hyderabad', monthlyRent: 42000, bhk: '3BHK', ownerName: 'Mr Rao', ownerPhone: '+91 98480 11111', address: 'Flat 702' }).row

  let id
  await test('an agent adds a listing; it is theirs', async () => {
    const r = await dal.createListing(org, asha, row, asha)
    assert.ok(r.id, r.error); id = r.id
  })

  await test('owner details and the full address reach the agent and managers, not other agents', async () => {
    const mine = await dal.getListing(org, id, { role: 'sales_exec', profileId: asha })
    assert.deepEqual(mine.owner, { name: 'Mr Rao', phone: '+91 98480 11111', email: null }); assert.equal(mine.address, 'Flat 702'); assert.equal(mine.canEdit, true)
    const mgr = await dal.getListing(org, id, { role: 'manager', profileId: boss })
    assert.equal(mgr.owner.name, 'Mr Rao')
    const colleague = await dal.getListing(org, id, { role: 'sales_exec', profileId: ravi })
    assert.equal(colleague.owner, null); assert.equal(colleague.address, null); assert.equal(colleague.canEdit, false)
    assert.equal(colleague.title, '3BHK park view', 'colleagues still see the listing to share it')
  })

  await test('another agency sees nothing; an outsider cannot be the agent', async () => {
    assert.equal(await dal.getListing(other, id, { role: 'manager', profileId: outsider }), null)
    assert.deepEqual(await dal.listListings(other, { role: 'manager', profileId: outsider }), [])
    const r = await dal.createListing(org, asha, row, outsider)
    assert.match(r.error, /member/)
    assert.equal(await dal.updateListing(other, id, { status: 'closed' }), false)
  })

  await test('clients have no access to the listings table', async () => {
    for (const role of ['anon', 'authenticated']) {
      await db.query('BEGIN')
      try {
        await db.query(`SET LOCAL ROLE ${role}`)
        await assert.rejects(db.query('SELECT * FROM public.listings'), /permission denied/)
      } finally { await db.query('ROLLBACK') }
    }
  })

  await test('matching: a tenant within the rent, in that locality, gets the listing — without owner details', async () => {
    const needs = { req_purpose: 'rent', budget_min: null, budget_max: null, req_rent_max: 45000, req_configurations: ['3BHK'], req_categories: [], req_property_types: ['apartment'], req_locations: ['Kondapur'], req_min_area: null, req_max_area: null }
    const m = await dal.matchListingsForLead(org, needs)
    assert.deepEqual(m.map((x) => x.listing.id), [id])
    assert.equal(m[0].listing.owner, null); assert.equal(m[0].listing.address, null)
    assert.deepEqual(await dal.matchListingsForLead(org, { ...needs, req_purpose: 'buy' }), [])
    await dal.updateListing(org, id, { status: 'closed' })
    assert.deepEqual(await dal.matchListingsForLead(org, needs), [], 'closed listings are not offered')
  })

  await test('requirement columns sit on the table behind the live-leads view', async () => {
    const lead = (await one(`INSERT INTO public.leads (org_id, name, phone, source, req_purpose, req_rent_max, req_property_types) VALUES ($1,'T','9876500009','website','rent',40000,ARRAY['office']) RETURNING id`, [org])).id
    const r = await one('SELECT req_purpose, req_rent_max, req_property_types FROM public.leads WHERE id=$1', [lead])
    assert.deepEqual([r.req_purpose, Number(r.req_rent_max), r.req_property_types], ['rent', 40000, ['office']])
    await assert.rejects(db.query(`UPDATE public.leads SET req_purpose='lease' WHERE id=$1`, [lead]), /check/i)
  })

  await test('the share template is stored per agency', async () => {
    assert.equal(await dal.saveShareTemplate(org, boss, '*{title}* in {locality} — {price}'), true)
    assert.equal(await dal.getShareTemplate(org), '*{title}* in {locality} — {price}')
    assert.match(await dal.getShareTemplate(other), /\{title\}/)
  })

  await db.query('DELETE FROM public.org_settings WHERE org_id = ANY($1)', [[org, other]])
  await db.end()
  console.log(`\nP39 listings: ${passed} checks passed.`)
}
main().catch((e) => { console.error(e); process.exit(1) })
