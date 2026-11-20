// tests/email-and-demo.test.mjs — e-mail is never silently faked in production, every invitation path checks whether
// the e-mail was really sent, team invitations hand the link to the inviting owner/admin, and website demo requests
// reach the internal Sales pipeline without any setting.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root }, moduleCache: false })
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8')
let passed = 0
async function test(name, fn) { await fn(); passed++; console.log(`  ✓ ${name}`) }

console.log('EMAIL & DEMO REQUESTS')
await test('production without an e-mail key fails clearly; development keeps the mock', async () => {
  const saved = { ...process.env }
  try {
    delete process.env.RESEND_API_KEY
    process.env.VERCEL_ENV = 'production'
    let m = await jiti.import(path.join(root, 'lib/email/adapter.ts'))
    m.setEmailAdapterForTesting(null)
    const r = await m.getEmailAdapter().sendInvitationEmail({ to: 'a@company.in', orgName: 'X', role: 'admin', inviteUrl: 'https://x/invite/t' })
    assert.equal(r.success, false)
    assert.match(r.error, /not configured/i)
    process.env.VERCEL_ENV = 'preview'
    m = await jiti.import(path.join(root, 'lib/email/adapter.ts'))
    m.setEmailAdapterForTesting(null)
    assert.equal((await m.getEmailAdapter().sendEmail({ to: 'a@company.in', subject: 's', html: 'h' })).success, true)
  } finally { process.env = saved }
})

await test('every invitation path checks whether the e-mail was really sent', async () => {
  for (const f of ['app/api/admin/organisations/provision/route.ts', 'app/api/admin/invitations/retry/route.ts']) {
    assert.match(read(f), /const sent = await mailer\.sendInvitationEmail[\s\S]*?if \(!sent\.success\) throw/, f)
  }
  const team = read('app/api/team/invite/route.ts')
  assert.match(team, /emailDispatched = sent\.success/)
  assert.doesNotMatch(team, /emailDispatched: true/, 'never claims success unconditionally')
  assert.match(read('app/api/admin/organisations/provision/route.ts'), /emailDispatched,\s*\n\s*emailError,/)
})

await test('team invitations return the link only after the owner/admin check', async () => {
  const team = read('app/api/team/invite/route.ts')
  const guard = team.indexOf("['owner', 'admin'].includes(callerMembership.role)")
  assert.ok(guard > 0 && team.indexOf('inviteUrl,') > guard)
})

await test('the provisioning screen shows the real address and says when the e-mail was not sent', async () => {
  const ui = read('components/admin/PlatformProvisioningModal.tsx')
  assert.match(ui, /data\.invitation\?\.adminEmail/)
  assert.match(ui, /was <strong>not sent<\/strong>/)
})

await test('website demo requests go to the internal Sales pipeline, rate-limited and bot-filtered, with no setting needed', async () => {
  const form = read('components/marketing/DemoRequestForm.tsx')
  assert.match(form, /fetch\('\/api\/website\/demo-request'/)
  assert.doesNotMatch(form, /not available right now/)
  const route = read('app/api/website/demo-request/route.ts')
  assert.match(route, /checkDistributedRateLimit\(\{ key: `website-demo:ip:/)
  assert.match(route, /website_url_hp \|\| tooFast/)
  assert.match(route, /from\('internal_prospects'\)\.insert/)
  assert.doesNotMatch(route, /from\('leads'\)|org_id/, 'never writes into a customer workspace')
})

console.log(`Email & demo requests: ${passed} checks passed`)
