// tests/email-service.test.mjs — the central e-mail configuration and providers (real modules via jiti, network
// stubbed; nothing is ever sent). The outbox itself is tested against a real database in p30.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const cfg = await jiti.import(path.join(root, 'lib/email/config.ts'))
const adapter = await jiti.import(path.join(root, 'lib/email/adapter.ts'))
const templates = await jiti.import(path.join(root, 'lib/email/templates.ts'))
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8')
let passed = 0
async function test(name, fn) { await fn(); passed++; console.log(`  ✓ ${name}`) }
const withEnv = async (vars, fn) => {
  const saved = { ...process.env }
  for (const k of ['EMAIL_PROVIDER', 'EMAIL_FROM_NAME', 'EMAIL_FROM_ADDRESS', 'EMAIL_REPLY_TO', 'RESEND_API_KEY', 'RESEND_FROM_EMAIL', 'RESEND_REPLY_TO', 'VERCEL_ENV', 'EMAIL_PROVIDER_TIMEOUT_MS']) delete process.env[k]
  Object.assign(process.env, vars)
  try { return await fn() } finally { process.env = saved }
}

console.log('E-MAIL SERVICE')
await test('sender, reply-to and provider come only from configuration; new names win, legacy names still work', async () => {
  const c1 = cfg.getEmailConfig({ EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 're_x123456', EMAIL_FROM_NAME: 'REGrow', EMAIL_FROM_ADDRESS: 'hello@regrowth.in', EMAIL_REPLY_TO: 'support@regrowth.in', VERCEL_ENV: 'production' })
  assert.deepEqual([c1.provider, c1.from, c1.replyTo, c1.problems], ['resend', 'REGrow <hello@regrowth.in>', 'support@regrowth.in', []])
  const legacy = cfg.getEmailConfig({ RESEND_API_KEY: 're_x123456', RESEND_FROM_EMAIL: 'REGrow Team <team@regrowth.in>', RESEND_REPLY_TO: 'help@regrowth.in', VERCEL_ENV: 'production' })
  assert.deepEqual([legacy.provider, legacy.from, legacy.replyTo, legacy.source.from], ['resend', 'REGrow Team <team@regrowth.in>', 'help@regrowth.in', 'RESEND_FROM_EMAIL'])
  const both = cfg.getEmailConfig({ RESEND_API_KEY: 're_x123456', RESEND_FROM_EMAIL: 'old@regrowth.in', EMAIL_FROM_ADDRESS: 'new@regrowth.in', VERCEL_ENV: 'production' })
  assert.equal(both.fromAddress, 'new@regrowth.in')
})
await test('invalid or missing configuration is reported, never patched with a hard-coded sender', async () => {
  const none = cfg.getEmailConfig({ VERCEL_ENV: 'production' })
  assert.equal(none.from, null); assert.ok(none.problems.some((p) => /provider/.test(p))); assert.ok(none.problems.some((p) => /EMAIL_FROM_ADDRESS/.test(p)))
  assert.ok(cfg.getEmailConfig({ EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 're_1234567', EMAIL_FROM_ADDRESS: 'not-an-address', VERCEL_ENV: 'production' }).problems.some((p) => /not a valid/.test(p)))
  assert.ok(cfg.getEmailConfig({ EMAIL_PROVIDER: 'sendgrid', VERCEL_ENV: 'production' }).problems.some((p) => /not supported/.test(p)))
  assert.ok(cfg.getEmailConfig({ EMAIL_PROVIDER: 'mock', VERCEL_ENV: 'production' }).problems.some((p) => /mock/.test(p)), 'the mock is never accepted in production')
  for (const f of ['lib/email/adapter.ts', 'lib/email/service.ts', 'lib/email/templates.ts', 'lib/jobs/customer-emails.ts', 'lib/jobs/daily-reports.ts', 'lib/jobs/site-visit-notify.ts', 'lib/payments/monitoring.ts', 'lib/payments/mandates.ts', 'app/api/website/demo-request/route.ts'])
    assert.doesNotMatch(read(f), /noreply@|@productionx\.ai|@regrowth\.in/, `${f} hard-codes no sender`)
})
await test('Resend: idempotency key, configured sender at send time, timeout, and error classes', async () => {
  const calls = []
  const realFetch = globalThis.fetch
  try {
    await withEnv({ RESEND_API_KEY: 're_test1234', EMAIL_FROM_ADDRESS: 'first@regrowth.in', EMAIL_REPLY_TO: 'support@regrowth.in' }, async () => {
      globalThis.fetch = async (_u, init) => { calls.push({ headers: init.headers, body: JSON.parse(init.body) }); return new Response(JSON.stringify({ id: 'e1' }), { status: 200 }) }
      const a = adapter.getEmailAdapter()
      assert.equal(a.name, 'resend')
      assert.equal((await a.sendEmail({ to: 'x@company.in', subject: 's', html: 'h', idempotencyKey: 'invite:1:abc' })).success, true)
      process.env.EMAIL_FROM_ADDRESS = 'second@regrowth.in' // changed while running: the next send uses it
      await adapter.getEmailAdapter().sendEmail({ to: 'x@company.in', subject: 's', html: 'h' })
      assert.equal(calls[0].headers['Idempotency-Key'], 'invite:1:abc')
      assert.deepEqual([calls[0].body.from, calls[0].body.reply_to, calls[1].body.from], ['REGrow <first@regrowth.in>', 'support@regrowth.in', 'REGrow <second@regrowth.in>'])
      for (const [status, msg, kind] of [[429, 'rate', 'transient'], [503, 'down', 'transient'], [401, 'bad key', 'config'], [422, 'The domain is not verified', 'config'], [422, 'Invalid `to` field', 'permanent']])
        assert.equal(adapter.classifyResend(status, msg), kind, `${status} ${msg}`)
      process.env.EMAIL_PROVIDER_TIMEOUT_MS = '60'
      globalThis.fetch = (_u, init) => new Promise((_r, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))))
      const slow = await adapter.getEmailAdapter().sendEmail({ to: 'x@company.in', subject: 's', html: 'h' })
      assert.deepEqual([slow.success, slow.errorKind], [false, 'transient']); assert.match(slow.error, /did not answer/)
    })
  } finally { globalThis.fetch = realFetch }
})
await test('no provider configured: a configuration failure (held in the outbox), not a silent success', async () => {
  await withEnv({ VERCEL_ENV: 'production' }, async () => {
    adapter.setEmailAdapterForTesting(null)
    const r = await adapter.getEmailAdapter().sendEmail({ to: 'a@company.in', subject: 's', html: 'h' })
    assert.deepEqual([r.success, r.errorKind], [false, 'config'])
  })
})
await test('the mock behaves like a provider: idempotency and scripted failures', async () => {
  await withEnv({}, async () => {
    const m = new adapter.MockEmailAdapter()
    await m.sendEmail({ to: 'a@company.in', subject: 's', html: 'h', idempotencyKey: 'k1' }); await m.sendEmail({ to: 'a@company.in', subject: 's', html: 'h', idempotencyKey: 'k1' })
    assert.equal(m.sentEmails.length, 1)
    m.scripted.push({ success: false, errorKind: 'transient', error: '503' })
    assert.equal((await m.sendEmail({ to: 'a@company.in', subject: 's', html: 'h' })).errorKind, 'transient')
  })
})
await test('admin-safe: errors and addresses are masked; no secret ever appears', () => {
  assert.equal(cfg.maskAddress('ravi@acme.in'), 'ra***@acme.in')
  assert.equal(cfg.sanitizeError('Rejected ravi@acme.in with key re_abcdefgh123 and Bearer xyz'), 'Rejected ra***@acme.in with key re_*** and Bearer ***')
})
await test('templates: links are built at delivery from paths; unknown templates fail permanently', async () => {
  assert.deepEqual(templates.resolvePaths({ orgName: 'X', urlPath: '/x/billing' }, 'https://app.example.org'), { orgName: 'X', url: 'https://app.example.org/x/billing' })
  await assert.rejects(() => templates.renderTemplate('no.such', {}, { db: null, orgId: null }), (e) => e.kind === 'permanent')
  for (const t of ['invitation', 'customer', 'daily.member', 'daily.manager', 'demo.confirmation', 'demo.alert', 'site_visit', 'payments.alerts', 'payments.debit_notice', 'staff.email_health']) assert.ok(templates.TEMPLATE_NAMES.includes(t), t)
})
await test('Supabase Auth e-mails stay independent: password reset and sign-up never use the application sender settings', () => {
  for (const f of fs.readdirSync(path.join(root, 'supabase/templates'))) assert.doesNotMatch(read(`supabase/templates/${f}`), /EMAIL_FROM|RESEND/, f)
  const auth = ['components/auth/LoginForm.tsx', 'components/auth/ResetPasswordForm.tsx', 'app/auth/confirm/route.ts', 'app/auth/callback/route.ts'].map(read).join('\n')
  assert.doesNotMatch(auth, /lib\/email\/(service|config|adapter)/, 'reset and sign-in flows do not depend on the app mailer')
  assert.match(auth, /resetPasswordForEmail/)
})
console.log(`\nE-mail service: ${passed} checks passed.`)
