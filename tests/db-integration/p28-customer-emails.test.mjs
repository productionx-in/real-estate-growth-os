// tests/db-integration/p28-customer-emails.test.mjs — customer account e-mails (migration 20260068): the REAL hourly
// job (lib/jobs/customer-emails.ts, via jiti) against a local database with a mock mailer. Each event is e-mailed
// to the workspace's owners and admins exactly once; staff, removed people and test addresses never get one;
// the log is closed to clients.
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
  process.env.NEXT_PUBLIC_APP_URL ||= 'http://localhost:3000' // links in the e-mails need the app's address
  const jiti = createJiti(import.meta.url, { alias: { '@': root } })
  const { customerLifecycleEmails, trialMilestone } = await jiti.import(path.join(root, 'lib/jobs/customer-emails.ts'))
  const { MockEmailAdapter, setEmailAdapterForTesting } = await jiti.import(path.join(root, 'lib/email/adapter.ts'))
  const { createServiceClient } = await jiti.import(path.join(root, 'lib/supabase/server.ts'))
  const service = createServiceClient()
  const mail = new MockEmailAdapter(); setEmailAdapterForTesting(mail)

  const pg = await import('pg')
  const sql = new (pg.default || pg).Client({ connectionString: DATABASE_URL }); await sql.connect()
  const one = async (s, p) => (await sql.query(s, p)).rows[0]
  const count = async (s, p) => Number((await one(s, p)).n)
  // Real-looking addresses: the mock mailer records them (reserved test domains are suppressed by design).
  const mkUser = async (label) => {
    const { data, error } = await service.auth.admin.createUser({ email: `${label}-${RUN}@regrow-mail-check.com`, password: 'Mail-Test-' + RUN + 'x9', email_confirm: true, user_metadata: { full_name: label } })
    if (error) throw error
    return { id: data.user.id, email: data.user.email, profile: (await one('SELECT id FROM public.profiles WHERE auth_user_id=$1', [data.user.id])).id }
  }

  console.log('P28 — CUSTOMER ACCOUNT E-MAILS')
  const owner = await mkUser('owner'); const admin = await mkUser('admin'); const sales = await mkUser('sales')
  const org = (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,'developer') RETURNING id`, [`Mail Co ${RUN}`, `mail-co-${RUN}`])).id
  await sql.query(`INSERT INTO public.org_members (org_id, profile_id, role, status) VALUES ($1,$2,'owner','active'),($1,$3,'admin','active'),($1,$4,'sales_exec','active')`, [org, owner.profile, admin.profile, sales.profile])
  await sql.query(`INSERT INTO public.org_subscriptions (org_id, status, billing_cycle, included_seats, additional_seats, current_period_end) VALUES ($1,'trial','monthly',5,0, now() + interval '2 days 3 hours')`, [org])

  await test('trial milestones: 7, 3 and 1 day(s) left, nothing outside', () => {
    const now = Date.parse('2026-01-01T00:00:00Z'); const at = (d) => new Date(now + d * 86_400_000).toISOString()
    assert.equal(trialMilestone(at(6.5), now), 7); assert.equal(trialMilestone(at(2.2), now), 3); assert.equal(trialMilestone(at(0.5), now), 1)
    assert.equal(trialMilestone(at(9), now), null); assert.equal(trialMilestone(at(-1), now), null)
  })

  await test('welcome and "trial ends in 3 days" go to the owner and admin only', async () => {
    mail.clear()
    await customerLifecycleEmails({}, service)
    const to = (subj) => mail.sentEmails.filter((e) => e.subject.includes(subj)).map((e) => e.to).sort()
    assert.deepEqual(to(`Mail Co ${RUN}" is ready`), [admin.email, owner.email].sort())
    assert.deepEqual(to('trial ends in 3 days'), [admin.email, owner.email].sort())
    assert.equal(mail.sentEmails.some((e) => e.to === sales.email), false, 'a salesperson gets no account e-mails')
    assert.equal(await count(`SELECT count(*) n FROM public.customer_email_log WHERE org_id=$1 AND status='sent'`, [org]), 2)
  })

  await test('running again sends nothing twice', async () => {
    mail.clear()
    await customerLifecycleEmails({}, service)
    assert.equal(mail.sentEmails.filter((e) => e.subject.includes(`Mail Co ${RUN}`) || e.html.includes(`Mail Co ${RUN}`)).length, 0)
  })

  await test('an issued invoice and a workspace made read-only are e-mailed once each', async () => {
    const inv = (await one(`SELECT public.billing_issue_plan_invoice($1, 'leads', 'monthly', $2) AS id`, [org, owner.profile])).id
    await sql.query(`INSERT INTO public.organisation_state_events (org_id, from_state, to_state, reason, actor_kind) VALUES ($1,'active','suspended','Payment overdue','system')`, [org])
    mail.clear()
    await customerLifecycleEmails({}, service)
    const invoiceMail = mail.sentEmails.filter((e) => e.subject.startsWith('Invoice '))
    assert.equal(invoiceMail.length, 2); assert.match(invoiceMail[0].html, new RegExp(`/billing/invoices/${inv}`))
    assert.equal(mail.sentEmails.filter((e) => e.subject.includes('is now read-only')).length, 2)
    mail.clear(); await customerLifecycleEmails({}, service)
    assert.equal(mail.sentEmails.filter((e) => e.html.includes(`Mail Co ${RUN}`)).length, 0)
  })

  await test('a removed admin gets nothing; the log is closed to clients', async () => {
    await sql.query(`UPDATE public.org_members SET status='deactivated' WHERE org_id=$1 AND profile_id=$2`, [org, admin.profile])
    await sql.query(`INSERT INTO public.organisation_state_events (org_id, from_state, to_state, reason, actor_kind) VALUES ($1,'suspended','active','Payment received','system')`, [org])
    mail.clear(); await customerLifecycleEmails({}, service)
    const back = mail.sentEmails.filter((e) => e.subject.includes('is active again'))
    assert.deepEqual(back.map((e) => e.to), [owner.email])
    const r = await one(`SELECT has_table_privilege('anon','public.customer_email_log','SELECT') a, has_table_privilege('authenticated','public.customer_email_log','SELECT') b`)
    assert.equal(r.a, false); assert.equal(r.b, false)
  })

  setEmailAdapterForTesting(null)
  await sql.end()
  console.log(`\nP28 customer e-mails: ${passed} checks passed.`)
}
main().catch((e) => { console.error(e); process.exit(1) })
