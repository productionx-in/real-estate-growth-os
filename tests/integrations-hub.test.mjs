// tests/integrations-hub.test.mjs — the simple Integrations dashboard (lib/integrations/hub.ts), guided domain
// verification (lib/integrations/dns-verify.ts, lib/email/domains.ts, migration 20260103) and sending buyer e-mail
// from a verified domain: plain statuses, records in plain words, lookups that never throw, and no platform settings
// or jargon shown to customers.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const H = await jiti.import(path.join(root, 'lib/integrations/hub.ts'))
const D = await jiti.import(path.join(root, 'lib/integrations/dns-verify.ts'))
const E = await jiti.import(path.join(root, 'lib/email/domains.ts'))
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
let passed = 0
async function test(name, fn) { await fn(); passed++; console.log(`  ✓ ${name}`) }
console.log('INTEGRATIONS HUB')

const ready = { meta_lead_ads: true, whatsapp_cloud: true, google_ads: false }
const card = (cards, key) => cards.find((c) => c.key === key)

await test('one card per service with a plain status: Connected, Not connected, Action required, Coming soon', () => {
  const cards = H.hubCards({ connections: [{ provider: 'meta_ads', status: 'connected' }, { provider: 'whatsapp_cloud', status: 'error' }, { provider: 'property_portal_99acres', status: 'connected' }], domains: [], ready })
  assert.deepEqual(cards.map((c) => c.key), ['meta', 'whatsapp', 'website', 'email', 'google', 'portals'])
  assert.equal(card(cards, 'meta').status, 'connected'); assert.equal(card(cards, 'meta').detail, '1 account connected')
  assert.equal(card(cards, 'whatsapp').status, 'action_required')
  assert.equal(card(cards, 'google').status, 'coming_soon', 'RE by PX’s Google setup is not finished')
  assert.equal(card(cards, 'website').status, 'not_connected')
  assert.equal(card(cards, 'portals').status, 'connected')
  for (const c of cards) assert.ok(c.emoji && c.title && c.blurb && c.cta)
})
await test('website and e-mail domains: a pending one needs action; a verified one is connected', () => {
  const pending = H.hubCards({ connections: [{ provider: 'website_webhook', status: 'connected' }], domains: [{ purpose: 'website', domain: 'a.in', status: 'pending' }, { purpose: 'email', domain: 'a.in', status: 'pending' }], ready })
  assert.equal(card(pending, 'website').status, 'action_required'); assert.equal(card(pending, 'email').status, 'action_required')
  const done = H.hubCards({ connections: [{ provider: 'website_webhook', status: 'connected' }], domains: [{ purpose: 'website', domain: 'a.in', status: 'verified' }, { purpose: 'email', domain: 'a.in', status: 'verified' }], ready })
  assert.equal(card(done, 'website').status, 'connected'); assert.equal(card(done, 'email').status, 'connected'); assert.match(card(done, 'email').detail, /a\.in/)
})
await test('domains: bare domains only; one ownership record; e-mail adds the provider’s records and a recommended DMARC', () => {
  assert.equal(D.cleanDomain('https://www.SeaView.in/contact'), 'www.seaview.in')
  assert.equal(D.cleanDomain('*.seaview.in'), null); assert.equal(D.cleanDomain('localhost'), null); assert.equal(D.cleanDomain('10.0.0.1'), null)
  const tok = 'b'.repeat(32)
  assert.match(read('lib/dal/domains.ts'), /newToken = \(\) => randomBytes\(16\)\.toString\('hex'\)/)
  assert.doesNotMatch(read('lib/integrations/dns-verify.ts'), /from 'node:/, 'browser-safe: the dashboard imports it')
  assert.deepEqual(D.recordsFor('website', 'seaview.in', tok).map((r) => [r.type, r.host, r.value]), [['TXT', '_repx-verify.seaview.in', `repx-verify=${tok}`]])
  const mail = D.recordsFor('email', 'seaview.in', tok, [{ type: 'TXT', name: 'resend._domainkey.seaview.in', value: 'p=MIG…', why: 'Signs your e-mail so inboxes trust it.' }, { type: 'MX', name: 'send.seaview.in', value: 'feedback-smtp.example.com', priority: 10, why: 'Lets bounces come back to the mail service.' }])
  assert.deepEqual(mail.map((r) => r.type), ['TXT', 'TXT', 'MX', 'TXT'])
  assert.equal(mail[2].priority, 10); assert.equal(mail.at(-1).host, '_dmarc.seaview.in'); assert.equal(mail.at(-1).required, false)
  for (const r of mail) assert.ok(r.why.length > 10, 'every record says why, in plain words')
})
await test('the check: exact value only, a wrong value is called out, a failed lookup is "not yet", never an error', async () => {
  const tok = 'a'.repeat(32)
  const dns = (map) => async (h) => { if (map[h] === 'fail') throw new Error('ENOTFOUND'); return (map[h] ?? []).map((v) => [v]) }
  assert.equal((await D.checkDomain('website', 'a.in', tok, dns({ '_repx-verify.a.in': [`repx-verify=${tok}`] }))).verified, true)
  assert.equal((await D.checkDomain('website', 'a.in', tok, dns({ '_regrow-verify.a.in': [`regrow-verify=${tok}`] }))).verified, true, 'records added before the rename still verify')
  const wrong = await D.checkDomain('website', 'a.in', tok, dns({ '_repx-verify.a.in': ['repx-verify=nope'] }))
  assert.equal(wrong.verified, false); assert.match(wrong.problems[0], /does not match/)
  const none = await D.checkDomain('email', 'a.in', tok, dns({ '_repx-verify.a.in': 'fail', '_dmarc.a.in': 'fail' }))
  assert.equal(none.verified, false); assert.match(none.problems.join(' '), /can’t see the verification record yet/); assert.match(none.problems.join(' '), /DMARC/)
  // Long TXT values come back in chunks.
  assert.equal((await D.checkDomain('website', 'a.in', tok, async () => [[`repx-verify=${tok.slice(0, 10)}`, tok.slice(10)]])).verified, true)
})
await test('provider records become full host names with a plain reason', () => {
  const r = E.toRecords('seaview.in', { records: [{ record: 'DKIM', name: 'resend._domainkey', type: 'TXT', value: 'p=abc' }, { record: 'SPF', name: 'send', type: 'MX', value: 'feedback-smtp.x', priority: 10 }, { record: 'X', name: 'bad', type: 'A', value: '1.2.3.4' }] })
  assert.deepEqual(r.map((x) => [x.type, x.name]), [['TXT', 'resend._domainkey.seaview.in'], ['MX', 'send.seaview.in']])
  assert.match(r[0].why, /Signs/)
})
await test('buyer-facing e-mail goes from the workspace’s own domain only when ownership and the provider both say verified', () => {
  const dal = read('lib/dal/domains.ts')
  assert.match(dal, /\.eq\('status', 'verified'\)\.eq\('provider_status', 'verified'\)\.not\('send_as', 'is', null\)/)
  assert.match(dal, /replace\(\/\["<>\\r\\n\]\/g, ''\)/, 'the workspace name cannot break the From header')
  const svc = read('lib/email/service.ts')
  assert.match(svc, /rendered\.fromOwn && row\.org_id \? await orgSender\(db, row\.org_id\)/)
  const t = read('lib/email/templates.ts')
  assert.equal((t.match(/fromOwn: true/g) ?? []).length, 3, 'site visits, campaigns and listing-owner e-mails')
})
await test('API: owners, admins and managers; audited; the lookup runs on the server', () => {
  const a = read('app/api/integrations/domains/route.ts'), b = read('app/api/integrations/domains/[domainId]/route.ts')
  for (const f of [a, b]) assert.match(f, /authorizeOrgAccess\(orgId, \[\.\.\.MANAGERS\]\)/)
  assert.match(a, /'integration\.domain_added'/); assert.match(b, /'integration\.domain_removed'/)
  assert.match(read('lib/dal/domains.ts'), /dns\.resolveTxt\(h\)/)
})
await test('customers see no platform settings or engineering jargon', () => {
  const view = read('components/integrations/IntegrationCentreView.tsx') + read('components/integrations/IntegrationHub.tsx') + read('app/(dashboard)/[orgSlug]/integrations/page.tsx')
  for (const bad of [/DEC-0\d\d/, /Stage 4[A-Z]/, /App Pending/, /Code Verified/, /Migration 2026/, /META_APP_ID|ENCRYPTION_KEY|RESEND_API_KEY/]) assert.doesNotMatch(view, bad)
})
await test('database: one row per domain and purpose, server-only', () => {
  const sql = read('supabase/migrations/20260103_domain_verifications.sql')
  assert.match(sql, /UNIQUE \(org_id, purpose, domain\)/)
  assert.match(sql, /ALTER TABLE public\.domain_verifications ENABLE ROW LEVEL SECURITY/)
  assert.match(sql, /REVOKE ALL ON public\.domain_verifications FROM PUBLIC, anon, authenticated/)
})

console.log(`\nIntegrations hub: ${passed} checks passed.`)
