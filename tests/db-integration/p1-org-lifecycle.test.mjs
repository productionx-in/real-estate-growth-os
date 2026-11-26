// tests/db-integration/p1-org-lifecycle.test.mjs
// Phase 1 — organisation lifecycle, customer audit trail, session revocation and team-management privilege rules.
// Real migration 20260044 + real lib/dal/invitations.ts and lib/dal/org-audit.ts against the local Supabase stack.
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
  const dal = await jiti.import(path.join(root, 'lib/dal/invitations.ts'))
  const audit = await jiti.import(path.join(root, 'lib/dal/org-audit.ts'))
  const pg = await import('pg')
  const db = new (pg.default || pg).Client({ connectionString: DATABASE_URL })
  await db.connect()
  const one = async (s, p) => (await db.query(s, p)).rows[0]
  const rejects = async (s, p, re) => {
    let err = null
    try { await db.query(s, p) } catch (e) { err = e }
    assert.ok(err, `expected failure: ${s}`)
    if (re) assert.match(err.message, re)
  }
  /** Runs `sql` as an authenticated user under RLS, then rolls back. */
  const asUser = async (authId, sql, params) => {
    await db.query('BEGIN')
    try {
      await db.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ role: 'authenticated', sub: authId })])
      await db.query('SET LOCAL ROLE authenticated')
      return (await db.query(sql, params)).rows
    } finally { await db.query('ROLLBACK') }
  }

  const PASSWORD = `Pw-${RUN}-1234567`
  const mkUser = async (name) => {
    const email = `${name}-${RUN}@repx.test`
    const res = await fetch(`${API}/auth/v1/admin/users`, {
      method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: PASSWORD, email_confirm: true }),
    })
    const body = await res.json()
    assert.ok(res.ok, JSON.stringify(body))
    const profile = await one('SELECT id FROM public.profiles WHERE auth_user_id = $1', [body.id])
    return { email, authId: body.id, profileId: profile.id }
  }
  const signIn = async (u) => {
    const res = await fetch(`${API}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: u.email, password: PASSWORD }),
    })
    assert.ok(res.ok, `sign-in failed for ${u.email}: ${await res.text()}`)
  }
  const sessions = async (u) => (await one('SELECT count(*)::int n FROM auth.sessions WHERE user_id = $1', [u.authId])).n
  const mkOrg = async (tag) =>
    (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,'developer') RETURNING id`, [`P1 ${tag} ${RUN}`, `p1-${tag}-${RUN}`])).id
  const join = async (org, u, role, status = 'active') =>
    (await one(`INSERT INTO public.org_members (org_id, profile_id, role, status) VALUES ($1,$2,$3,$4) RETURNING id`, [org, u.profileId, role, status])).id
  const member = (org, u) => one('SELECT id, role, status, lifecycle_saved_role, lifecycle_suspended FROM public.org_members WHERE org_id=$1 AND profile_id=$2', [org, u.profileId])
  const lifecycle = (org, state, reason = 'Test change') =>
    one(`SELECT public.set_organisation_lifecycle($1, $2, $3, NULL, 'platform', 'RE platform team') AS r`, [org, state, reason]).then((x) => x.r)

  console.log('P1 — ORGANISATION LIFECYCLE, AUDIT TRAIL, SESSIONS, TEAM PRIVILEGES')
  const createdOrgs = []
  try {
    const org = await mkOrg('main'); createdOrgs.push(org)
    const other = await mkOrg('other'); createdOrgs.push(other)
    const owner = await mkUser('owner'), admin = await mkUser('admin'), rep = await mkUser('rep'), gone = await mkUser('gone')
    const otherOwner = await mkUser('otherowner')
    await join(org, owner, 'owner'); await join(org, admin, 'admin'); await join(org, rep, 'sales_exec')
    await join(org, gone, 'manager', 'deactivated')
    await join(other, otherOwner, 'owner')

    // ---------------------------------------------------------------- lifecycle
    await test('suspension makes every active member read-only and saves their real role', async () => {
      const r = await lifecycle(org, 'suspended', 'Invoice overdue')
      assert.deepEqual([r.from, r.to, r.members_changed], ['active', 'suspended', 3])
      for (const [u, role] of [[owner, 'owner'], [admin, 'admin'], [rep, 'sales_exec']]) {
        const m = await member(org, u)
        assert.deepEqual([m.role, m.lifecycle_saved_role, m.status], ['readonly', role, 'active'])
      }
      const g = await member(org, gone)
      assert.deepEqual([g.role, g.lifecycle_saved_role, g.status], ['manager', null, 'deactivated'], 'individually deactivated member untouched')
      const o = await one('SELECT lifecycle_state, lifecycle_reason FROM public.organisations WHERE id=$1', [org])
      assert.deepEqual([o.lifecycle_state, o.lifecycle_reason], ['suspended', 'Invoice overdue'])
    })
    await test('while suspended, the server refuses team changes and the database refuses role edits', async () => {
      const r = await dal.changeMemberRole(org, (await member(org, rep)).id, 'manager', owner.profileId)
      assert.equal(r.success, false)
      await rejects(`UPDATE public.org_members SET role='admin' WHERE org_id=$1 AND profile_id=$2`, [org, rep.profileId], /suspended/)
    })
    await test('a suspended workspace accepts no new members through an invitation (403)', async () => {
      const newbie = await mkUser('newbie')
      const token = crypto.randomBytes(32).toString('hex')
      await db.query(`INSERT INTO public.org_invitations (org_id, email, role, invited_by, token_hash) VALUES ($1,$2,'sales_exec',$3,$4)`,
        [org, newbie.email, owner.profileId, dal.hashInvitationToken(token)])
      const r = await dal.acceptEmployeeInvitation(token, newbie.profileId, newbie.authId)
      assert.deepEqual([r.success, r.status], [false, 403])
      assert.equal((await one('SELECT count(*)::int n FROM public.org_members WHERE org_id=$1 AND profile_id=$2', [org, newbie.profileId])).n, 0)
    })
    await test('reactivation restores every saved role exactly', async () => {
      const r = await lifecycle(org, 'active', 'Paid')
      assert.equal(r.to, 'active')
      for (const [u, role] of [[owner, 'owner'], [admin, 'admin'], [rep, 'sales_exec']]) {
        const m = await member(org, u)
        assert.deepEqual([m.role, m.lifecycle_saved_role, m.status], [role, null, 'active'])
      }
      assert.equal((await member(org, gone)).status, 'deactivated')
    })
    await test('deactivation blocks every active membership; reactivation brings back only those it blocked', async () => {
      await lifecycle(org, 'deactivated', 'Contract ended')
      for (const u of [owner, admin, rep]) {
        const m = await member(org, u)
        assert.deepEqual([m.status, m.lifecycle_suspended], ['suspended', true])
      }
      assert.deepEqual(Object.values(await member(org, gone)).slice(2), ['deactivated', null, false])
      await lifecycle(org, 'active', 'Renewed')
      for (const u of [owner, admin, rep]) assert.equal((await member(org, u)).status, 'active')
      assert.equal((await member(org, gone)).status, 'deactivated', 'individually deactivated member stays deactivated')
    })
    await test('suspended → deactivated → suspended → active keeps every role intact', async () => {
      await lifecycle(org, 'suspended', 'step 1'); await lifecycle(org, 'deactivated', 'step 2')
      await lifecycle(org, 'suspended', 'step 3'); await lifecycle(org, 'active', 'step 4')
      const roles = await db.query(`SELECT m.role, m.status, m.lifecycle_saved_role, m.lifecycle_suspended FROM public.org_members m
        WHERE org_id=$1 AND profile_id = ANY($2) ORDER BY m.role::text`, [org, [owner.profileId, admin.profileId, rep.profileId]])
      assert.deepEqual(roles.rows.map((r) => [r.role, r.status, r.lifecycle_saved_role, r.lifecycle_suspended]),
        [['admin', 'active', null, false], ['owner', 'active', null, false], ['sales_exec', 'active', null, false]])
    })
    await test('a reason is mandatory, pending_setup cannot be re-entered, unknown states are refused', async () => {
      await rejects(`SELECT public.set_organisation_lifecycle($1,'suspended','  ',NULL)`, [org], /reason/)
      await rejects(`SELECT public.set_organisation_lifecycle($1,'pending_setup','x y z',NULL)`, [org], /pending_setup/)
      await rejects(`SELECT public.set_organisation_lifecycle($1,'frozen','x y z',NULL)`, [org], /unknown state/)
      const same = await lifecycle(org, 'active', 'no-op')
      assert.equal(same.unchanged, true)
    })
    await test('every change is recorded as a state event and a customer audit entry', async () => {
      const ev = await one('SELECT count(*)::int n FROM public.organisation_state_events WHERE org_id=$1', [org])
      assert.equal(ev.n, 8)
      const a = await one(`SELECT actor_kind, actor_label, metadata FROM public.org_audit_logs
        WHERE org_id=$1 AND action='organisation.lifecycle_changed' ORDER BY created_at, id LIMIT 1`, [org])
      assert.deepEqual([a.actor_kind, a.actor_label, a.metadata.from, a.metadata.to, a.metadata.reason], ['platform', 'RE platform team', 'active', 'suspended', 'Invoice overdue'])
    })
    await test('only the service role can change lifecycle or revoke sessions', async () => {
      for (const fn of ['public.set_organisation_lifecycle(uuid,text,text,uuid,text,text)', 'public.revoke_user_sessions(uuid)']) {
        const r = await one(`SELECT has_function_privilege('authenticated', $1, 'EXECUTE') a, has_function_privilege('anon', $1, 'EXECUTE') b`, [fn])
        assert.deepEqual([r.a, r.b], [false, false], fn)
      }
    })

    // ---------------------------------------------------------------- audit trail
    await test('recordOrgAudit writes an entry, redacts secrets, and refuses malformed actions', async () => {
      const ok = await audit.recordOrgAudit({ orgId: org, action: 'integration.webhook_secret_rotated', actorProfileId: owner.profileId,
        actorUserId: owner.authId, actorLabel: 'Owner', metadata: { provider: 'meta', secret: 'whsec_123', nested: { api_key: 'k' } } })
      assert.equal(ok.success, true, ok.error)
      const row = await one(`SELECT metadata FROM public.org_audit_logs WHERE org_id=$1 AND action='integration.webhook_secret_rotated'`, [org])
      assert.deepEqual(row.metadata, { provider: 'meta', secret: '[REDACTED]', nested: { api_key: '[REDACTED]' } })
      assert.equal((await audit.recordOrgAudit({ orgId: org, action: 'Bad Action' })).success, false)
    })
    await test('audit entries cannot be edited or deleted, even by the service role', async () => {
      await rejects(`UPDATE public.org_audit_logs SET action='lead.exported' WHERE org_id=$1`, [org], /append-only|immutable|not allowed/i)
      await rejects(`DELETE FROM public.org_audit_logs WHERE org_id=$1`, [org], /append-only|immutable|not allowed/i)
      await rejects(`UPDATE public.organisation_state_events SET reason='x' WHERE org_id=$1`, [org], /append-only|immutable|not allowed/i)
    })
    await test('RLS: owners and admins read their own organisation’s audit trail only', async () => {
      await audit.recordOrgAudit({ orgId: other, action: 'lead.exported', actorLabel: 'Other owner' })
      const mine = await asUser(owner.authId, 'SELECT DISTINCT org_id FROM public.org_audit_logs')
      assert.deepEqual(mine.map((r) => r.org_id), [org])
      assert.ok((await asUser(admin.authId, 'SELECT count(*)::int n FROM public.org_audit_logs'))[0].n > 0)
      assert.equal((await asUser(rep.authId, 'SELECT count(*)::int n FROM public.org_audit_logs'))[0].n, 0, 'sales executive sees nothing')
      const theirs = await asUser(otherOwner.authId, 'SELECT DISTINCT org_id FROM public.org_audit_logs')
      assert.deepEqual(theirs.map((r) => r.org_id), [other], 'no cross-tenant read')
      await assert.rejects(asUser(owner.authId, 'SELECT count(*)::int n FROM public.organisation_state_events'), /permission denied/, 'state events are server-only')
    })
    await test('RLS: members cannot write audit entries directly', async () => {
      let err = null
      try {
        await asUser(owner.authId, `INSERT INTO public.org_audit_logs (org_id, actor_kind, action) VALUES ($1,'member','lead.exported')`, [org])
      } catch (e) { err = e }
      assert.ok(err, 'insert must be refused')
    })
    await test('listOrgAudit pages newest-first and filters by area', async () => {
      const all = await audit.listOrgAudit(org)
      assert.ok(all.rows.length >= 9)
      for (let i = 1; i < all.rows.length; i++) assert.ok(all.rows[i - 1].created_at >= all.rows[i].created_at)
      const lifecycleOnly = await audit.listOrgAudit(org, { area: 'organisation' })
      assert.ok(lifecycleOnly.rows.every((r) => r.action.startsWith('organisation.')))
      assert.equal(lifecycleOnly.rows.length, 8)
      assert.ok((await audit.listOrgAudit(other)).rows.every((r) => r.action === 'lead.exported'), 'scoped to the organisation')
    })
    await test('deleting an organisation still removes its audit trail (cascade is allowed)', async () => {
      const tmp = await mkOrg('tmp')
      await lifecycle(tmp, 'suspended', 'temporary')
      await db.query('DELETE FROM public.organisations WHERE id=$1', [tmp])
      assert.equal((await one('SELECT count(*)::int n FROM public.org_audit_logs WHERE org_id=$1', [tmp])).n, 0)
    })

    // ---------------------------------------------------------------- team privileges
    await test('an admin cannot make anyone an owner, or demote an owner', async () => {
      const r1 = await dal.changeMemberRole(org, (await member(org, rep)).id, 'owner', admin.profileId)
      assert.equal(r1.success, false); assert.match(r1.error, /owner/)
      const r2 = await dal.changeMemberRole(org, (await member(org, owner)).id, 'readonly', admin.profileId)
      assert.equal(r2.success, false)
      assert.equal((await member(org, owner)).role, 'owner')
      const r3 = await dal.createEmployeeInvitation(org, admin.profileId, `x-${RUN}@repx.test`, 'owner')
      assert.equal(r3.success, false); assert.match(r3.error, /owner/)
    })
    await test('nobody changes their own role, and the last owner cannot be demoted', async () => {
      const self = await dal.changeMemberRole(org, (await member(org, admin)).id, 'owner', admin.profileId)
      assert.equal(self.success, false)
      const second = await mkUser('owner2'); await join(org, second, 'owner')
      const r = await dal.changeMemberRole(org, (await member(org, second)).id, 'admin', owner.profileId)
      assert.equal(r.success, true, r.error)
      assert.equal(r.previousRole, 'owner')
      const last = await dal.changeMemberRole(org, (await member(org, owner)).id, 'admin', second.profileId)
      assert.equal(last.success, false, 'an admin cannot demote the owner')
    })
    await test('an owner can grant ownership', async () => {
      const r = await dal.changeMemberRole(org, (await member(org, admin)).id, 'owner', owner.profileId)
      assert.equal(r.success, true, r.error)
      await db.query(`UPDATE public.org_members SET role='admin' WHERE org_id=$1 AND profile_id=$2`, [org, admin.profileId])
    })
    await test('a deactivated admin can no longer change roles, revoke invitations or deactivate members', async () => {
      const exAdmin = await mkUser('exadmin'); await join(org, exAdmin, 'admin', 'deactivated')
      assert.equal((await dal.changeMemberRole(org, (await member(org, rep)).id, 'manager', exAdmin.profileId)).success, false)
      const inv = await one(`INSERT INTO public.org_invitations (org_id, email, role, invited_by, token_hash) VALUES ($1,$2,'sales_exec',$3,$4) RETURNING id`,
        [org, `y-${RUN}@repx.test`, owner.profileId, crypto.randomBytes(16).toString('hex')])
      assert.equal((await dal.revokeEmployeeInvitation(org, inv.id, exAdmin.profileId)).success, false)
      const d = await dal.deactivateMember({ orgId: org, memberId: (await member(org, rep)).id, actorProfileId: exAdmin.profileId, reassignmentMode: 'unassigned' })
      assert.equal(d.success, false)
      assert.equal((await member(org, rep)).status, 'active')
    })

    // ---------------------------------------------------------------- sessions
    await test('deactivating someone whose last workspace this was ends their sessions', async () => {
      await signIn(rep); await signIn(rep)
      assert.ok((await sessions(rep)) >= 2)
      const d = await dal.deactivateMember({ orgId: org, memberId: (await member(org, rep)).id, actorProfileId: owner.profileId, reassignmentMode: 'unassigned' })
      assert.equal(d.success, true, d.error)
      assert.equal(d.sessionsRevoked, true)
      assert.equal(await sessions(rep), 0)
      assert.equal((await one('SELECT count(*)::int n FROM auth.refresh_tokens WHERE user_id = $1', [rep.authId])).n, 0)
    })
    await test('someone who still belongs to another workspace keeps their sessions', async () => {
      const both = await mkUser('both'); await join(org, both, 'sales_exec'); await join(other, both, 'sales_exec')
      await signIn(both)
      const d = await dal.deactivateMember({ orgId: org, memberId: (await member(org, both)).id, actorProfileId: owner.profileId, reassignmentMode: 'unassigned' })
      assert.equal(d.success, true, d.error)
      assert.equal(d.sessionsRevoked, false)
      assert.ok((await sessions(both)) >= 1)
    })

    await test('deactivating an organisation signs out only the members with no other workspace', async () => {
      const closing = await mkOrg('closing'); createdOrgs.push(closing)
      const solo = await mkUser('solo'), shared = await mkUser('shared')
      await join(closing, solo, 'owner'); await join(closing, shared, 'sales_exec'); await join(other, shared, 'sales_exec')
      await signIn(solo); await signIn(shared)
      await lifecycle(closing, 'deactivated', 'Contract ended')
      assert.equal(await dal.revokeSessionsForDeactivatedOrg(closing), 1)
      assert.equal(await sessions(solo), 0)
      assert.ok((await sessions(shared)) >= 1)
    })

    // ---------------------------------------------------------------- onboarding requests
    await test('public demo requests are stored without a requesting user; platform ones still need one', async () => {
      const base = [`Acme ${RUN}`, 'developer', `lead-${RUN}@acme.test`, 'Asha', 'developer_legacy_v1', 5]
      const pub = await one(`INSERT INTO public.customer_onboarding_requests (company_name, company_type, admin_email, admin_name, requested_plan_code, requested_seats, source)
        VALUES ($1,$2,$3,$4,$5,$6,'public') RETURNING id, requested_by`, base)
      assert.equal(pub.requested_by, null)
      await rejects(`INSERT INTO public.customer_onboarding_requests (company_name, company_type, admin_email, admin_name, requested_plan_code, requested_seats)
        VALUES ($1,$2,$3,$4,$5,$6)`, base, /source/)
      await db.query('DELETE FROM public.customer_onboarding_requests WHERE id=$1', [pub.id])
    })

    console.log(`\nP1 lifecycle and audit: ${passed} checks passed.`)
  } finally {
    for (const id of createdOrgs) await db.query('DELETE FROM public.organisations WHERE id=$1', [id]).catch(() => {})
    await db.end()
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
