// tests/db-integration/p23-internal-portal.test.mjs — REGrow's internal experiences against the local Supabase stack
// (migration 20260061, lib/platform/portal.ts): Internal Sales (own vs all prospects, assignment rules, website
// requests imported once), Internal Support (cases, internal notes hidden from customers, cross-organisation
// isolation), staff accounts (Platform Owner only, never yourself, always one owner), audit, and no client access.
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
const PASSWORD = 'Portal-Test-' + crypto.randomBytes(8).toString('hex')
let passed = 0
async function test(name, fn) { try { await fn(); passed++; console.log(`  ✓ ${name}`) } catch (e) { console.error(`  ✗ ${name}`); throw e } }
class UnusedRealtimeTransport { constructor() { throw new Error('Realtime is not used by these tests') } }
const clientOpts = { auth: { persistSession: false, autoRefreshToken: false }, ...(globalThis.WebSocket ? {} : { realtime: { transport: UnusedRealtimeTransport } }) }

async function main() {
  if (!globalThis.WebSocket) globalThis.WebSocket = class UnusedRealtimeTransport {}
  const jiti = createJiti(import.meta.url, { alias: { '@': root } })
  const P = await jiti.import(path.join(root, 'lib/platform/portal.ts'))
  const db = createClient(SUPABASE_URL, SERVICE_KEY, clientOpts)
  const pg = await import('pg')
  const sql = new (pg.default || pg).Client({ connectionString: DATABASE_URL })
  await sql.connect()
  const one = async (s, p) => (await sql.query(s, p)).rows[0]
  const count = async (s, p) => Number((await one(s, p)).n)

  const mkUser = async (label) => {
    const { data, error } = await db.auth.admin.createUser({ email: `${label}-${RUN}@regrow.test`, password: PASSWORD, email_confirm: true, user_metadata: { full_name: label } })
    if (error) throw error
    return { id: data.user.id, email: data.user.email, profile: (await one('SELECT id FROM public.profiles WHERE auth_user_id=$1', [data.user.id])).id }
  }
  const staff = async (label, role) => { const u = await mkUser(label); await sql.query('INSERT INTO public.platform_users (user_id, role) VALUES ($1,$2)', [u.id, role]); return { ...u, actor: { userId: u.id, role, label } } }
  const mkOrg = async (name) => (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,'developer') RETURNING id`, [name, `${name.toLowerCase()}-${RUN}`])).id

  console.log('P23 — INTERNAL PORTAL')
  const owner = await staff('owner', 'super_admin')
  const manager = await staff('manager', 'sales_manager')
  const repA = await staff('rep-a', 'sales_rep'), repB = await staff('rep-b', 'sales_rep')
  const agent = await staff('agent', 'support_agent')
  const finance = await staff('finance', 'finance_admin')
  const auditor = await staff('auditor', 'auditor')

  await test('no client access: signed-in users cannot read prospects, cases or messages directly', async () => {
    const c = createClient(SUPABASE_URL, ANON_KEY, clientOpts)
    await c.auth.signInWithPassword({ email: repA.email, password: PASSWORD })
    for (const t of ['internal_prospects', 'internal_prospect_activities', 'support_cases', 'support_case_messages']) {
      const r = await c.from(t).select('id').limit(1)
      assert.ok(r.error || (r.data ?? []).length === 0, t)
    }
  })

  let pA, pB, pU
  await test('sales: executives see their own and unassigned prospects only; managers see all', async () => {
    pA = (await P.createProspect(db, repA.actor, { companyName: `Alpha Builders ${RUN}`, orgType: 'developer', source: 'outbound' })).data.id
    pB = (await P.createProspect(db, repB.actor, { companyName: `Beta Realty ${RUN}`, orgType: 'channel_partner', source: 'referral' })).data.id
    pU = (await P.createProspect(db, manager.actor, { companyName: `Gamma Homes ${RUN}`, orgType: 'developer', source: 'event' })).data.id
    assert.equal((await one('SELECT owner_user_id FROM public.internal_prospects WHERE id=$1', [pA])).owner_user_id, repA.id, 'an executive owns what they add')
    assert.equal((await one('SELECT owner_user_id FROM public.internal_prospects WHERE id=$1', [pU])).owner_user_id, null, 'a manager’s new prospect is unassigned')
    const seenA = (await P.listProspects(db, repA.actor)).data.map((p) => p.id)
    assert.ok(seenA.includes(pA) && seenA.includes(pU) && !seenA.includes(pB))
    assert.equal((await P.getProspect(db, repA.actor, pB)).status, 404, 'another executive’s prospect: as if absent')
    const seenM = (await P.listProspects(db, manager.actor)).data.map((p) => p.id)
    assert.ok([pA, pB, pU].every((id) => seenM.includes(id)))
    assert.equal((await P.listProspects(db, agent.actor)).status, 403, 'support cannot see sales')
    assert.equal((await P.listProspects(db, finance.actor)).status, 403, 'finance cannot see sales')
    assert.ok((await P.listProspects(db, auditor.actor)).data.length >= 3, 'auditor reads')
    assert.equal((await P.createProspect(db, auditor.actor, { companyName: 'X Co', orgType: 'developer', source: 'other' })).status, 403, 'auditor never writes')
  })

  await test('sales: assignment and stage rules; every change recorded', async () => {
    assert.equal((await P.updateProspect(db, repA.actor, pU, { ownerUserId: repB.id })).status, 403, 'an executive cannot hand a prospect to someone else')
    assert.equal((await P.updateProspect(db, repA.actor, pU, { ownerUserId: repA.id })).success, true, 'but can take an unassigned one')
    assert.equal((await P.updateProspect(db, repB.actor, pU, { stage: 'contacted' })).status, 404, 'now hidden from the other executive')
    assert.equal((await P.updateProspect(db, manager.actor, pA, { ownerUserId: agent.id })).status, 400, 'only to sales staff')
    assert.equal((await P.updateProspect(db, manager.actor, pA, { ownerUserId: repB.id })).success, true)
    assert.equal((await P.updateProspect(db, repB.actor, pA, { stage: 'lost' })).status, 400, 'lost needs a reason')
    assert.equal((await P.updateProspect(db, repB.actor, pA, { stage: 'demo_scheduled', nextFollowUpAt: new Date(Date.now() + 86_400_000).toISOString() })).success, true)
    assert.equal((await P.addProspectActivity(db, repB.actor, pA, 'call', 'Spoke to the sales head; demo on Friday')).success, true)
    assert.equal((await P.addProspectActivity(db, repA.actor, pA, 'note', 'not mine any more')).status, 404)
    const kinds = (await sql.query('SELECT kind FROM public.internal_prospect_activities WHERE prospect_id=$1 ORDER BY created_at', [pA])).rows.map((r) => r.kind)
    assert.deepEqual(kinds, ['assignment', 'stage_change', 'call'])
    assert.ok(await count(`SELECT count(*) n FROM public.platform_audit_logs WHERE target_entity_id=$1 AND action LIKE 'sales.%'`, [pA]) >= 3)
  })

  await test('sales: website demo requests (REGrow’s own form connection) import once; only managers or the owner', async () => {
    const infyn = await mkOrg('Infyn')
    const conn = (await one(`INSERT INTO public.integration_connections (org_id, provider, name, status) VALUES ($1,'website_webhook','Website demo form','connected') RETURNING id`, [infyn])).id
    for (const [name, company] of [['Ravi', `Company: Lotus Estates ${RUN} (Developer / builder)\nSales team size: 12\nRequest: A migration assessment`], ['Meera', `Company: Prime Brokers ${RUN} (Channel-partner agency)\nSales team size: 4`]]) {
      await sql.query(`INSERT INTO public.leads (org_id, name, phone, source, connection_id, notes, status) VALUES ($1,$2,$3,'website',$4,$5,'new')`, [infyn, name, `+9190000${Math.floor(Math.random() * 90000 + 10000)}`, conn, company])
    }
    assert.equal((await P.importWebsiteRequests(db, repA.actor, conn)).status, 403)
    assert.equal((await P.importWebsiteRequests(db, manager.actor, conn)).data.imported, 2)
    assert.equal((await P.importWebsiteRequests(db, manager.actor, conn)).data.imported, 0, 'never twice')
    const lotus = await one('SELECT * FROM public.internal_prospects WHERE company_name=$1', [`Lotus Estates ${RUN}`])
    assert.deepEqual([lotus.org_type, lotus.team_size, lotus.source], ['developer', 12, 'website'])
    assert.equal((await one('SELECT org_type FROM public.internal_prospects WHERE company_name=$1', [`Prime Brokers ${RUN}`])).org_type, 'channel_partner')
  })

  let orgX, orgY, caseX
  await test('support: customers open cases; staff reply; internal notes never reach the customer', async () => {
    orgX = await mkOrg('Customerx'); orgY = await mkOrg('Customery')
    const custOwner = await mkUser('cust-owner'), custExec = await mkUser('cust-exec'), stranger = await mkUser('stranger')
    await sql.query(`INSERT INTO public.org_members (org_id, profile_id, role) VALUES ($1,$2,'owner'), ($1,$3,'sales_exec'), ($4,$5,'owner')`, [orgX, custOwner.profile, custExec.profile, orgY, stranger.profile])
    const execM = { profileId: custExec.profile, userId: custExec.id, role: 'sales_exec', label: 'Exec' }
    const ownerM = { profileId: custOwner.profile, userId: custOwner.id, role: 'owner', label: 'Owner' }
    caseX = (await P.openCase(db, orgX, execM, { subject: 'Leads not arriving from the website', category: 'problem', body: 'Since yesterday no website leads.', priority: 'urgent' })).data.id
    const ownCase = (await P.openCase(db, orgX, ownerM, { subject: 'Invoice question', category: 'billing', body: 'Please explain the GST line.' })).data.id
    assert.equal((await P.staffReply(db, { ...agent.actor }, caseX, 'Checked the form: the domain changed. Internal: customer moved site.', true)).success, true)
    assert.equal((await P.staffReply(db, { ...agent.actor }, caseX, 'Your website form needs the new snippet; steps below.', false)).success, true)
    const seen = await P.getOrgCase(db, orgX, { profileId: custExec.profile, role: 'sales_exec' }, caseX)
    assert.deepEqual(seen.messages.map((m) => m.author_kind), ['customer', 'staff'], 'the internal note is not returned')
    assert.ok(!JSON.stringify(seen).includes('Internal: customer moved site'))
    assert.equal((await one('SELECT status FROM public.support_cases WHERE id=$1', [caseX])).status, 'waiting_on_customer')
    // Visibility: a sales executive sees only their own cases; the owner sees all; another organisation sees none.
    assert.deepEqual((await P.listOrgCases(db, orgX, { profileId: custExec.profile, role: 'sales_exec' })).map((c) => c.id), [caseX])
    assert.equal((await P.listOrgCases(db, orgX, { profileId: custOwner.profile, role: 'owner' })).length, 2)
    assert.equal(await P.getOrgCase(db, orgX, { profileId: custExec.profile, role: 'sales_exec' }, ownCase), null)
    assert.equal(await P.getOrgCase(db, orgY, { profileId: stranger.profile, role: 'owner' }, caseX), null, 'another organisation cannot read it')
    assert.equal((await P.customerReply(db, orgY, { profileId: stranger.profile, userId: stranger.id, role: 'owner', label: 'S' }, caseX, 'hi')).status, 404)
    assert.equal((await P.customerReply(db, orgX, { ...execM }, caseX, 'Updated the snippet, works now. Thanks!')).success, true)
    assert.equal((await one('SELECT status FROM public.support_cases WHERE id=$1', [caseX])).status, 'open', 'a customer reply reopens it')
    assert.ok(await one(`SELECT 1 FROM public.org_audit_logs WHERE org_id=$1 AND action='support.case_opened'`, [orgX]))
  })

  await test('support: staff permissions; sales and finance have no access; assignment only to support staff', async () => {
    assert.equal((await P.listCases(db, repA.actor)).status, 403)
    assert.equal((await P.getCaseForStaff(db, finance.actor, caseX)).status, 403)
    assert.equal((await P.staffReply(db, { ...auditor.actor }, caseX, 'x', false)).status, 403, 'auditor reads only')
    const staffView = await P.getCaseForStaff(db, auditor.actor, caseX)
    assert.equal(staffView.data.messages.filter((m) => m.internal).length, 1, 'staff see internal notes')
    assert.equal((await P.updateCase(db, agent.actor, caseX, { assigneeUserId: repA.id })).status, 400)
    assert.equal((await P.updateCase(db, agent.actor, caseX, { assigneeUserId: agent.id, status: 'resolved' })).success, true)
    assert.ok((await one('SELECT resolved_at FROM public.support_cases WHERE id=$1', [caseX])).resolved_at)
    const queue = (await P.listCases(db, agent.actor, { status: 'active' })).data
    assert.ok(queue.every((c) => ['open', 'in_progress', 'waiting_on_customer'].includes(c.status)))
    assert.ok(await count(`SELECT count(*) n FROM public.platform_audit_logs WHERE target_entity_id=$1 AND action LIKE 'support.%'`, [caseX]) >= 3)
  })

  await test('staff accounts: Platform Owner only; never yourself; always at least one active owner', async () => {
    const newcomer = await mkUser('newcomer')
    assert.equal((await P.addStaff(db, manager.actor, newcomer.email, 'sales_rep')).status, 403)
    // Someone with no account yet: the account is created without a password, and only a one-time link is returned.
    const ORIGIN = 'http://localhost:3000'
    const freshEmail = `fresh-${RUN}@regrow.test`
    assert.equal((await P.addStaff(db, owner.actor, freshEmail, 'sales_rep')).status, 500, 'no app address: nothing is created')
    assert.equal(await count('SELECT count(*) n FROM auth.users WHERE email=$1', [freshEmail]), 0)
    const fresh = await P.addStaff(db, owner.actor, freshEmail, 'sales_rep', ORIGIN)
    assert.equal(fresh.success, true)
    assert.match(fresh.data.setupLink, /^http:\/\/localhost:3000\/auth\/confirm\?token_hash=[^&]+&type=invite&next=%2Freset-password$/)
    const freshRow = await one('SELECT p.role, p.is_active, p.mfa_enforced, u.encrypted_password FROM public.platform_users p JOIN auth.users u ON u.id = p.user_id WHERE u.email=$1', [freshEmail])
    assert.equal(freshRow.role, 'sales_rep'); assert.equal(freshRow.mfa_enforced, true)
    assert.ok(!freshRow.encrypted_password, 'nobody chose a password for them')
    const audited = await one(`SELECT metadata FROM public.platform_audit_logs WHERE action='staff.added' AND metadata->>'email'=$1`, [freshEmail])
    assert.doesNotMatch(JSON.stringify(audited.metadata), /token_hash/, 'the link is never written to the audit log')

    // Existing account that has never signed in: added, with a link; adding again re-issues the link, no duplicate.
    const added = await P.addStaff(db, owner.actor, newcomer.email, 'sales_rep', ORIGIN)
    assert.equal(added.success, true)
    assert.match(added.data.setupLink, /type=recovery/)
    const again = await P.addStaff(db, owner.actor, newcomer.email, 'support_agent', ORIGIN)
    assert.equal(again.success, true); assert.equal(again.data.reissued, true)
    assert.equal(await count('SELECT count(*) n FROM public.platform_users WHERE user_id=$1', [newcomer.id]), 1)
    // Once they have signed in, adding them again is a conflict and no link is issued.
    const anon = createClient(SUPABASE_URL, ANON_KEY, clientOpts)
    assert.ok(!(await anon.auth.signInWithPassword({ email: newcomer.email, password: PASSWORD })).error)
    assert.equal((await P.addStaff(db, owner.actor, newcomer.email, 'support_agent', ORIGIN)).status, 409)
    assert.equal((await P.changeStaff(db, owner.actor, added.data.id, { role: 'support_agent' })).success, true)
    const ownRow = (await one('SELECT id FROM public.platform_users WHERE user_id=$1', [owner.id])).id
    assert.equal((await P.changeStaff(db, owner.actor, ownRow, { active: false })).status, 403, 'not yourself')
    // Another owner exists only if we add one; the last active owner cannot be removed by anyone.
    const second = await mkUser('owner-two')
    const s2 = (await P.addStaff(db, owner.actor, second.email, 'super_admin')).data.id
    await sql.query(`UPDATE public.platform_users SET is_active=false WHERE role='super_admin' AND user_id NOT IN ($1,$2)`, [owner.id, second.id])
    assert.equal((await P.changeStaff(db, { userId: second.id, role: 'super_admin' }, ownRow, { role: 'auditor' })).success, true, 'two owners: one can be changed')
    assert.equal((await P.changeStaff(db, { userId: owner.id, role: 'super_admin' }, s2, { active: false })).status, 409, 'the last active Platform Owner cannot be removed')
    const list = await P.listStaff(db, { userId: second.id, role: 'super_admin' })
    assert.ok(list.data.some((s) => s.email === newcomer.email && s.role === 'support_agent'))
    assert.ok(await count(`SELECT count(*) n FROM public.platform_audit_logs WHERE action LIKE 'staff.%' AND actor_user_id IN ($1,$2)`, [owner.id, second.id]) >= 4)
  })

  await test('dashboard: real figures scoped by role', async () => {
    const f = await P.dashboardFigures(db, repA.actor)
    assert.ok(f.sales && typeof f.sales.open === 'number')
    assert.equal((await P.dashboardFigures(db, finance.actor)).sales, null, 'finance sees no pipeline')
    assert.ok((await P.dashboardFigures(db, owner.actor)).organisations.developer >= 3)
  })

  await sql.end()
  console.log(`\nP23 internal portal: ${passed} checks passed.`)
}

main().catch((e) => { console.error(e); process.exit(1) })
