// tests/demo-environment.test.mjs — the demo seed's refusals that happen before any network call, the e-mail
// suppression for reserved test domains, and that no demo credential is ever committed.
import assert from 'node:assert/strict'
import { spawnSync, execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root }, moduleCache: false })
let passed = 0
async function test(name, fn) { await fn(); passed++; console.log(`  ✓ ${name}`) }
const seed = (args, env) => spawnSync(process.execPath, [path.join(root, 'scripts/demo/seed-demo.mjs'), ...args], {
  env: { PATH: process.env.PATH, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service', ...env }, encoding: 'utf8', timeout: 20000,
})

console.log('DEMO ENVIRONMENT')

await test('seed refuses the production project, whatever else is passed', async () => {
  for (const url of ['https://rtbvzqwwhefyyuhpoznu.supabase.co', 'https://rtbvzqwwhefyyuhpoznu.supabase.co/']) {
    const r = seed(['reset', '--confirm=rtbvzqwwhefyyuhpoznu'], { NEXT_PUBLIC_SUPABASE_URL: url, DEMO_PASSWORD: 'x'.repeat(10) })
    assert.notEqual(r.status, 0); assert.match(r.stderr, /REFUSED: this is the production project/)
  }
})

await test('seed refuses without an exact --confirm, on unknown hosts, and in a production shell', async () => {
  let r = seed(['purge'], { NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321' })
  assert.match(r.stderr, /pass --confirm=local/)
  r = seed(['purge', '--confirm=abcdefghijklmnopqrst'], { NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321' })
  assert.match(r.stderr, /pass --confirm=local/)
  r = seed(['purge', '--confirm=x'], { NEXT_PUBLIC_SUPABASE_URL: 'https://db.example.com' })
  assert.match(r.stderr, /cannot identify the Supabase project/)
  r = seed(['purge', '--confirm=local'], { NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321', VERCEL_ENV: 'production' })
  assert.match(r.stderr, /configured for production/)
  r = seed(['drop-everything', '--confirm=local'], { NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321' })
  assert.match(r.stderr, /unknown command/)
  for (const x of [r]) assert.notEqual(x.status, 0)
})

await test('seed requires the database marker and owner-only marking (source check)', async () => {
  const src = fs.readFileSync(path.join(root, 'scripts/demo/seed-demo.mjs'), 'utf8')
  assert.match(src, /from\('deployment_environment'\)/)
  assert.match(src, /is not marked as a non-production environment/)
  assert.doesNotMatch(src, /deployment_environment'\)\.(insert|upsert|update)/, 'the script never marks a database itself')
  assert.doesNotMatch(src, /12345678/, 'no password in the script')
  const sql = fs.readFileSync(path.join(root, 'supabase/migrations/20260063_demo_environment.sql'), 'utf8')
  assert.match(sql, /project_ref <> 'rtbvzqwwhefyyuhpoznu'/)
  assert.match(sql, /REVOKE ALL ON public\.deployment_environment FROM PUBLIC, anon, authenticated, service_role/)
})

await test('reserved test addresses are recognised; real ones are not', async () => {
  const { isReservedTestAddress } = await jiti.import(path.join(root, 'lib/email/adapter.ts'))
  for (const a of ['builder.admin@example.test', 'sales@regrow-demo.example.test', 'x@foo.example', 'a@b.invalid', 'a@example.com', 'a@mail.example.org', 'Name <a@x.test>'])
    assert.equal(isReservedTestAddress(a), true, a)
  for (const a of ['owner@gmail.com', 'a@testing.com', 'a@example.co.in', 'a@contest.in', 'a@myexample.com'])
    assert.equal(isReservedTestAddress(a), false, a)
})

await test('the Resend adapter never sends to reserved test addresses', async () => {
  const { ResendEmailAdapter } = await jiti.import(path.join(root, 'lib/email/adapter.ts'))
  const calls = []
  const realFetch = globalThis.fetch
  globalThis.fetch = async (url, init) => { calls.push(JSON.parse(init.body)); return new Response(JSON.stringify({ id: 'e1' }), { status: 200 }) }
  try {
    const a = new ResendEmailAdapter('re_test')
    assert.deepEqual(await a.sendEmail({ to: 'builder.admin@example.test', subject: 's', html: 'h' }), { success: true, id: 'suppressed-test-recipient' })
    assert.equal(calls.length, 0)
    await a.sendEmail({ to: ['partner.sales@example.test', 'someone@company.in'], subject: 's', html: 'h' })
    assert.deepEqual(calls[0].to, ['someone@company.in'])
  } finally { globalThis.fetch = realFetch }
})

await test('private login sheets are git-ignored and none is tracked', async () => {
  assert.match(fs.readFileSync(path.join(root, '.gitignore'), 'utf8'), /^\.demo-credentials\/$/m)
  let tracked = ''
  try { tracked = execFileSync('git', ['ls-files', '.demo-credentials'], { cwd: root, encoding: 'utf8' }) } catch { /* not a git checkout */ }
  assert.equal(tracked.trim(), '')
})

console.log(`Demo environment: ${passed} checks passed`)
