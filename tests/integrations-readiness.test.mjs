// tests/integrations-readiness.test.mjs — the central Meta/Google set-up check, WhatsApp Embedded Signup, and the
// webhook fixes found in the integrations audit: no hardcoded verify tokens, no cross-workspace fallback routing,
// same-origin OAuth return paths, and no secrets in connection data sent to the browser.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
const R = await jiti.import(path.join(root, 'lib/integrations/readiness.ts'))
const ES = await jiti.import(path.join(root, 'lib/integrations/whatsapp/embedded-signup.ts'))
const { redactConnectionMetadata } = await jiti.import(path.join(root, 'lib/integrations/redact.ts'))
let passed = 0
const tests = []
const test = (name, fn) => tests.push([name, fn])

const FULL = {
  ENCRYPTION_KEY: 'enc-SECRET-VALUE-1', META_APP_ID: '1234567890', META_APP_SECRET: 'meta-SECRET-VALUE-2',
  META_WEBHOOK_VERIFY_TOKEN: 'verify-SECRET-VALUE-3', META_WA_CONFIG_ID: '998877', GOOGLE_CLIENT_ID: 'gid',
  GOOGLE_CLIENT_SECRET: 'google-SECRET-VALUE-4', GOOGLE_DEVELOPER_TOKEN: 'dev-SECRET-VALUE-5',
}

test('readiness names what is missing and never echoes a value', () => {
  const empty = R.integrationReadiness({})
  const by = (k, list = empty) => list.find((r) => r.key === k)
  assert.deepEqual(by('meta_lead_ads').missing, ['META_APP_ID', 'META_APP_SECRET', 'META_WEBHOOK_VERIFY_TOKEN'])
  assert.deepEqual(by('whatsapp_cloud').missing, ['META_APP_ID', 'META_APP_SECRET', 'META_WEBHOOK_VERIFY_TOKEN', 'META_WA_CONFIG_ID'])
  assert.deepEqual(by('platform').missing, ['ENCRYPTION_KEY'])
  assert.equal(by('website').ready, true)
  const full = R.integrationReadiness(FULL)
  for (const r of full) assert.equal(r.ready, true, r.key)
  assert.doesNotMatch(JSON.stringify(full), /SECRET-VALUE/, 'only names and yes/no')
  assert.equal(by('meta_lead_ads', R.integrationReadiness({ ...FULL, META_APP_ID: 'YOUR_APP_ID' })).ready, false, 'placeholders count as missing')
})

test('Embedded Signup is offered only when the WhatsApp settings and the encryption key are all set', () => {
  assert.equal(R.embeddedSignupConfig({}).available, false)
  const { ENCRYPTION_KEY, ...noKey } = FULL
  assert.equal(R.embeddedSignupConfig(noKey).available, false, 'tokens must never be stored without the encryption key')
  const c = R.embeddedSignupConfig(FULL)
  assert.deepEqual(c, { available: true, appId: '1234567890', configId: '998877', apiVersion: 'v21.0' })
})

test('the signup input is checked before anything is sent to Meta', () => {
  const ok = { code: 'AQB'.padEnd(40, 'x'), wabaId: '102938475610', phoneNumberId: '109876543210', pin: '123456' }
  assert.equal(ES.checkSignupInput(ok), null)
  assert.match(ES.checkSignupInput({ ...ok, pin: '12345' }), /6-digit/)
  assert.match(ES.checkSignupInput({ ...ok, wabaId: '../me' }), /Business Account/)
  assert.match(ES.checkSignupInput({ ...ok, phoneNumberId: '' }), /phone number/)
  assert.match(ES.checkSignupInput({ ...ok, code: '' }), /code/)
})

test('only Meta’s own https pages are trusted for the signup message', () => {
  assert.ok(ES.isMetaOrigin('https://www.facebook.com'))
  assert.ok(ES.isMetaOrigin('https://web.facebook.com'))
  for (const o of ['https://facebook.com.evil.example', 'https://evilfacebook.com', 'http://www.facebook.com', 'null', '']) assert.equal(ES.isMetaOrigin(o), false, o)
})

function fakeMeta({ registerOk = true, exchangeOk = true } = {}) {
  const calls = []
  const fetcher = async (url, init = {}) => {
    calls.push({ url, method: init.method ?? 'GET', headers: init.headers ?? {}, body: init.body })
    const json = (status, body) => new Response(JSON.stringify(body), { status })
    if (url.includes('/oauth/access_token')) return exchangeOk ? json(200, { access_token: 'cust-TOKEN' }) : json(400, { error: { message: 'Invalid code' } })
    if (url.endsWith('/subscribed_apps')) return json(200, { success: true })
    if (url.endsWith('/register')) return registerOk ? json(200, { success: true }) : json(400, { error: { message: 'PIN mismatch' } })
    if (url.includes('?fields=')) return json(200, { display_phone_number: '+91 98450 00000', verified_name: 'Sky Homes', quality_rating: 'GREEN' })
    return json(404, {})
  }
  return { calls, fetcher }
}
const INPUT = { code: 'AQB'.padEnd(40, 'x'), wabaId: '102938475610', phoneNumberId: '109876543210', pin: '123456' }
const APP = { appId: '1234567890', appSecret: 'meta-SECRET-VALUE-2', apiVersion: 'v21.0' }

