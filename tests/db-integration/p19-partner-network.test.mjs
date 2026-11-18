// tests/db-integration/p19-partner-network.test.mjs — channel partner network PR 1 (migration 20260058,
// lib/dal/partners.ts) against the local Supabase stack. REAL database: every check runs the production SQL
// functions through the real DAL (service role, as the API does) or a signed-in client (as a browser would).
// Nothing is mocked.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) { console.error('FATAL: Supabase env required (URL, anon and service keys).'); process.exit(1) }
const RUN = crypto.randomBytes(4).toString('hex')
const PASSWORD = 'Partner-Test-' + crypto.randomBytes(8).toString('hex')
let passed = 0
async function test(name, fn) { try { await fn(); passed++; console.log(`  ✓ ${name}`) } catch (e) { console.error(`  ✗ ${name}`); throw e } }
class UnusedRealtimeTransport { constructor() { throw new Error('Realtime is not used by these tests') } }
const clientOpts = { auth: { persistSession: false, autoRefreshToken: false }, ...(globalThis.WebSocket ? {} : { realtime: { transport: UnusedRealtimeTransport } }) }

async function main() {
  if (!globalThis.WebSocket) globalThis.WebSocket = class UnusedRealtimeTransport {}
  const jiti = createJiti(import.meta.url, { alias: { '@': root } })
  const P = await jiti.import(path.join(root, 'lib/dal/partners.ts'))
  const service = createClient(SUPABASE_URL, SERVICE_KEY, clientOpts)
  const pg = await import('pg')
  const db = new (pg.default || pg).Client({ connectionString: DATABASE_URL })
  await db.connect()
  const one = async (s, p) => (await db.query(s, p)).rows[0]
  const authIds = [], orgIds = []

  const mkOrg = async (name, type) => {
    const id = (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,$3) RETURNING id`, [`${name} ${RUN}`, `${name.toLowerCase()}-${RUN}`, type])).id
    orgIds.push(id); return id
  }
  const mkUser = async (name, org, role) => {
    const email = `${name.toLowerCase()}-${RUN}@regrow.test`
    const { data, error } = await service.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } })
    if (error) throw error
    authIds.push(data.user.id)
    const id = (await one('SELECT id FROM public.profiles WHERE auth_user_id=$1', [data.user.id])).id
    await db.query(`INSERT INTO public.org_members (org_id, profile_id, role) VALUES ($1,$2,$3)`, [org, id, role])
    return { id, email }
  }
  const lead = async (org, name, phone, status = 'new') => (await one(
    `INSERT INTO public.leads (org_id, name, phone, source, status) VALUES ($1,$2,$3,'website',$4) RETURNING id`, [org, name, phone, status])).id
  const audits = async (org, action) => Number((await one(`SELECT count(*) n FROM public.org_audit_logs WHERE org_id=$1 AND action=$2`, [org, action])).n)
  const ok = (r) => { assert.equal(r.success, true, r.error); return r.data }
  const refused = (r, status, re) => { assert.equal(r.success, false, 'expected a refusal'); if (status) assert.equal(r.status, status, r.error); if (re) assert.match(r.error, new RegExp(re.source, "i")) }

  console.log('P19 — CHANNEL PARTNER NETWORK (PR 1, real database)')
  const dev = await mkOrg('Skyline', 'developer'), dev2 = await mkOrg('Lakeview', 'developer')
  const agency = await mkOrg('Brokers', 'channel_partner'), agency2 = await mkOrg('Homefinders', 'channel_partner')
  try {
    const devAdmin = await mkUser('DevAdmin', dev, 'admin'), devMgr = await mkUser('DevMgr', dev, 'manager'), devExec = await mkUser('DevExec', dev, 'sales_exec')
    const dev2Admin = await mkUser('Dev2Admin', dev2, 'owner')
    const agAdmin = await mkUser('AgAdmin', agency, 'owner'), agMgr = await mkUser('AgMgr', agency, 'manager'), agAgent = await mkUser('AgAgent', agency, 'sales_exec')
    const ag2Admin = await mkUser('Ag2Admin', agency2, 'admin')
    const sky = (await one(`INSERT INTO public.projects (org_id, name, slug, city) VALUES ($1,'Skyline Towers',$2,'Bengaluru') RETURNING id`, [dev, `sky-${RUN}`])).id
    const sky2 = (await one(`INSERT INTO public.projects (org_id, name, slug, city) VALUES ($1,'Skyline Park',$2,'Bengaluru') RETURNING id`, [dev, `skp-${RUN}`])).id
    const lake = (await one(`INSERT INTO public.projects (org_id, name, slug, city) VALUES ($1,'Lakeview',$2,'Mysuru') RETURNING id`, [dev2, `lake-${RUN}`])).id
    await db.query(`INSERT INTO public.inventory_items (org_id, project_id, unit_number, category, area_value, bhk_config, total_price, status) VALUES
      ($1,$2,'A-101','apartments',1100,'3BHK',11500000,'available'),($1,$2,'A-102','apartments',900,'2BHK',8000000,'booked')`, [dev, sky])

    // ── Partnership lifecycle ───────────────────────────────────────────────────────────────
    let code, code2, p1, p2, p3
    await test('partner code: agency owners/admins only; stable; developers have none', async () => {
      refused(await P.ensurePartnerCode(agency, agMgr.id), 403)
      code = ok(await P.ensurePartnerCode(agency, agAdmin.id))
      assert.match(code, /^RGP-[2-9A-HJKMNP-Z]{10}$/)
      assert.equal(ok(await P.ensurePartnerCode(agency, agAdmin.id)), code, 'same code on repeat')
      refused(await P.ensurePartnerCode(agency, devAdmin.id), 403, undefined, 'a member of another organisation')
      refused(await P.ensurePartnerCode(dev, devAdmin.id), 409, /only agencies/i)
      code2 = ok(await P.ensurePartnerCode(agency2, ag2Admin.id))
    })

    await test('request: developer owners/admins only; an unknown code reveals nothing; no duplicate open partnership', async () => {
      refused(await P.requestPartnership(dev, devMgr.id, code), 403)
      refused(await P.requestPartnership(agency, agAdmin.id, code2), 409, /only developers/i)
      refused(await P.requestPartnership(dev, devAdmin.id, 'RGP-ZZZZZZZZZZ'), 404, /no agency with that partner code/i)
      p1 = ok(await P.requestPartnership(dev, devAdmin.id, code))
      refused(await P.requestPartnership(dev, devAdmin.id, code), 409, /already have a partnership/i)
      assert.equal(await audits(dev, 'partner.requested'), 1)
      assert.equal(await audits(agency, 'partner.requested'), 1, 'both organisations record the request')
    })

    await test('respond: only the agency’s owners/admins accept; the developer cannot accept its own request', async () => {
      refused(await P.setPartnershipStatus(dev, devAdmin.id, p1, 'accept'), 409)
      refused(await P.setPartnershipStatus(agency, agMgr.id, p1, 'accept'), 403)
      refused(await P.setPartnershipStatus(agency2, ag2Admin.id, p1, 'accept'), 404, /not found/i)
      assert.equal(ok(await P.setPartnershipStatus(agency, agAdmin.id, p1, 'accept')), 'active')
      assert.equal(ok(await P.setPartnershipStatus(agency, agAdmin.id, p1, 'accept')), 'active', 'repeat is harmless')
    })

    await test('an agency can partner with several developers; a developer with several agencies; rejection is final', async () => {
      p2 = ok(await P.requestPartnership(dev2, dev2Admin.id, code))
      ok(await P.setPartnershipStatus(agency, agAdmin.id, p2, 'accept'))
      p3 = ok(await P.requestPartnership(dev, devAdmin.id, code2))
      assert.equal(ok(await P.setPartnershipStatus(agency2, ag2Admin.id, p3, 'reject')), 'rejected')
      refused(await P.setPartnershipStatus(agency2, ag2Admin.id, p3, 'accept'), 409)
      p3 = ok(await P.requestPartnership(dev, devAdmin.id, code2)) // a new request after a rejection
      ok(await P.setPartnershipStatus(agency2, ag2Admin.id, p3, 'accept'))
      const mine = await P.listPartnerships(agency)
      assert.deepEqual(mine.map((x) => x.status).sort(), ['active', 'active'])
      assert.ok(mine.every((x) => x.side === 'agency'))
    })

    // ── Project sharing ─────────────────────────────────────────────────────────────────────
    await test('sharing: developer owners/admins, own projects only; default visibility is availability without prices', async () => {
      refused(await P.shareProject(dev, devMgr.id, p1, sky, 'availability'), 403)
      refused(await P.shareProject(dev, devAdmin.id, p1, lake, 'availability'), 404, /project not found/i)
      refused(await P.shareProject(dev2, dev2Admin.id, p1, lake, 'availability'), 404, /partnership not found/i)
      const { data, error } = await service.rpc('partner_share_project', { p_developer: dev, p_actor: devAdmin.id, p_partnership: p1, p_project: sky, p_visibility: 'availability' })
      assert.ifError(error); assert.equal(data, 'availability')
      assert.equal((await one(`SELECT inventory_visibility FROM public.partnership_projects WHERE partnership_id=$1 AND project_id=$2`, [p1, sky])).inventory_visibility, 'availability')
      assert.equal(await audits(agency, 'partner.project_shared'), 1)
    })

    await test('inventory: none = refused, availability = no price field at all, prices only when granted; revoke stops access', async () => {
      const avail = await P.partnerInventory(agency, p1, sky)
      assert.equal(avail.length, 2)
      assert.ok(avail.every((u) => !('price' in u)), 'no price key when prices are not shared')
      assert.deepEqual(avail.map((u) => u.available).sort(), [false, true])
      ok(await P.shareProject(dev, devAdmin.id, p1, sky, 'availability_and_price'))
      assert.deepEqual((await P.partnerInventory(agency, p1, sky)).map((u) => u.price).sort(), [11500000, 8000000].sort())
      ok(await P.shareProject(dev, devAdmin.id, p1, sky, 'none'))
      assert.equal(await P.partnerInventory(agency, p1, sky), null)
      assert.equal(await P.partnerInventory(agency2, p1, sky), null, 'another agency cannot use this partnership')
      assert.equal(await P.partnerInventory(agency, p1, sky2), null, 'an unshared project')
      ok(await P.shareProject(dev, devAdmin.id, p1, sky, 'availability'))
      ok(await P.shareProject(dev, devAdmin.id, p1, sky2, 'availability'))
      ok(await P.shareProject(dev, devAdmin.id, p1, sky2, null))
      assert.equal(await P.partnerInventory(agency, p1, sky2), null, 'revoked')
      assert.ok(await audits(dev, 'partner.project_unshared') >= 1 && await audits(agency, 'partner.project_visibility_changed') >= 2)
    })

    // ── Registration ────────────────────────────────────────────────────────────────────────
    const agLead = await lead(agency, 'Priya Sharma', '98450 11111')
    const otherAgencyLead = await lead(agency2, 'Priya S (other agency)', '+91 9845011111')
    const devLeadOrg2Lead = await lead(dev, 'Developer own buyer', '9845022222')
    const subm = (over = {}) => P.submitRegistration({ agencyOrgId: agency, actorProfileId: agMgr.id, partnershipId: p1, projectId: sky, agencyLeadId: agLead, note: 'Wants 3BHK', consent: true, ...over })
    ok(await P.shareProject(dev, devAdmin.id, p3, sky, 'availability'))

    await test('registration: admins/managers only, consent required, the agency’s own lead, a shared project of an active partnership', async () => {
      refused(await subm({ actorProfileId: agAgent.id }), 403)
      refused(await subm({ consent: false }), 409, /authorised to share/i)
      refused(await subm({ agencyLeadId: otherAgencyLead }), 404, /lead not found/i)
      refused(await subm({ agencyLeadId: devLeadOrg2Lead }), 404, /lead not found/, 'a developer lead id is not accepted')
      refused(await subm({ projectId: sky2 }), 404, /not shared/i)
      refused(await subm({ projectId: lake }), 404, /not shared/i)
      refused(await subm({ partnershipId: p3 }), 404, /partnership not found/, 'another agency’s partnership')
      assert.equal(Number((await one(`SELECT count(*) n FROM public.deal_registrations WHERE agency_org_id=$1`, [agency])).n), 0)
    })

    let reg1
    await test('submit: recorded with submitter, consent and version; no developer lead yet; repeat returns the same registration', async () => {
      const r = ok(await subm())
      assert.equal(r.outcome, 'submitted'); reg1 = r.registration_id
      const row = await one(`SELECT * FROM public.deal_registrations WHERE id=$1`, [reg1])
      assert.deepEqual([row.submitted_by, row.consent_confirmed, row.consent_version, row.buyer_phone_e164, row.developer_lead_id], [agMgr.id, true, 'cp-share-v1', '+919845011111', null])
      assert.equal(Number((await one(`SELECT count(*) n FROM public.leads WHERE org_id=$1 AND phone_e164='+919845011111'`, [dev])).n), 0)
      const again = ok(await subm())
      assert.deepEqual([again.outcome, again.registration_id], ['already_submitted', reg1])
      assert.equal(await audits(dev, 'partner.registration_submitted'), 1)
      assert.equal(await audits(agency, 'partner.registration_submitted'), 1)
      const meta = (await one(`SELECT metadata FROM public.org_audit_logs WHERE org_id=$1 AND action='partner.registration_submitted'`, [dev])).metadata
      assert.ok(!JSON.stringify(meta).includes('9845011111') && !JSON.stringify(meta).includes('Priya'), 'no buyer details in audit payloads')
    })

    await test('conflict with another agency’s pending claim: generic answer, no identity, recorded in both logs without names', async () => {
      const r = ok(await P.submitRegistration({ agencyOrgId: agency2, actorProfileId: ag2Admin.id, partnershipId: p3, projectId: sky, agencyLeadId: otherAgencyLead, note: null, consent: true }))
      assert.deepEqual([r.outcome, r.status, r.protected_until], ['conflict', 'conflicted', null])
      assert.deepEqual(Object.keys(r).sort(), ['outcome', 'protected_until', 'registration_id', 'status'], 'nothing else is returned')
      const ag2View = await P.listRegistrationsForAgency(agency2)
      assert.equal(ag2View.length, 1)
      assert.ok(!JSON.stringify(ag2View).includes(agency) && !JSON.stringify(ag2View).includes('Brokers'), 'the other agency is never named')
      const meta = (await one(`SELECT metadata FROM public.org_audit_logs WHERE org_id=$1 AND action='partner.registration_conflict'`, [agency2])).metadata
      assert.ok(!JSON.stringify(meta).includes(agency) && !JSON.stringify(meta).includes(reg1), 'the conflicting claim is not referenced')
      assert.equal(await audits(dev, 'partner.registration_conflict'), 1)
    })

    await test('conflict with the developer’s own open lead; a lost lead does not block; scope is the whole developer, not the project', async () => {
      const agLead2 = await lead(agency, 'Owned by developer', '9845022222')
      const r = ok(await subm({ agencyLeadId: agLead2, projectId: sky }))
      assert.equal(r.outcome, 'conflict')
      await db.query(`UPDATE public.leads SET status='lost' WHERE id=$1`, [devLeadOrg2Lead])
      ok(await P.shareProject(dev, devAdmin.id, p1, sky2, 'availability'))
      const r2 = ok(await subm({ agencyLeadId: agLead2, projectId: sky2 }))
      assert.equal(r2.outcome, 'submitted', 'a lost developer lead no longer blocks')
      const agLead3 = await lead(agency, 'Same buyer, other project', '9845022222')
      assert.equal(ok(await subm({ agencyLeadId: agLead3, projectId: sky })).outcome, 'already_submitted', 'one claim per buyer per developer')
      // The same buyer can be registered with a different developer.
      ok(await P.shareProject(dev2, dev2Admin.id, p2, lake, 'availability'))
      assert.equal(ok(await P.submitRegistration({ agencyOrgId: agency, actorProfileId: agAdmin.id, partnershipId: p2, projectId: lake, agencyLeadId: agLead, note: null, consent: true })).outcome, 'submitted')
    })

    await test('concurrency: 8 simultaneous claims on one buyer by two agencies → exactly one live claim', async () => {
      const a1 = await lead(agency, 'Race buyer', '9845033333'), a2 = await lead(agency2, 'Race buyer', '09845033333')
      const calls = Array.from({ length: 8 }, (_, i) => P.submitRegistration(i % 2
        ? { agencyOrgId: agency2, actorProfileId: ag2Admin.id, partnershipId: p3, projectId: sky, agencyLeadId: a2, note: null, consent: true }
        : { agencyOrgId: agency, actorProfileId: agMgr.id, partnershipId: p1, projectId: sky, agencyLeadId: a1, note: null, consent: true }))
      const outcomes = (await Promise.all(calls)).map((r) => ok(r).outcome)
      assert.equal(outcomes.filter((o) => o === 'submitted').length, 1, outcomes.join(','))
      assert.equal(Number((await one(`SELECT count(*) n FROM public.deal_registrations WHERE developer_org_id=$1 AND buyer_phone_e164='+919845033333' AND status IN ('submitted','accepted')`, [dev])).n), 1)
    })

    // ── Review ──────────────────────────────────────────────────────────────────────────────
    await test('review: developer owners/admins/managers only; not another developer; a reason is needed to reject', async () => {
      refused(await P.reviewRegistration(dev, devExec.id, reg1, true, null), 403)
      refused(await P.reviewRegistration(dev2, dev2Admin.id, reg1, true, null), 404)
      refused(await P.reviewRegistration(agency, agAdmin.id, reg1, true, null), 404)
      const rid = (await one(`SELECT id FROM public.deal_registrations WHERE developer_org_id=$1 AND buyer_phone_e164='+919845022222' AND status='submitted'`, [dev])).id
      refused(await P.reviewRegistration(dev, devMgr.id, rid, false, '  '), 409, /reason/i)
      assert.equal(ok(await P.reviewRegistration(dev, devMgr.id, rid, false, 'Already in talks directly')).status, 'rejected')
      assert.equal(ok(await P.reviewRegistration(dev, devMgr.id, rid, false, 'again')).status, 'rejected', 'repeat is harmless')
    })

    await test('accept: one developer lead (separate record), protection from acceptance for 60 calendar days; repeat makes no duplicate', async () => {
      const before = Date.now()
      const r = ok(await P.reviewRegistration(dev, devMgr.id, reg1, true, null))
      const again = ok(await P.reviewRegistration(dev, devAdmin.id, reg1, true, null))
      assert.equal(again.developer_lead_id, r.developer_lead_id)
      const devLead = await one(`SELECT org_id, name, source, source_platform, project_id FROM public.leads WHERE id=$1`, [r.developer_lead_id])
      assert.deepEqual([devLead.org_id, devLead.source, devLead.source_platform, devLead.project_id], [dev, 'referral', 'channel_partner', sky])
      assert.equal((await one(`SELECT org_id FROM public.leads WHERE id=$1`, [agLead])).org_id, agency, 'the agency still owns its lead')
      const row = await one(`SELECT reviewed_at, protected_until, protection_days FROM public.deal_registrations WHERE id=$1`, [reg1])
      assert.equal(row.protection_days, 60)
      assert.equal(row.protected_until.getTime() - row.reviewed_at.getTime(), 60 * 86_400_000)
      assert.ok(row.reviewed_at.getTime() >= before - 2000, 'starts at acceptance, not submission')
      assert.equal(Number((await one(`SELECT count(*) n FROM public.leads WHERE org_id=$1 AND phone_e164='+919845011111'`, [dev])).n), 1)
      assert.equal(await audits(dev, 'partner.developer_lead_created'), 1)
      assert.equal(await audits(agency, 'partner.developer_lead_created'), 0, 'the developer’s record is not named to the agency')
      assert.equal(await audits(agency, 'partner.registration_accepted'), 1)
    })

    await test('what each side can read: no lead ids across, no developer notes; agency sees status and protection only', async () => {
      const devView = await P.listRegistrationsForDeveloper(dev)
      assert.ok(devView.every((r) => !('agencyLeadId' in r)))
      assert.ok(!JSON.stringify(devView).includes(agLead), 'the agency’s lead id never reaches the developer')
      const agView = await P.listRegistrationsForAgency(agency)
      const accepted = agView.find((r) => r.id === reg1)
      assert.equal(accepted.status, 'accepted'); assert.ok(accepted.protectedUntil)
      assert.ok(!JSON.stringify(agView).includes((await one(`SELECT developer_lead_id d FROM public.deal_registrations WHERE id=$1`, [reg1])).d))
      // A signed-in agency admin cannot read the partner tables or the developer's lead directly.
      const c = createClient(SUPABASE_URL, ANON_KEY, clientOpts)
      await c.auth.signInWithPassword({ email: agAdmin.email, password: PASSWORD })
      for (const t of ['org_partnerships', 'partnership_projects', 'deal_registrations', 'partner_events']) {
        const { data, error } = await c.from(t).select('*').limit(5)
        assert.ok(error || (data ?? []).length === 0, `${t} is not readable from a browser`)
      }
      const leadsSeen = (await c.from('leads').select('id').eq('org_id', dev)).data ?? []
      assert.equal(leadsSeen.length, 0, 'developer leads are not readable by the agency')
      const rpc = await c.rpc('partner_submit_registration', { p_agency: agency, p_actor: agAdmin.id, p_partnership: p1, p_project: sky, p_agency_lead: agLead, p_note: null, p_consent: true, p_consent_version: 'x' })
      assert.ok(rpc.error, 'browsers cannot call the partner functions')
    })

    await test('conflict after acceptance shows only the protection end date; after expiry the buyer is free (developer lead aside)', async () => {
      const a = await lead(agency2, 'Priya again', '9845011111')
      const r = ok(await P.submitRegistration({ agencyOrgId: agency2, actorProfileId: ag2Admin.id, partnershipId: p3, projectId: sky, agencyLeadId: a, note: null, consent: true }))
      assert.equal(r.outcome, 'conflict'); assert.ok(r.protected_until, 'the date of the accepted protection')
      // Expire the protection and close the developer's lead: a new claim is then possible.
      await db.query(`UPDATE public.deal_registrations SET protected_until = now() - interval '1 minute' WHERE id=$1`, [reg1])
      await db.query(`UPDATE public.leads SET status='lost' WHERE org_id=$1 AND phone_e164='+919845011111'`, [dev])
      const r2 = ok(await P.submitRegistration({ agencyOrgId: agency2, actorProfileId: ag2Admin.id, partnershipId: p3, projectId: sky, agencyLeadId: a, note: null, consent: true }))
      assert.equal(r2.outcome, 'submitted')
      assert.equal((await one(`SELECT status FROM public.deal_registrations WHERE id=$1`, [reg1])).status, 'expired')
    })

    await test('accepting when the developer already has an open lead for the buyer is refused (no second record)', async () => {
      const rid = (await one(`SELECT id FROM public.deal_registrations WHERE agency_org_id=$1 AND buyer_phone_e164='+919845011111' AND status='submitted'`, [agency2])).id
      await lead(dev, 'Walk-in Priya', '9845011111')
      refused(await P.reviewRegistration(dev, devAdmin.id, rid, true, null), 409, /already have an open lead/i)
      assert.equal((await one(`SELECT status FROM public.deal_registrations WHERE id=$1`, [rid])).status, 'submitted', 'nothing changed')
    })

    // ── Pause / end ─────────────────────────────────────────────────────────────────────────
    await test('pause: no new registrations, review continues; only the pausing side resumes', async () => {
      const a = await lead(agency, 'Pause buyer', '9845044444')
      const r = ok(await subm({ agencyLeadId: a }))
      assert.equal(ok(await P.setPartnershipStatus(agency, agAdmin.id, p1, 'pause')), 'paused')
      refused(await subm({ agencyLeadId: await lead(agency, 'Another', '9845055555') }), 409, /not active/i)
      assert.equal(await P.partnerInventory(agency, p1, sky), null, 'shared inventory is not readable while paused')
      assert.equal(ok(await P.reviewRegistration(dev, devAdmin.id, r.registration_id, false, 'Not now')).status, 'rejected', 'the developer can still review')
      refused(await P.setPartnershipStatus(dev, devAdmin.id, p1, 'resume'), 409)
      assert.equal(ok(await P.setPartnershipStatus(agency, agAdmin.id, p1, 'resume')), 'active')
    })

    await test('end: pending registrations withdrawn, accepted protections kept, sharing stops, a new request is needed', async () => {
      const a = await lead(agency, 'Pending at end', '9845066666')
      const pending = ok(await subm({ agencyLeadId: a })).registration_id
      const b = await lead(agency, 'Accepted at end', '9845077777')
      const acc = ok(await subm({ agencyLeadId: b })).registration_id
      ok(await P.reviewRegistration(dev, devAdmin.id, acc, true, null))
      assert.equal(ok(await P.setPartnershipStatus(dev, devAdmin.id, p1, 'end')), 'ended')
      assert.equal((await one(`SELECT status FROM public.deal_registrations WHERE id=$1`, [pending])).status, 'withdrawn')
      assert.equal((await one(`SELECT status FROM public.deal_registrations WHERE id=$1`, [acc])).status, 'accepted')
      assert.equal((await P.listPartnerships(agency)).find((x) => x.id === p1).projects.length, 0, 'the agency no longer sees shared projects')
      refused(await P.setPartnershipStatus(agency, agAdmin.id, p1, 'resume'), 409)
      refused(await P.reviewRegistration(dev, devAdmin.id, pending, true, null), 409)
      assert.ok(await audits(agency, 'partner.registrations_withdrawn') >= 1 && await audits(dev, 'partner.ended') === 1)
      ok(await P.requestPartnership(dev, devAdmin.id, code), 'a fresh request is possible after an end')
    })

    await test('history and audit: append-only, and a failed action leaves no audit entry in either organisation', async () => {
      await assert.rejects(db.query(`UPDATE public.partner_events SET event='x' WHERE partnership_id=$1`, [p1]), /append-only/)
      await assert.rejects(db.query(`DELETE FROM public.partner_events WHERE partnership_id=$1`, [p1]), /append-only/)
      const n = (o) => one(`SELECT count(*) n FROM public.org_audit_logs WHERE org_id=$1 AND action LIKE 'partner.%'`, [o]).then((r) => Number(r.n))
      const [d0, a0] = [await n(dev), await n(agency2)]
      // Force a failure at the LAST step — the second organisation's audit entry — after the registration row,
      // the shared event and the acting organisation's audit entry have been written. Everything must roll back.
      await db.query(`CREATE OR REPLACE FUNCTION pg_temp.p19_fail() RETURNS trigger LANGUAGE plpgsql AS $f$
        BEGIN IF NEW.org_id = '${dev}' AND NEW.actor_label LIKE 'Partner:%' THEN RAISE EXCEPTION 'p19 injected failure'; END IF; RETURN NEW; END $f$`)
      await db.query(`CREATE TRIGGER p19_fail BEFORE INSERT ON public.org_audit_logs FOR EACH ROW EXECUTE FUNCTION pg_temp.p19_fail()`)
      const regs0 = Number((await one(`SELECT count(*) n FROM public.deal_registrations WHERE agency_org_id=$1`, [agency2])).n)
      const ev0 = Number((await one(`SELECT count(*) n FROM public.partner_events WHERE partnership_id=$1`, [p3])).n)
      try {
        refused(await P.submitRegistration({ agencyOrgId: agency2, actorProfileId: ag2Admin.id, partnershipId: p3, projectId: sky, agencyLeadId: await lead(agency2, 'Rollback buyer', '9845088888'), note: null, consent: true }), 500)
      } finally {
        await db.query('DROP TRIGGER p19_fail ON public.org_audit_logs')
      }
      assert.equal(Number((await one(`SELECT count(*) n FROM public.deal_registrations WHERE agency_org_id=$1`, [agency2])).n), regs0, 'no registration row')
      assert.equal(Number((await one(`SELECT count(*) n FROM public.partner_events WHERE partnership_id=$1`, [p3])).n), ev0, 'no shared event')
      assert.deepEqual([await n(dev), await n(agency2)], [d0, a0], 'all or nothing')
    })

    console.log(`\nP19 partner network: ${passed} checks passed.`)
  } finally {
    for (const id of orgIds) {
      await db.query('DELETE FROM public.org_partnerships WHERE developer_org_id=$1 OR agency_org_id=$1', [id]).catch((e) => console.error('cleanup', e.message))
    }
    for (const id of orgIds) {
      await db.query('DELETE FROM public.leads WHERE org_id=$1', [id]).catch((e) => console.error('cleanup', e.message))
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
