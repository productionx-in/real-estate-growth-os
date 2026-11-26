// tests/brand.test.mjs
// Branding phase 1 (BRANDING_MIGRATION_PLAN classes A–C): user-visible copy says RE by PX.
// Imports the real lib/brand.ts and the real email adapter, and guards against regressions.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })

let passed = 0
async function test(name, fn) {
  await fn()
  passed++
  console.log(`  ✓ ${name}`)
}

console.log('BRANDING (real lib/brand.ts, lib/email/adapter.ts)')

const brand = await jiti.import(path.join(root, 'lib/brand.ts'))

await test('product and company names', () => {
  assert.equal(brand.PRODUCT_NAME, 'RE by PX')
  assert.equal(brand.COMPANY_NAME, 'Production X')
  assert.equal(brand.PRODUCT_FULL_NAME, 'RE by PX')
})

await test('invitation email copy uses RE by PX (real adapter, network stubbed)', async () => {
  const { ResendEmailAdapter } = await jiti.import(path.join(root, 'lib/email/adapter.ts'))
  const sent = []
  const realFetch = globalThis.fetch
  globalThis.fetch = async (_url, init) => {
    sent.push(JSON.parse(init.body))
    return new Response(JSON.stringify({ id: 'test-id' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  try {
    const adapter = new ResendEmailAdapter('test-key')
    await adapter.sendInvitationEmail({
      to: 'new.member@acme-developers.in', orgName: 'Acme Developers', role: 'sales_exec',
      inviterName: 'Asha', inviteUrl: 'https://example.test/invite/abc',
    })
  } finally {
    globalThis.fetch = realFetch
  }
  assert.equal(sent.length, 1)
  const email = sent[0]
  assert.match(email.from, /^RE by PX </)
  assert.equal(email.subject, 'Asha invited you to Acme Developers on RE by PX')
  assert.match(email.html, /RE by PX/)
  assert.match(email.text, /Join Acme Developers on RE by PX/)
  assert.match(email.text, /RE by PX/)
  for (const field of ['from', 'subject', 'html', 'text']) {
    assert.ok(!/regrow|infyn/i.test(email[field] || ''), `${field} must not use the retired brand`)
  }
})

// The retired brand may only survive in stable technical contracts that customers' sites, stored data or server
// configuration depend on (see lib/brand.ts). Everything a person can read says RE by PX / Production X.
const RETIRED = /regrow|infyn/i
const ALLOWED_RETIRED = [
  /data-regrow-|w(indow)?\.REGrow\b/,                // website embed: old attributes and global still read
  /regrow_attr_v1|regrow_optout/,                      // visitor choices stored by the embed
  /_?regrow-verify/,                                    // DNS proof records customers added before the rename
  /REGROW_[A-Z_]+/,                                     // environment variable names (server configuration)
  /regrow_job_worker_(secret|url)|regrow_invoke_job_worker|regrow_demo|regrow_valid_tags|regrow_health_probe/, // database objects
  /'regrow'|"regrow"|`regrow`|\bregrow: '|missing_in_regrow/,                // stored enum values (plot-map owner, reconciliation)
  /\bregrow-(staging|job-worker|lead-responses|billing-periods|payments-[a-z]+|release-expired-holds|award-trophies|reward-sweep|weekly-digest|purge-archived-leads|customer-emails|daily-reports|email-outbox|sign-in-purge)\b/, // cron jobs and the staging project (real names)
]

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name)
    return d.isDirectory() ? walk(p) : /\.(ts|tsx|mjs|js|css|json|md)$/.test(p) ? [p] : []
  })
}

await test('the retired brand appears nowhere except the documented technical contracts', () => {
  const offenders = []
  for (const dir of ['app', 'components', 'lib', 'scripts', 'public', 'docs']) {
    for (const file of walk(path.join(root, dir))) {
      fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        if (!RETIRED.test(line)) return
        if (ALLOWED_RETIRED.some((re) => re.test(line))) return
        offenders.push(`${path.relative(root, file)}:${i + 1}: ${line.trim().slice(0, 100)}`)
      })
    }
  }
  assert.deepEqual(offenders, [], `retired brand found:\n${offenders.join('\n')}`)
})

console.log(`\nALL ${passed} BRANDING TESTS PASSED`)
