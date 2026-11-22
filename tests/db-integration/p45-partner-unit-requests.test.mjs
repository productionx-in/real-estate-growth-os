// tests/db-integration/p45-partner-unit-requests.test.mjs — partner booking requests (20260086, lib/dal/partners.ts)
// on the local Supabase stack: an agency can ask to hold only an available, shared unit for a buyer the developer
// accepted and still protects; one open request per buyer; the developer approves (the unit is held for the
// developer's own lead with the normal hold record) or declines with a reason; the agency can withdraw while it
// waits; neither side receives the other's lead; both audit logs record each step; clients are refused.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('FATAL: Supabase env required.'); process.exit(1) }
const RUN = crypto.randomBytes(4).toString('hex')
const PASSWORD = 'Partner-Test-' + crypto.randomBytes(8).toString('hex')
let passed = 0
async function test(name, fn) { try { await fn(); passed++; console.log(`  ✓ ${name}`) } catch (e) { console.error(`  ✗ ${name}`); throw e } }

async function main() {
  if (!globalThis.WebSocket) globalThis.WebSocket = class UnusedRealtimeTransport {}
  const jiti = createJiti(import.meta.url, { alias: { '@': root } })
  const P = await jiti.import(path.join(root, 'lib/dal/partners.ts'))
  const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const pg = await import('pg')
  const db = new (pg.default || pg).Client({ connectionString: DATABASE_URL }); await db.connect()
  const one = async (s, p) => (await db.query(s, p)).rows[0]
  const authIds = [], orgIds = []
  const mkOrg = async (name, type) => { const id = (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,$3) RETURNING id`, [`${name} ${RUN}`, `${name.toLowerCase()}-${RUN}`, type])).id; orgIds.push(id); return id }
  const mkUser = async (name, org, role) => {
    const { data, error } = await service.auth.admin.createUser({ email: `${name.toLowerCase()}-${RUN}@regrow.test`, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } })
    if (error) throw error
    authIds.push(data.user.id)
    const id = (await one('SELECT id FROM public.profiles WHERE auth_user_id=$1', [data.user.id])).id
    await db.query(`INSERT INTO public.org_members (org_id, profile_id, role) VALUES ($1,$2,$3)`, [org, id, role])
    return { id }
  }
  const ok = (r) => { assert.equal(r.success, true, r.error); return r.data }
  const refused = (r, status, re) => { assert.equal(r.success, false, 'expected a refusal'); if (status) assert.equal(r.status, status, r.error); if (re) assert.match(r.error, re) }
  const audits = async (org, action) => Number((await one(`SELECT count(*) n FROM public.org_audit_logs WHERE org_id=$1 AND action=$2`, [org, action])).n)

  console.log('P45 — PARTNER BOOKING REQUESTS')
  const dev = await mkOrg('Hilltop', 'developer'), agency = await mkOrg('Keys', 'channel_partner'), agency2 = await mkOrg('Doors', 'channel_partner')
  try {
    const devAdmin = await mkUser('HtAdmin', dev, 'admin'), devExec = await mkUser('HtExec', dev, 'sales_exec')
    const agAdmin = await mkUser('KyAdmin', agency, 'owner'), agAgent = await mkUser('KyAgent', agency, 'sales_exec')
    const ag2Admin = await mkUser('DrAdmin', agency2, 'owner')
    const proj = (await one(`INSERT INTO public.projects (org_id, name, slug, city) VALUES ($1,'Hilltop Heights',$2,'Pune') RETURNING id`, [dev, `ht-${RUN}`])).id
    const other = (await one(`INSERT INTO public.projects (org_id, name, slug, city) VALUES ($1,'Hilltop Plaza',$2,'Pune') RETURNING id`, [dev, `hp-${RUN}`])).id
    const unit = async (project, n, status = 'available') => (await one(`INSERT INTO public.inventory_items (org_id, project_id, unit_number, category, area_value, bhk_config, total_price, status)
      VALUES ($1,$2,$3,'apartments',1000,'2BHK',9000000,$4) RETURNING id`, [dev, project, n, status])).id
    const [u1, u2, uBooked, uOther] = [await unit(proj, 'H-1'), await unit(proj, 'H-2'), await unit(proj, 'H-3', 'booked'), await unit(other, 'P-1')]

    const code = ok(await P.ensurePartnerCode(agency, agAdmin.id))
    const p1 = ok(await P.requestPartnership(dev, devAdmin.id, code))
    ok(await P.setPartnershipStatus(agency, agAdmin.id, p1, 'accept'))
    ok(await P.shareProject(dev, devAdmin.id, p1, proj, 'availability'))
    const phone = `98${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`
    const agLead = (await one(`INSERT INTO public.leads (org_id, name, phone, source, status) VALUES ($1,'Ravi Kumar',$2,'website','new') RETURNING id`, [agency, phone])).id
    const reg = ok(await P.submitRegistration({ agencyOrgId: agency, actorProfileId: agAdmin.id, partnershipId: p1, projectId: proj, agencyLeadId: agLead, note: null, consent: true })).registration_id
    const ask = (over = {}) => P.requestUnit({ agencyOrgId: agency, actorProfileId: agAdmin.id, registrationId: reg, inventoryId: u1, note: 'Token ready', holdHours: 48, ...over })

    await test('no request before the developer accepts the buyer', async () => {
      refused(await ask(), 409, /accepted and still protected/i)
      assert.equal(await P.requestableUnits(agency, reg), null)
      ok(await P.reviewRegistration(dev, devAdmin.id, reg, true, null))
    })

    await test('only management, only shared projects, only available units, only the agency’s own registration', async () => {
      refused(await ask({ actorProfileId: agAgent.id }), 403)
      refused(await P.requestUnit({ agencyOrgId: agency2, actorProfileId: ag2Admin.id, registrationId: reg, inventoryId: u1, note: null, holdHours: 48 }), 404, /registration not found/i)
      refused(await ask({ inventoryId: uOther }), 404, /unit not found/i)
      refused(await ask({ inventoryId: uBooked }), 409, /no longer available/i)
      const units = await P.requestableUnits(agency, reg)
      assert.deepEqual(units.map((u) => u.unitNumber).sort(), ['H-1', 'H-2'], 'available units of the shared project only')
      assert.ok(!('price' in units[0]), 'no prices at availability-only sharing')
    })

    let req
    await test('one open request per buyer; both organisations audit it; neither side sees the other’s lead', async () => {
      req = ok(await ask())
      refused(await ask({ inventoryId: u2 }), 409, /already has a request waiting/i)
      assert.equal(await audits(dev, 'partner.unit_requested'), 1); assert.equal(await audits(agency, 'partner.unit_requested'), 1)
      const agencyView = await P.listUnitRequests(agency, 'agency')
      assert.equal(agencyView[0].unitNumber, 'H-1'); assert.equal(agencyView[0].developerLeadId, undefined)
      const devLeadId = (await one('SELECT developer_lead_id FROM public.deal_registrations WHERE id=$1', [reg])).developer_lead_id
      assert.ok(!JSON.stringify(agencyView).includes(devLeadId), 'the agency never gets the developer lead')
      const devView = await P.listUnitRequests(dev, 'developer')
      assert.ok(devView[0].developerLeadId); assert.ok(!JSON.stringify(devView).includes(agLead), 'the developer never gets the agency lead')
    })

    await test('decline needs a reason; sales executives cannot review; approval holds the unit for the developer lead', async () => {
      refused(await P.reviewUnitRequest(dev, devExec.id, req, true, null), 403)
      refused(await P.reviewUnitRequest(dev, devAdmin.id, req, false, ''), 409, /reason/i)
      const out = ok(await P.reviewUnitRequest(dev, devAdmin.id, req, true, null))
      assert.equal(out.status, 'approved'); assert.ok(out.held_until)
      assert.equal((await one('SELECT status FROM public.inventory_items WHERE id=$1', [u1])).status, 'blocked')
      const devLead = (await one('SELECT developer_lead_id FROM public.deal_registrations WHERE id=$1', [reg])).developer_lead_id
      const b = await one('SELECT lead_id, status, org_id FROM public.inventory_blockings WHERE inventory_id=$1', [u1])
      assert.deepEqual([b.lead_id, b.status, b.org_id], [devLead, 'active', dev])
      assert.equal(ok(await P.reviewUnitRequest(dev, devAdmin.id, req, true, null)).status, 'approved', 'repeat is harmless')
      refused(await P.withdrawUnitRequest(agency, agAdmin.id, req), 409, /already answered/i)
      assert.equal(await audits(agency, 'partner.unit_request_approved'), 1)
    })

    await test('a second request: withdrawn while waiting; a third: declined with the reason shown to the agency', async () => {
      const r2 = ok(await ask({ inventoryId: u2 }))
      assert.equal(ok(await P.withdrawUnitRequest(agency, agAdmin.id, r2)), 'withdrawn')
      refused(await P.reviewUnitRequest(dev, devAdmin.id, r2, true, null), 409, /no longer waiting/i)
      const r3 = ok(await ask({ inventoryId: u2 }))
      assert.equal(ok(await P.reviewUnitRequest(dev, devAdmin.id, r3, false, 'Reserved for a walk-in buyer')).status, 'declined')
      const seen = (await P.listUnitRequests(agency, 'agency')).find((r) => r.id === r3)
      assert.equal(seen.declineReason, 'Reserved for a walk-in buyer')
      assert.equal((await one('SELECT status FROM public.inventory_items WHERE id=$1', [u2])).status, 'available', 'a declined request holds nothing')
    })

    await test('clients cannot read requests or call the functions', async () => {
      for (const role of ['anon', 'authenticated']) {
        await db.query('BEGIN')
        try {
          await db.query(`SET LOCAL ROLE ${role}`)
          for (const q of ['SELECT * FROM public.partner_unit_requests', `SELECT public.partner_review_unit_request('${dev}','${devAdmin.id}','${req}',true,NULL)`]) {
            await db.query('SAVEPOINT s'); await assert.rejects(db.query(q), /permission denied/, `${role}: ${q}`); await db.query('ROLLBACK TO SAVEPOINT s')
          }
        } finally { await db.query('ROLLBACK') }
      }
    })
    console.log(`\nP45 partner booking requests: ${passed} checks passed.`)
  } finally {
    for (const id of orgIds) await db.query('DELETE FROM public.org_partnerships WHERE developer_org_id=$1 OR agency_org_id=$1', [id]).catch((e) => console.error('cleanup', e.message))
    for (const id of orgIds) {
      await db.query('DELETE FROM public.inventory_blockings WHERE org_id=$1', [id]).catch(() => {})
      await db.query('DELETE FROM public.leads_all WHERE org_id=$1', [id]).catch((e) => console.error('cleanup', e.message))
      await db.query('DELETE FROM public.inventory_items WHERE org_id=$1', [id]).catch(() => {})
      await db.query('DELETE FROM public.projects WHERE org_id=$1', [id]).catch((e) => console.error('cleanup', e.message))
      await db.query('DELETE FROM public.org_members WHERE org_id=$1', [id]).catch(() => {})
      await db.query('DELETE FROM public.organisations WHERE id=$1', [id]).catch((e) => console.error('cleanup', e.message))
    }
    for (const id of authIds) await service.auth.admin.deleteUser(id).catch(() => {})
    await db.end()
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
