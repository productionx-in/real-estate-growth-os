// tests/db-integration/p3-support-access.test.mjs
// Phase 3 — support access grants: customer approval, time limits, emergency override, revocation, audit, RLS.
// Real migrations 20260045–46 + real lib/dal/support-access.ts against the local Supabase stack.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const API = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!API || !KEY) { console.error('FATAL: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.'); process.exit(1) }
const RUN = crypto.randomBytes(4).toString('hex')
let passed = 0
async function test(name, fn) { try { await fn(); passed++; console.log(`  ✓ ${name}`) } catch (e) { console.error(`  ✗ ${name}`); throw e } }

async function main() {
  if (!globalThis.WebSocket) globalThis.WebSocket = class UnusedRealtimeTransport {}
  const jiti = createJiti(import.meta.url, { alias: { '@': root } })
  const sa = await jiti.import(path.join(root, 'lib/dal/support-access.ts'))
  const pg = await import('pg')
  const db = new (pg.default || pg).Client({ connectionString: DATABASE_URL })
  await db.connect()
  const one = async (s, p) => (await db.query(s, p)).rows[0]
  const asUser = async (authId, sql, params) => {
    await db.query('BEGIN')
    try {
      await db.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ role: 'authenticated', sub: authId })])
      await db.query('SET LOCAL ROLE authenticated')
      return (await db.query(sql, params)).rows
    } finally { await db.query('ROLLBACK') }
  }
  const mkUser = async (name) => {
    const res = await fetch(`${API}/auth/v1/admin/users`, {
      method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `${name}-${RUN}@repx.test`, password: `Pw-${RUN}-1234567`, email_confirm: true }),
    })
    const body = await res.json()
    assert.ok(res.ok, JSON.stringify(body))
    const profile = await one('SELECT id FROM public.profiles WHERE auth_user_id = $1', [body.id])
    return { authId: body.id, profileId: profile.id }
  }
  const staff = async (name, role) => {
    const u = await mkUser(name)
    await db.query('INSERT INTO public.platform_users (user_id, role) VALUES ($1, $2)', [u.authId, role])
    return u
  }
  const mkOrg = async (tag) => (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,'developer') RETURNING id`, [`P3 ${tag} ${RUN}`, `p3-${tag}-${RUN}`])).id
  const join = (org, u, role, status = 'active') => db.query('INSERT INTO public.org_members (org_id, profile_id, role, status) VALUES ($1,$2,$3,$4)', [org, u.profileId, role, status])
  const grant = (id) => one('SELECT * FROM public.support_access_grants WHERE id=$1', [id])
  const auditActions = async (org) => (await db.query(`SELECT action, actor_kind FROM public.org_audit_logs WHERE org_id=$1 AND action LIKE 'support.%' ORDER BY created_at, id`, [org])).rows
  const REASON = 'Ticket 1234: Meta leads stopped arriving, need to check the connection'

  console.log('P3 — SUPPORT ACCESS GRANTS')
  const orgs = []
  try {
    const org = await mkOrg('main'); orgs.push(org)
    const other = await mkOrg('other'); orgs.push(other)
    const owner = await mkUser('owner'), admin = await mkUser('admin'), rep = await mkUser('rep'), exAdmin = await mkUser('exadmin')
    const otherOwner = await mkUser('otherowner')
    await join(org, owner, 'owner'); await join(org, admin, 'admin'); await join(org, rep, 'sales_exec'); await join(org, exAdmin, 'admin', 'deactivated')
    await join(other, otherOwner, 'owner')
    const agent = await staff('agent', 'support_agent'), agent2 = await staff('agent2', 'support_agent')
    const superAdmin = await staff('super', 'super_admin'), finance = await staff('finance', 'finance_admin'), auditor = await staff('auditor', 'auditor')
    await db.query(`INSERT INTO public.leads (org_id, name, phone, source, status) VALUES ($1,'Asha','9000000001','website','new'),($1,'Ravi','9000000002','website','qualified')`, [org])

    await test('only active support staff can ask; reason and duration are validated', async () => {
      for (const u of [finance, auditor]) {
        const r = await sa.requestSupportAccess({ orgId: org, userId: u.authId, label: 'x', reason: REASON, minutes: 60 })
        assert.deepEqual([r.ok, r.status], [false, 403])
      }
      const cust = await sa.requestSupportAccess({ orgId: org, userId: owner.authId, label: 'x', reason: REASON, minutes: 60 })
      assert.equal(cust.ok, false, 'a customer user is not support staff')
      assert.equal((await sa.requestSupportAccess({ orgId: org, userId: agent.authId, label: 'a', reason: 'too short', minutes: 60 })).ok, false)
      assert.equal((await sa.requestSupportAccess({ orgId: org, userId: agent.authId, label: 'a', reason: REASON, minutes: 5000 })).ok, false)
    })

    let g1
    await test('a request is pending, gives no access, and appears in the customer audit log', async () => {
      const r = await sa.requestSupportAccess({ orgId: org, userId: agent.authId, label: 'Agent (RE support)', reason: REASON, minutes: 60 })
      assert.equal(r.ok, true, r.error)
      g1 = r.data.id
      assert.equal((await grant(g1)).status, 'pending')
      assert.equal(await sa.activeGrantId(org, agent.authId), null)
      const ov = await sa.getSupportOverview(org, { userId: agent.authId, label: 'Agent' })
      assert.deepEqual([ov.ok, ov.status], [false, 403])
      assert.deepEqual(await auditActions(org), [{ action: 'support.access_requested', actor_kind: 'support' }])
    })
    await test('one open request per person per organisation (409)', async () => {
      const r = await sa.requestSupportAccess({ orgId: org, userId: agent.authId, label: 'a', reason: REASON, minutes: 60 })
      assert.deepEqual([r.ok, r.status], [false, 409])
    })
    await test('only an ACTIVE owner or admin of THAT organisation can decide', async () => {
      for (const [u, why] of [[rep, 'sales exec'], [exAdmin, 'deactivated admin'], [otherOwner, 'owner of another org']]) {
        const r = await sa.decideSupportAccess({ grantId: g1, profileId: u.profileId, userId: u.authId, label: 'x', approve: true })
        assert.deepEqual([r.ok, r.status], [false, 403], why)
      }
      assert.equal((await grant(g1)).status, 'pending')
    })
    await test('approval starts a time-limited, read-only grant for that person only', async () => {
      const r = await sa.decideSupportAccess({ grantId: g1, profileId: admin.profileId, userId: admin.authId, label: 'Admin', approve: true })
      assert.equal(r.ok, true, r.error)
      const g = await grant(g1)
      assert.equal(g.status, 'approved')
      const mins = (new Date(g.expires_at) - new Date(g.decided_at)) / 60000
      assert.ok(Math.abs(mins - 60) < 0.1, `expires after 60 minutes (${mins})`)
      assert.equal(await sa.activeGrantId(org, agent.authId), g1)
      assert.equal(await sa.activeGrantId(org, agent2.authId), null, 'not transferable to another agent')
      assert.equal(await sa.activeGrantId(other, agent.authId), null, 'not valid for another organisation')
      assert.equal((await sa.decideSupportAccess({ grantId: g1, profileId: owner.profileId, userId: owner.authId, label: 'O', approve: false })).ok, false, 'decided once')
    })
    await test('the overview shows counts, never contact details, and every view is audited', async () => {
      const ov = await sa.getSupportOverview(org, { userId: agent.authId, label: 'Agent' })
      assert.equal(ov.ok, true, ov.error)
      assert.deepEqual(ov.data.leadsByStatus, { new: 1, qualified: 1 })
      const text = JSON.stringify(ov.data)
      assert.ok(!text.includes('9000000001') && !text.includes('Asha'), 'no lead names or phone numbers')
      assert.equal(ov.data.members.length, 4)
      const views = (await auditActions(org)).filter((a) => a.action === 'support.data_viewed')
      assert.deepEqual(views, [{ action: 'support.data_viewed', actor_kind: 'support' }])
    })
    await test('expiry ends access with no job running', async () => {
      await db.query(`ALTER TABLE public.support_access_grants DISABLE TRIGGER trg_support_grant_guard`)
      await db.query(`UPDATE public.support_access_grants SET expires_at = now() - interval '1 second' WHERE id=$1`, [g1])
      await db.query(`ALTER TABLE public.support_access_grants ENABLE TRIGGER trg_support_grant_guard`)
      assert.equal(await sa.activeGrantId(org, agent.authId), null)
      assert.equal(sa.grantState(await grant(g1)), 'expired')
      assert.equal((await sa.getSupportOverview(org, { userId: agent.authId, label: 'Agent' })).ok, false)
    })
    await test('the customer can end live access at any time; ended grants are final', async () => {
      const r = await sa.requestSupportAccess({ orgId: org, userId: agent.authId, label: 'Agent', reason: REASON, minutes: 120 })
      await sa.decideSupportAccess({ grantId: r.data.id, profileId: owner.profileId, userId: owner.authId, label: 'Owner', approve: true })
      assert.ok(await sa.activeGrantId(org, agent.authId))
      const rep403 = await sa.endSupportAccess({ grantId: r.data.id, side: 'customer', userId: rep.authId, profileId: rep.profileId, label: 'Rep' })
      assert.deepEqual([rep403.ok, rep403.status], [false, 403])
      const end = await sa.endSupportAccess({ grantId: r.data.id, side: 'customer', userId: owner.authId, profileId: owner.profileId, label: 'Owner' })
      assert.deepEqual([end.ok, end.data?.status], [true, 'revoked'])
      assert.equal(await sa.activeGrantId(org, agent.authId), null)
      assert.ok(new Date((await grant(r.data.id)).expires_at) <= new Date())
      await assert.rejects(db.query(`UPDATE public.support_access_grants SET status='approved' WHERE id=$1`, [r.data.id]), /final/)
    })
    await test('a denied request gives no access', async () => {
      const r = await sa.requestSupportAccess({ orgId: org, userId: agent2.authId, label: 'Agent 2', reason: REASON, minutes: 30 })
      await sa.decideSupportAccess({ grantId: r.data.id, profileId: owner.profileId, userId: owner.authId, label: 'Owner', approve: false, note: 'Not now' })
      const g = await grant(r.data.id)
      assert.deepEqual([g.status, g.expires_at, g.decision_note], ['denied', null, 'Not now'])
      assert.equal(await sa.activeGrantId(org, agent2.authId), null)
    })
    await test('platform side: only the requester or a super admin can withdraw', async () => {
      const r = await sa.requestSupportAccess({ orgId: other, userId: agent.authId, label: 'Agent', reason: REASON, minutes: 30 })
      assert.equal((await sa.endSupportAccess({ grantId: r.data.id, side: 'platform', userId: agent2.authId, profileId: null, label: 'A2' })).status, 403)
      const w = await sa.endSupportAccess({ grantId: r.data.id, side: 'platform', userId: agent.authId, profileId: null, label: 'Agent' })
      assert.deepEqual([w.ok, w.data?.status], [true, 'cancelled'])
    })
    await test('emergency access: super admin only, written reason, at most 60 minutes, visible to the customer', async () => {
      const r = await sa.requestSupportAccess({ orgId: other, userId: agent2.authId, label: 'Agent 2', reason: REASON, minutes: 480 })
      const longReason = 'Lead capture down for all Meta forms; customer unreachable by phone'
      assert.equal((await sa.emergencySupportAccess({ grantId: r.data.id, userId: agent.authId, label: 'x', reason: longReason, minutes: 30 })).status, 403)
      assert.equal((await sa.emergencySupportAccess({ grantId: r.data.id, userId: superAdmin.authId, label: 'S', reason: 'urgent', minutes: 30 })).ok, false)
      assert.equal((await sa.emergencySupportAccess({ grantId: r.data.id, userId: superAdmin.authId, label: 'S', reason: longReason, minutes: 120 })).ok, false)
      const ok = await sa.emergencySupportAccess({ grantId: r.data.id, userId: superAdmin.authId, label: 'Super (RE)', reason: longReason, minutes: 30 })
      assert.equal(ok.ok, true, ok.error)
      const g = await grant(r.data.id)
      assert.deepEqual([g.status, g.emergency, g.duration_minutes], ['approved', true, 30])
      assert.equal(await sa.activeGrantId(other, agent2.authId), r.data.id)
      const a = (await auditActions(other)).find((x) => x.action === 'support.emergency_access')
      assert.deepEqual(a, { action: 'support.emergency_access', actor_kind: 'platform' })
      const end = await sa.endSupportAccess({ grantId: r.data.id, side: 'customer', userId: otherOwner.authId, profileId: otherOwner.profileId, label: 'Owner' })
      assert.equal(end.ok, true, 'the customer can revoke emergency access too')
    })
    await test('a support agent removed from staff loses live access immediately', async () => {
      const r = await sa.requestSupportAccess({ orgId: org, userId: agent2.authId, label: 'Agent 2', reason: REASON, minutes: 60 })
      await sa.decideSupportAccess({ grantId: r.data.id, profileId: owner.profileId, userId: owner.authId, label: 'Owner', approve: true })
      assert.ok(await sa.activeGrantId(org, agent2.authId))
      await db.query('UPDATE public.platform_users SET is_active=false WHERE user_id=$1', [agent2.authId])
      assert.equal(await sa.activeGrantId(org, agent2.authId), null)
    })
    await test('RLS: owners/admins read their own organisation’s grants; nobody else; no direct writes', async () => {
      const mine = await asUser(owner.authId, 'SELECT DISTINCT org_id FROM public.support_access_grants')
      assert.deepEqual(mine.map((r) => r.org_id), [org])
      assert.equal((await asUser(rep.authId, 'SELECT count(*)::int n FROM public.support_access_grants'))[0].n, 0)
      assert.equal((await asUser(agent.authId, 'SELECT count(*)::int n FROM public.support_access_grants'))[0].n, 0, 'staff read through the server only')
      await assert.rejects(asUser(owner.authId, `UPDATE public.support_access_grants SET status='approved' WHERE org_id=$1`, [org]), /permission denied/)
      await assert.rejects(asUser(agent.authId, `INSERT INTO public.support_access_grants (org_id, requested_by, requested_by_label, reason, duration_minutes) VALUES ($1,$2,'x',$3,60)`, [org, agent.authId, REASON]), /permission denied/)
    })
    await test('grant functions are not callable by signed-in users or anonymously', async () => {
      for (const fn of ['request_support_access(uuid,uuid,text,text,integer)', 'decide_support_access(uuid,uuid,uuid,text,boolean,text)',
        'emergency_support_access(uuid,uuid,text,text,integer)', 'end_support_access(uuid,text,uuid,uuid,text)', 'active_support_grant(uuid,uuid)',
        'support_audit(uuid,text,uuid,uuid,text,text,uuid,jsonb)']) {
        const r = await one(`SELECT has_function_privilege('authenticated', $1, 'EXECUTE') a, has_function_privilege('anon', $1, 'EXECUTE') b`, [`public.${fn}`])
        assert.deepEqual([r.a, r.b], [false, false], fn)
      }
    })
    await test('grant history cannot be deleted, except with its organisation', async () => {
      await assert.rejects(db.query('DELETE FROM public.support_access_grants WHERE org_id=$1', [org]), /cannot be deleted/)
      const tmp = await mkOrg('tmp')
      await sa.requestSupportAccess({ orgId: tmp, userId: agent.authId, label: 'Agent', reason: REASON, minutes: 15 })
      await db.query('DELETE FROM public.organisations WHERE id=$1', [tmp])
      assert.equal((await one('SELECT count(*)::int n FROM public.support_access_grants WHERE org_id=$1', [tmp])).n, 0)
    })
    await test('auditors can read the platform audit log', async () => {
      await db.query(`INSERT INTO public.platform_audit_logs (actor_user_id, actor_role, action, target_entity_type, target_entity_id) VALUES ($1,'super_admin','test.audit_read','organisation',$2)`, [superAdmin.authId, org])
      const rows = await asUser(auditor.authId, `SELECT count(*)::int n FROM public.platform_audit_logs WHERE action='test.audit_read'`)
      assert.equal(rows[0].n, 1)
      const agentRows = await asUser(agent.authId, `SELECT count(*)::int n FROM public.platform_audit_logs WHERE action='test.audit_read'`)
      assert.equal(agentRows[0].n, 0, 'support agents cannot')
    })

    console.log(`\nP3 support access: ${passed} checks passed.`)
  } finally {
    for (const id of orgs) await db.query('DELETE FROM public.organisations WHERE id=$1', [id]).catch(() => {})
    await db.end()
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
