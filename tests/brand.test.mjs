// tests/brand.test.mjs
// Branding phase 1 (BRANDING_MIGRATION_PLAN classes A–C): user-visible copy says REGrow.
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
  assert.equal(brand.PRODUCT_NAME, 'REGrow')
  assert.equal(brand.COMPANY_NAME, 'INFYN Group')
  assert.equal(brand.PRODUCT_FULL_NAME, 'REGrow by INFYN Group')
})

await test('invitation email copy uses REGrow (real adapter, network stubbed)', async () => {
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
      to: 'new.member@regrow.test', orgName: 'Acme Developers', role: 'sales_exec',
      inviterName: 'Asha', inviteUrl: 'https://example.test/invite/abc',
    })
  } finally {
    globalThis.fetch = realFetch
  }
  assert.equal(sent.length, 1)
  const email = sent[0]
  assert.match(email.from, /^REGrow </)
  assert.equal(email.subject, 'Asha invited you to Acme Developers on REGrow')
  assert.match(email.html, /REGrow by INFYN Group/)
  assert.match(email.text, /Join Acme Developers on REGrow/)
  assert.match(email.text, /REGrow by INFYN Group/)
  for (const field of ['from', 'subject', 'html', 'text']) {
    assert.ok(!/Production X/i.test(email[field] || ''), `${field} must not mention Production X`)
  }
})

// Integration contracts that keep the legacy identifier until BRANDING_MIGRATION_PLAN phase 2 (M1-15).
const ALLOWED_LEGACY = [
  /productionx-enquiry-form/,          // website embed element id (customer sites)
  /data-productionx-form/,             // website embed attribute
  /initProductionXForms/,              // embed script function name
  /productionx_(central_)?whatsapp_verify_token/, // WhatsApp verify-token defaults
  /ProductionX-Webhooks\/1\.0/,        // outbound webhook User-Agent
  /noreply@productionx\.ai/,           // sending address until the REGrow email domain is authenticated
  /productionx\.(com|in|ai)/,          // hard-coded domains (class E) until REGrow domains are chosen
]

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name)
    return d.isDirectory() ? walk(p) : /\.(ts|tsx|mjs)$/.test(p) ? [p] : []
  })
}

await test('no "Production X" in user-visible code outside the documented legacy contracts', () => {
  const offenders = []
  for (const dir of ['app', 'components', 'lib', 'scripts']) {
    for (const file of walk(path.join(root, dir))) {
      fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        if (!/production[ _-]?x/i.test(line)) return
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) return // comments
        if (ALLOWED_LEGACY.some((re) => re.test(line))) return
        offenders.push(`${path.relative(root, file)}:${i + 1}: ${line.trim().slice(0, 100)}`)
      })
    }
  }
  assert.deepEqual(offenders, [], `legacy brand in user-visible code:\n${offenders.join('\n')}`)
})

console.log(`\nALL ${passed} BRANDING TESTS PASSED`)
