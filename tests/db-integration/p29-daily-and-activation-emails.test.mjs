// tests/db-integration/p29-daily-and-activation-emails.test.mjs — migration 20260069 with the REAL jobs (via jiti) and
// a mock mailer: team-member welcome to the new member only, "plan active" to owners, the 8 AM reports (manager
// report to the owner, "your day" to a salesperson with work, nothing for someone with a quiet day or who turned
// it off), once per day; the preference column is writable by its owner only.
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
  process.env.NEXT_PUBLIC_APP_URL ||= 'http://localhost:3000'
  const jiti = createJiti(import.meta.url, { alias: { '@': root } })
  const { customerLifecycleEmails } = await jiti.import(path.join(root, 'lib/jobs/customer-emails.ts'))
  const { dailyReports } = await jiti.import(path.join(root, 'lib/jobs/daily-reports.ts'))
  const { MockEmailAdapter, setEmailAdapterForTesting } = await jiti.import(path.join(root, 'lib/email/adapter.ts'))
  const { createServiceClient } = await jiti.import(path.join(root, 'lib/supabase/server.ts'))
  const service = createServiceClient()
  const mail = new MockEmailAdapter(); setEmailAdapterForTesting(mail)

  const pg = await import('pg')
  const sql = new (pg.default || pg).Client({ connectionString: DATABASE_URL }); await sql.connect()
  const one = async (s, p) => (await sql.query(s, p)).rows[0]
  const mkUser = async (label) => {
    const { data, error } = await service.auth.admin.createUser({ email: `${label}-${RUN}@repx-mail-check.com`, password: 'Daily-Test-' + RUN + 'x9!', email_confirm: true, user_metadata: { full_name: `${label} ${RUN}` } })
    if (error) throw error
    return { id: data.user.id, email: data.user.email, profile: (await one('SELECT id FROM public.profiles WHERE auth_user_id=$1', [data.user.id])).id }
  }
  const to = (subjectPart) => mail.sentEmails.filter((e) => e.subject.includes(subjectPart)).map((e) => e.to).sort()

  console.log('P29 — ACTIVATION, TEAM WELCOME AND DAILY REPORTS')
  const owner = await mkUser('owner'); const sales = await mkUser('sales'); const quiet = await mkUser('quiet'); const optout = await mkUser('optout')
  const name = `Daily Co ${RUN}`
  const org = (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,'developer') RETURNING id`, [name, `daily-co-${RUN}`])).id
  await sql.query(`INSERT INTO public.org_members (org_id, profile_id, role, status, joined_at) VALUES ($1,$2,'owner','active', now() - interval '10 days'),
    ($1,$3,'sales_exec','active', now()),($1,$4,'sales_exec','active', now() - interval '10 days'),($1,$5,'sales_exec','active', now() - interval '10 days')`, [org, owner.profile, sales.profile, quiet.profile, optout.profile])
  await sql.query(`INSERT INTO public.org_subscriptions (org_id, status, plan_tier, billing_cycle, included_seats, additional_seats, current_period_end, activated_at) VALUES ($1,'active','growth','annual',10,0, now() + interval '365 days', now())`, [org])
  await sql.query(`INSERT INTO public.leads (org_id, name, phone, source, status, assigned_to) VALUES ($1,'Arjun','9000000201','website','new',$2),($1,'Bela','9000000202','website','new',$3)`, [org, sales.profile, optout.profile])

  await test('a new team member gets their own welcome; owners get "plan active"', async () => {
    mail.clear(); await customerLifecycleEmails({}, service)
    assert.deepEqual(to(`Welcome to ${name} on RE`), [sales.email])
    assert.deepEqual(to('Your RE plan is active').filter((e) => e === owner.email), [owner.email])
    assert.equal(to('Your RE plan is active').includes(sales.email), false, 'salespeople get no billing e-mails')
  })

  await test('the preference is the owner’s own: they can turn it off, nobody else can', async () => {
    await sql.query('BEGIN')
    await sql.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: optout.id, role: 'authenticated' })]); await sql.query('SET LOCAL ROLE authenticated')
    await sql.query(`UPDATE public.profiles SET email_daily_report = false WHERE auth_user_id = $1`, [optout.id])
    const other = await sql.query(`UPDATE public.profiles SET email_daily_report = false WHERE auth_user_id = $1`, [sales.id])
    assert.equal(other.rowCount, 0, 'cannot change someone else')
    await sql.query('COMMIT')
    assert.equal((await one('SELECT email_daily_report v FROM public.profiles WHERE id=$1', [optout.profile])).v, false)
    assert.equal((await one('SELECT email_daily_report v FROM public.profiles WHERE id=$1', [sales.profile])).v, true)
  })

  await test('8 AM: team report to the owner, "your day" to a salesperson with work; nothing for a quiet day or opt-out; once a day', async () => {
    mail.clear(); await dailyReports({}, service)
    assert.deepEqual(to(`${name} yesterday`), [owner.email])
    assert.deepEqual(to(`Your day at ${name}`), [sales.email])
    const all = mail.sentEmails.filter((e) => e.subject.includes(name)).map((e) => e.to)
    assert.equal(all.includes(quiet.email), false, 'quiet day: no e-mail'); assert.equal(all.includes(optout.email), false, 'turned off: no e-mail')
    const mine = mail.sentEmails.find((e) => e.to === sales.email)
    assert.match(mine.text, /Call first: Arjun/); assert.doesNotMatch(mine.text, /9000000201/, 'no phone numbers')
    mail.clear(); await dailyReports({}, service)
    assert.equal(mail.sentEmails.filter((e) => e.subject.includes(name)).length, 0, 'not twice on the same day')
  })

  setEmailAdapterForTesting(null)
  await sql.end()
  console.log(`\nP29 activation and daily e-mails: ${passed} checks passed.`)
}
main().catch((e) => { console.error(e); process.exit(1) })