test('signup exchanges the code, subscribes the WABA, registers the number and reads its name', async () => {
  const m = fakeMeta()
  const r = await ES.completeEmbeddedSignup(INPUT, APP, m.fetcher)
  assert.equal(r.accessToken, 'cust-TOKEN')
  assert.equal(r.registered, true); assert.equal(r.warning, null)
  assert.deepEqual(r.phone, { displayPhoneNumber: '+91 98450 00000', verifiedName: 'Sky Homes', qualityRating: 'GREEN' })
  assert.match(m.calls[0].url, /graph\.facebook\.com\/v21\.0\/oauth\/access_token\?client_id=1234567890&client_secret=.+&code=/)
  assert.doesNotMatch(m.calls[0].url, /redirect_uri/)
  assert.equal(m.calls[1].url, 'https://graph.facebook.com/v21.0/102938475610/subscribed_apps'); assert.equal(m.calls[1].method, 'POST')
  assert.equal(m.calls[2].url, 'https://graph.facebook.com/v21.0/109876543210/register')
  assert.deepEqual(JSON.parse(m.calls[2].body), { messaging_product: 'whatsapp', pin: '123456' })
  for (const c of m.calls.slice(1)) assert.equal(c.headers.Authorization, 'Bearer cust-TOKEN', 'the customer’s token, never the app secret')
})

test('a failed code exchange stops; a failed registration still connects with a warning', async () => {
  await assert.rejects(ES.completeEmbeddedSignup(INPUT, APP, fakeMeta({ exchangeOk: false }).fetcher), /did not accept the sign-up code \(Invalid code\)/)
  const r = await ES.completeEmbeddedSignup(INPUT, APP, fakeMeta({ registerOk: false }).fetcher)
  assert.equal(r.registered, false); assert.match(r.warning, /PIN mismatch/)
})

test('the signup route: managers and above, module-gated, one number per workspace, token encrypted, audited', () => {
  const src = read('app/api/integrations/whatsapp/embedded-signup/route.ts')
  assert.match(src, /const ROLES = \['owner', 'admin', 'manager'\] as const/)
  assert.equal((src.match(/authorizeOrgAccess\(orgId, \[\.\.\.ROLES\]\)/g) ?? []).length, 2, 'GET and POST')
  assert.match(src, /requireModule\(orgId, 'integrations'\)/)
  assert.match(src, /\.neq\('org_id', orgId\)[\s\S]*already connected to another REGrow workspace[\s\S]*status: 409/)
  assert.match(src, /credential_ref: encryptCredential\(result\.accessToken\)/)
  assert.match(src, /\.eq\('id', existing\.id\)\.eq\('org_id', orgId\)/)
  assert.match(src, /auditMember\(request, access\.context, orgId, 'integration\.connected'/)
  assert.doesNotMatch(src, /appSecret[^\n]*NextResponse\.json/, 'the app secret is never returned')
})

test('webhook verification fails closed: no verify token is written into the code', () => {
  for (const f of ['app/api/webhooks/whatsapp/route.ts', 'app/api/webhooks/whatsapp/[connectionId]/route.ts']) {
    const src = read(f)
    assert.doesNotMatch(src, /productionx_[a-z_]*verify_token/, f)
    assert.match(src, /if \(!expectedToken\) \{\s*return new NextResponse\('WhatsApp webhook verify token is not configured\.', \{ status: 503 \}\)/, f)
  }
})

test('the central WhatsApp webhook never hands an unmatched event to another workspace', () => {
  const src = read('app/api/webhooks/whatsapp/route.ts')
  assert.doesNotMatch(src, /activeConnections\[0\]/)
  assert.match(src, /if \(!selectedPhone\) return false/)
})

test('OAuth callbacks only return to same-origin paths', () => {
  for (const f of ['app/api/integrations/meta/callback/route.ts', 'app/api/integrations/google/callback/route.ts']) {
    assert.match(read(f), /const redirectTarget = safeRedirectPath\(returnUrl, fallbackRedirectUrl\)/, f)
  }
})

test('connection data sent to the browser has no tokens or secrets, even encrypted ones', () => {
  const out = redactConnectionMetadata({
    wabaId: '1', displayPhoneNumber: '+91', appSecret: 's', webhookVerifyToken: 't', encryptedPageTokens: { p: 'x' },
    pages: [{ id: 'p1', name: 'Page', access_token: 'x', category: 'Real estate' }], nested: { apiKey: 'k', ok: true },
  })
  assert.deepEqual(out, { wabaId: '1', displayPhoneNumber: '+91', pages: [{ id: 'p1', name: 'Page', category: 'Real estate' }], nested: { ok: true } })
  assert.deepEqual(redactConnectionMetadata(null), {})
  assert.match(read('lib/dal/integrations.ts'), /metadata: redactConnectionMetadata\(conn\.metadata\),\s*credential_ref: null,/)
})

test('the platform page shows names and counts only, to the Platform Owner and platform admins', () => {
  const P = read('lib/platform/portal.ts')
  assert.match(P, /integrations: \['super_admin', 'platform_admin'\],/)
  const page = read('app/platform/integrations/page.tsx')
  assert.match(page, /can\(access\.role as StaffRole, 'integrations'\)/)
  assert.match(page, /\.select\('provider, status'\)/, 'counts only — no customer records')
  assert.doesNotMatch(page, /process\.env\.[A-Z_]+/, 'reads the environment only through the readiness check')
})

for (const [name, fn] of tests) { await fn(); passed++; console.log(`  ✓ ${name}`) }
console.log(`\nIntegrations readiness: ${passed} checks passed.`)
