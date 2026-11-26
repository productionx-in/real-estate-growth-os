// tests/db-integration/p30-email-outbox.test.mjs — the e-mail outbox (migration 20260070) with the REAL service
// (lib/email/service.ts via jiti) against a local database and the MOCK provider only. Proves: tenant isolation,
// idempotent enqueue, concurrent workers, duplicate delivery attempts, crash recovery, retries with backoff, permanent
// failure, invalid configuration held (not dropped) with an admin alert, sender changes at delivery time, invitations
// (encrypted link) and backward compatibility with the pre-outbox send log.
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
  // Mock provider only; a valid sender for most checks. Nothing here can reach a real mailbox.
  Object.assign(process.env, { EMAIL_PROVIDER: 'mock', EMAIL_FROM_NAME: 'RE by PX', EMAIL_FROM_ADDRESS: 'first@repx-mail-check.com', NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000' })
  delete process.env.RESEND_API_KEY; delete process.env.EMAIL_REPLY_TO
  const jiti = createJiti(import.meta.url, { alias: { '@': root } })
  const svc = await jiti.import(path.join(root, 'lib/email/service.ts'))
  const { MockEmailAdapter, setEmailAdapterForTesting } = await jiti.import(path.join(root, 'lib/email/adapter.ts'))
  const { createServiceClient } = await jiti.import(path.join(root, 'lib/supabase/server.ts'))
  const db = createServiceClient()
  const mail = new MockEmailAdapter(); setEmailAdapterForTesting(mail)

  const pg = await import('pg')
  const sql = new (pg.default || pg).Client({ connectionString: DATABASE_URL }); await sql.connect()
  const one = async (s, p) => (await sql.query(s, p)).rows[0]
  const row = (key) => one('SELECT * FROM public.email_outbox WHERE idempotency_key=$1', [key])
  const sentTo = (addr) => mail.sentEmails.filter((e) => e.to === addr)
  const mkOrg = async (n) => (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,'developer') RETURNING id`, [`${n} ${RUN}`, `${n.toLowerCase()}-${RUN}`])).id
  const orgA = await mkOrg('OutboxA'); const orgB = await mkOrg('OutboxB')
  const owner = await service_user(db, `owner-${RUN}@repx-mail-check.com`) // inviter + Platform Owner for the alert check
  const ownerProfile = (await one('SELECT id FROM public.profiles WHERE auth_user_id=$1', [owner])).id // invited_by is a profile
  const invite = async (org, email, tokenHash) => (await one(`INSERT INTO public.org_invitations (org_id, email, role, invited_by, token_hash) VALUES ($1,$2,'sales_exec',$3,$4) RETURNING id`, [org, email, ownerProfile, tokenHash])).id
  const q = (key, to, extra = {}) => svc.queueEmail(db, { orgId: orgA, category: 'account', template: 'customer', to, idempotencyKey: key,
    payload: { kind: 'trial_ended', args: { orgName: `OutboxA ${RUN}`, urlPath: '/outbox-a/billing' } }, ...extra })

  console.log('P30 — E-MAIL OUTBOX')

  await test('enqueue is idempotent: the same key twice is one e-mail', async () => {
    const a = await q(`idem-${RUN}`, `idem-${RUN}@acme-mail.in`); const b = await q(`idem-${RUN}`, `idem-${RUN}@acme-mail.in`)
    assert.equal(a, b)
    assert.equal(Number((await one('SELECT count(*) n FROM public.email_outbox WHERE idempotency_key=$1', [`idem-${RUN}`])).n), 1)
    assert.ok((await row(`idem-${RUN}`)).org_id === orgA, 'the organisation is recorded on the row')
  })

  await test('tenant isolation: clients cannot read the outbox or call its functions; a payload pointing at another organisation is refused', async () => {
    const r = await one(`SELECT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.email_outbox'::regclass) rls, has_table_privilege('authenticated','public.email_outbox','SELECT') a, has_table_privilege('anon','public.email_outbox','SELECT') b,
      has_function_privilege('authenticated','public.enqueue_email(uuid,text,text,text,jsonb,text,timestamptz)','EXECUTE') c, has_function_privilege('authenticated','public.claim_emails(integer,text,integer)','EXECUTE') d`)
    assert.deepEqual([r.rls, r.a, r.b, r.c, r.d], [true, false, false, false, false])
    // An invitation row in org A that names org B's invitation must fail permanently, never render.
    const inv = await invite(orgB, `b-${RUN}@acme-mail.in`, crypto.randomBytes(32).toString('hex'))
    const id = await svc.queueEmail(db, { orgId: orgA, category: 'auth', template: 'invitation', to: `x-${RUN}@acme-mail.in`, idempotencyKey: `cross-${RUN}`, payload: { invitationId: inv, orgName: 'B', role: 'admin', inviteUrlEnc: svc.sealForPayload('http://localhost:3000/invite/secret') } })
    const res = await svc.deliverOne(db, id)
    assert.equal(res.outcome, 'failed'); assert.match((await row(`cross-${RUN}`)).last_error, /not found in this organisation/)
    assert.equal(sentTo(`x-${RUN}@acme-mail.in`).length, 0)
  })

  await test('concurrent workers deliver each e-mail exactly once', async () => {
    mail.clear()
    const keys = Array.from({ length: 24 }, (_, i) => `conc-${RUN}-${i}`)
    for (const k of keys) await q(k, `${k}@acme-mail.in`)
    await Promise.all([svc.deliverDue(db, { limit: 5 }), svc.deliverDue(db, { limit: 5 }), svc.deliverDue(db, { limit: 5 })])
    for (const k of keys) { assert.equal(sentTo(`${k}@acme-mail.in`).length, 1, k); assert.equal((await row(k)).status, 'sent') }
  })

  await test('duplicate delivery attempts on one row send once', async () => {
    mail.clear()
    const id = await q(`dup-${RUN}`, `dup-${RUN}@acme-mail.in`)
    const results = await Promise.all([svc.deliverOne(db, id), svc.deliverOne(db, id), svc.deliverOne(db, id)])
    assert.equal(results.filter((r) => r.outcome === 'sent').length, 1)
    assert.equal(sentTo(`dup-${RUN}@acme-mail.in`).length, 1)
    assert.equal((await svc.deliverOne(db, id)).outcome, 'not_claimed', 'a sent e-mail is never taken again')
  })

  await test('crash recovery: an expired claim is taken again; the provider idempotency key prevents a second e-mail', async () => {
    mail.clear()
    const id = await q(`crash-${RUN}`, `crash-${RUN}@acme-mail.in`)
    // Worker 1 claims and "sends", then crashes before recording it.
    const claimed = (await sql.query(`SELECT * FROM public.claim_email($1, 'crashed-worker', 60)`, [id])).rows[0]
    await mail.sendEmail({ to: claimed.recipient, subject: 'x', html: 'x', idempotencyKey: claimed.idempotency_key })
    await sql.query(`UPDATE public.email_outbox SET locked_until = now() - interval '1 second' WHERE id=$1`, [id])
    const res = await svc.deliverOne(db, id)
    assert.equal(res.outcome, 'sent')
    assert.equal(sentTo(`crash-${RUN}@acme-mail.in`).length, 1, 'same idempotency key → no second e-mail')
    assert.equal((await one(`SELECT public.complete_email($1, 'crashed-worker', 'mock', 'late') ok`, [id])).ok, false, 'the crashed worker cannot overwrite the outcome')
  })

  await test('transient failure → retried with backoff; permanent → failed', async () => {
    mail.clear()
    mail.scripted.push({ success: false, errorKind: 'transient', error: 'Provider 503' })
    const t = await q(`trans-${RUN}`, `trans-${RUN}@acme-mail.in`)
    assert.equal((await svc.deliverOne(db, t)).outcome, 'queued')
    const r = await row(`trans-${RUN}`)
    assert.equal(r.attempts, 1); assert.ok(new Date(r.next_attempt_at) - Date.now() > 20_000, 'retry is scheduled ~30 s later')
    await sql.query(`UPDATE public.email_outbox SET next_attempt_at = now() WHERE id=$1`, [t])
    assert.equal((await svc.deliverOne(db, t)).outcome, 'sent')
    mail.scripted.push({ success: false, errorKind: 'permanent', error: 'Invalid recipient ravi@acme-mail.in' })
    const p = await q(`perm-${RUN}`, `perm-${RUN}@acme-mail.in`)
    assert.equal((await svc.deliverOne(db, p)).outcome, 'failed')
    assert.match((await row(`perm-${RUN}`)).last_error, /ra\*\*\*@acme-mail\.in/, 'addresses are masked in stored errors')
  })

  await test('invalid sender: e-mails are HELD (not dropped), Platform Owners are alerted, and they go out once fixed', async () => {
    mail.clear()
    await sql.query(`INSERT INTO public.platform_users (user_id, role) VALUES ($1,'super_admin') ON CONFLICT (user_id) DO UPDATE SET role='super_admin', is_active=true`, [owner])
    process.env.EMAIL_FROM_ADDRESS = 'not-an-address'
    const h = await q(`held-${RUN}`, `held-${RUN}@acme-mail.in`)
    assert.equal((await svc.deliverOne(db, h)).outcome, 'held')
    assert.equal((await row(`held-${RUN}`)).attempts, 0, 'a configuration problem does not use up retries')
    await svc.deliverDue(db)
    assert.equal(mail.sentEmails.length, 0)
    assert.ok((await one(`SELECT count(*) n FROM public.email_outbox WHERE template='staff.email_health' AND recipient=$1`, [`owner-${RUN}@repx-mail-check.com`])).n > 0, 'Platform Owner alert queued')
    const health = await svc.emailHealth(db)
    assert.ok(health.counts.held >= 1); assert.ok(health.config.problems.length > 0)
    assert.ok(!JSON.stringify(health).includes(`held-${RUN}@acme-mail.in`), 'admin view masks recipients')
    process.env.EMAIL_FROM_ADDRESS = 'second@repx-mail-check.com'
    await svc.deliverDue(db)
    assert.equal((await row(`held-${RUN}`)).status, 'sent')
    assert.equal(sentTo(`held-${RUN}@acme-mail.in`)[0].from, 'RE by PX <second@repx-mail-check.com>')
    assert.ok(sentTo(`owner-${RUN}@repx-mail-check.com`).some((e) => /held/.test(e.subject)), 'the alert went out too')
  })

  await test('sender changes apply at delivery: queued before the change, sent with the new sender; nothing in the row changes', async () => {
    mail.clear()
    process.env.EMAIL_FROM_ADDRESS = 'before@repx-mail-check.com'
    const id = await q(`sender-${RUN}`, `sender-${RUN}@acme-mail.in`, { sendAfter: new Date(Date.now() + 60_000) })
    const before = await row(`sender-${RUN}`)
    process.env.EMAIL_FROM_ADDRESS = 'after@repx-mail-check.com'; process.env.EMAIL_FROM_NAME = 'RE by PX Team'; process.env.EMAIL_REPLY_TO = 'help@repx-mail-check.com'
    await sql.query(`UPDATE public.email_outbox SET next_attempt_at = now() WHERE id=$1`, [id])
    await svc.deliverDue(db)
    const sent = sentTo(`sender-${RUN}@acme-mail.in`)[0]
    assert.deepEqual([sent.from, sent.replyTo], ['RE by PX Team <after@repx-mail-check.com>', 'help@repx-mail-check.com'])
    assert.deepEqual(JSON.stringify(before.payload), JSON.stringify((await row(`sender-${RUN}`)).payload), 'no queued data was touched')
    process.env.EMAIL_FROM_NAME = 'RE by PX'; delete process.env.EMAIL_REPLY_TO
  })

  await test('invitations: the link is stored encrypted, delivered intact, and use the sender at delivery time', async () => {
    mail.clear()
    const raw = crypto.randomBytes(32).toString('hex')
    const inv = await invite(orgA, `invitee-${RUN}@acme-mail.in`, crypto.createHash('sha256').update(raw).digest('hex'))
    process.env.EMAIL_FROM_ADDRESS = 'invites@repx-mail-check.com'
    const r = await svc.sendInvitation(db, { orgId: orgA, invitationId: inv, to: `invitee-${RUN}@acme-mail.in`, orgName: 'OutboxA', role: 'Administrator', inviteUrl: `http://localhost:3000/invite/${raw}`, inviterName: 'Asha' })
    assert.equal(r.success, true)
    const stored = await one(`SELECT payload::text p FROM public.email_outbox WHERE template='invitation' AND payload->>'invitationId'=$1`, [inv])
    assert.ok(!stored.p.includes(raw), 'the one-time token is never stored in plain text')
    const m = sentTo(`invitee-${RUN}@acme-mail.in`)[0]
    assert.ok(m.html.includes(`/invite/${raw}`)); assert.equal(m.from, 'RE by PX <invites@repx-mail-check.com>')
    assert.equal((await one('SELECT delivery_status s FROM public.org_invitations WHERE id=$1', [inv])).s, 'delivered')
  })

  await test('migration compatibility: events sent before the outbox are never sent again; legacy RESEND_* settings still work', async () => {
    mail.clear()
    await sql.query(`INSERT INTO public.customer_email_log (org_id, kind, dedupe_key, recipients, status) VALUES ($1,'welcome',$2,1,'sent')`, [orgA, `welcome:${orgA}`])
    const { data } = await db.rpc('enqueue_customer_email', { p_org: orgA, p_kind: 'welcome', p_event_key: `welcome:${orgA}`, p_recipients: [`legacy-${RUN}@acme-mail.in`], p_template: 'customer', p_payload: {} })
    assert.deepEqual(data ?? [], [], 'already-sent event → nothing queued')
    delete process.env.EMAIL_FROM_ADDRESS; delete process.env.EMAIL_FROM_NAME; process.env.RESEND_FROM_EMAIL = 'Legacy Name <legacy@repx-mail-check.com>'
    const id = await q(`legacy-${RUN}`, `legacy-${RUN}@acme-mail.in`)
    assert.equal((await svc.deliverOne(db, id)).outcome, 'sent')
    assert.equal(sentTo(`legacy-${RUN}@acme-mail.in`)[0].from, 'Legacy Name <legacy@repx-mail-check.com>')
    delete process.env.RESEND_FROM_EMAIL; process.env.EMAIL_FROM_ADDRESS = 'first@repx-mail-check.com'; process.env.EMAIL_FROM_NAME = 'RE by PX'
  })

  setEmailAdapterForTesting(null)
  await sql.end()
  console.log(`\nP30 e-mail outbox: ${passed} checks passed.`)
}

async function service_user(db, email) {
  const { data, error } = await db.auth.admin.createUser({ email, password: 'Outbox-Test-' + RUN + 'x9!', email_confirm: true })
  if (error) throw error
  return data.user.id
}
main().catch((e) => { console.error(e); process.exit(1) })
