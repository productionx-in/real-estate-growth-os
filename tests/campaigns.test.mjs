// tests/campaigns.test.mjs — marketing campaigns (lib/campaigns/rules.ts, lib/dal/campaigns.ts, app/api/campaigns,
// app/u, the outbox template). Opt-outs, duplicates and junk must never be sent to; the unsubscribe page must not
// change anything on a plain visit (mail scanners open links); every route authorises and audits.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const R = await jiti.import(path.join(root, 'lib/campaigns/rules.ts'))
const L = await jiti.import(path.join(root, 'lib/email/layout.ts'))
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')

let passed = 0
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`) }
console.log('CAMPAIGNS')

test('addresses: e-mail lower-cased and checked; Indian numbers get 91; anything unclear is refused', () => {
  assert.equal(R.normalizeEmailAddress(' Asha@Example.COM '), 'asha@example.com')
  assert.equal(R.normalizeEmailAddress('not-an-email'), null)
  assert.equal(R.normalizeWhatsAppNumber('98765 43210'), '919876543210')
  assert.equal(R.normalizeWhatsAppNumber('098765-43210'), '919876543210')
  assert.equal(R.normalizeWhatsAppNumber('+91 98765 43210'), '919876543210')
  assert.equal(R.normalizeWhatsAppNumber('+1 (415) 555-0100'), '14155550100')
  assert.equal(R.normalizeWhatsAppNumber('12345'), null)
  assert.equal(R.normalizeWhatsAppNumber('5550100'), null, 'no country code, not Indian: refused rather than guessed')
})

test('recipients: one per address, first lead wins; junk, opted-out and address-less leads are recorded, not sent', () => {
  const plan = R.planRecipients('email', [
    { leadId: '1', name: 'asha rao', email: 'a@x.test', phone: null, status: 'new' },
    { leadId: '2', name: 'Asha', email: 'A@X.test', phone: null, status: 'qualified' },
    { leadId: '3', name: 'Bala', email: 'b@x.test', phone: null, status: 'junk' },
    { leadId: '4', name: 'Chitra', email: 'c@x.test', phone: null, status: 'new' },
    { leadId: '5', name: 'Dev', email: '', phone: null, status: 'new' },
    { leadId: '6', name: 'Esha', email: 'bad', phone: null, status: 'new' },
  ], new Set(['c@x.test']))
  assert.deepEqual(plan.map((p) => [p.leadId, p.status, p.skipReason]), [
    ['1', 'queued', null], ['2', 'skipped', 'duplicate'], ['3', 'skipped', 'junk'], ['4', 'skipped', 'opted_out'], ['5', 'skipped', 'no_address'], ['6', 'skipped', 'invalid_address'],
  ])
  assert.equal(plan[0].firstName, 'Asha')
  assert.equal(new Set(plan.map((p) => p.address)).size, plan.length, 'addresses are unique per campaign')
})

test('personalisation: only {{first_name}}; a missing name reads naturally; WhatsApp fills at most one blank', () => {
  assert.equal(R.personalise('Hi {{ first_name }}!', 'Priya'), 'Hi Priya!')
  assert.equal(R.personalise('Hi {{first_name}}!', null), 'Hi there!')
  assert.deepEqual(R.unknownPlaceholders('{{first_name}} {{price}} {{ name }}'), ['price', 'name'])
  assert.equal(R.firstNameOf('9876543210'), null)
  assert.deepEqual(R.whatsappParams(0, 'A'), [])
  assert.deepEqual(R.whatsappParams(1, null), ['there'])
  assert.equal(R.whatsappParams(2, 'A'), null)
})

test('only owners, admins and managers run campaigns', () => {
  for (const r of ['owner', 'admin', 'manager']) assert.equal(R.canRunCampaigns(r), true)
  for (const r of ['team_lead', 'sales_exec', 'post_sales', 'readonly', null]) assert.equal(R.canRunCampaigns(r), false)
})

test('marketing e-mail: the sender’s text is escaped, and the footer carries the unsubscribe link', () => {
  const m = L.renderEmail({ preheader: 'x', heading: '<b>Hi</b>', paragraphs: ['<script>alert(1)</script> & more'], unsubscribeUrl: 'https://app.test/u/abc' })
  assert.doesNotMatch(m.html, /<script>|<b>Hi<\/b>/)
  assert.match(m.html, /&lt;script&gt;/)
  assert.match(m.html, /href="https:\/\/app\.test\/u\/abc"[^>]*>Unsubscribe from these e-mails/)
  assert.match(m.text, /Unsubscribe from these e-mails: https:\/\/app\.test\/u\/abc/)
  assert.throws(() => L.renderEmail({ preheader: 'x', heading: 'h', paragraphs: [], unsubscribeUrl: 'javascript:alert(1)' }))
})

test('every campaign route authorises the organisation, validates ids and audits the change', () => {
  for (const f of ['app/api/campaigns/route.ts', 'app/api/campaigns/[campaignId]/route.ts', 'app/api/campaigns/[campaignId]/send/route.ts', 'app/api/campaigns/[campaignId]/cancel/route.ts']) {
    const src = read(f)
    assert.match(src, /authorizeOrgAccess\(/, f); assert.match(src, /auditMember\(/, f); assert.match(src, /\.uuid\(\)/, f)
    assert.doesNotMatch(src, /createServiceClient/, `${f} goes through the DAL`)
  }
  assert.match(read('app/api/campaigns/[campaignId]/preview/route.ts'), /authorizeOrgAccess\(/)
  assert.match(read('app/api/campaigns/[campaignId]/send/route.ts'), /consent: z\.literal\(true/)
  assert.match(read('app/api/campaigns/[campaignId]/send/route.ts'), /checkDistributedRateLimit/)
})

test('unsubscribe: public by link only, nothing changes on a visit, the button posts; rate-limited', () => {
  const page = read('app/u/[token]/page.tsx')
  assert.doesNotMatch(page, /\bunsubscribe\(/, 'the page only reads (unsubscribeTarget)')
  assert.match(page, /method="post" action="\/api\/unsubscribe"/)
  assert.match(page, /robots: \{ index: false/)
  const api = read('app/api/unsubscribe/route.ts')
  assert.match(api, /export async function POST/); assert.doesNotMatch(api, /export async function GET/)
  assert.match(api, /checkDistributedRateLimit/)
  assert.match(read('proxy.ts'), /\^\\\/u\\\/\[0-9a-f-\]\{36\}\$/)
})

test('wiring: the job is registered, WhatsApp STOP/START feed the opt-out list, the outbox renders campaign e-mails', () => {
  assert.match(read('lib/jobs/handlers.ts'), /'campaign\.send': sendCampaignBatch/)
  assert.match(read('lib/integrations/whatsapp/processor.ts'), /recordWhatsAppConsent\(connection\.org_id, waId, consentResult\.isOptOutKeyword\)/)
  const tpl = read('lib/email/templates.ts')
  assert.match(tpl, /'campaign\.email'/)
  assert.match(tpl, /if \(sup\) return \{ skip: 'The recipient unsubscribed\.' \}/)
  assert.match(tpl, /if \(c\.status === 'cancelled'\) return \{ skip/)
})

test('the migration: RLS on, no client access, marketing outbox category, opt-out check before every send', () => {
  const sql = read('supabase/migrations/20260088_campaigns.sql')
  for (const t of ['marketing_suppressions', 'campaigns', 'campaign_recipients']) assert.match(sql, new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY`))
  assert.match(sql, /REVOKE ALL ON public\.marketing_suppressions, public\.campaigns, public\.campaign_recipients FROM PUBLIC, anon, authenticated/)
  assert.doesNotMatch(sql, /TO authenticated/)
  assert.match(sql, /'staff', 'marketing'\)/)
  assert.match(read('lib/dal/campaigns.ts'), /if \(suppressed\.has\(r\.address\)\) \{ await done\(\{ status: 'skipped', skip_reason: 'opted_out' \}\)/)
})

console.log(`\nCampaigns: ${passed} checks passed.`)
