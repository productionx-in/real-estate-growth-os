// tests/website-capture.test.mjs
// The website capture script (/capture.js) and the server-side cleaning of what it sends.
// The script runs here in a small fake browser (node:vm), so these checks run in CI without a real browser.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const { CAPTURE_SCRIPT } = await jiti.import(path.join(root, 'lib/integrations/website/capture-script.ts'))
const attr = await jiti.import(path.join(root, 'lib/integrations/website/attribution.ts'))
const dom = await jiti.import(path.join(root, 'lib/integrations/website/domains.ts'))
const { normalizeWebsiteEnquiry } = await jiti.import(path.join(root, 'lib/integrations/forms/normalizer.ts'))

let passed = 0
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`) }
const KEY = '7b0c7a52-1f43-4e3b-9a55-2c1d1f8e6a10'

// ── A small fake browser ──────────────────────────────────────────────────────────────────────────────
function field(attrs, value = '') {
  const a = { ...attrs }
  return {
    tagName: (a.tag ?? 'input').toUpperCase(), type: a.type ?? (a.tag === 'textarea' || a.tag === 'select' ? '' : 'text'),
    name: a.name ?? '', id: a.id ?? '', value, disabled: false, labels: a.label ? [{ textContent: a.label }] : [],
    options: a.options, selectedIndex: a.selectedIndex ?? 0,
    getAttribute: (k) => (k in a ? a[k] : null), hasAttribute: (k) => k in a,
    closest: (sel) => (sel.split(',').some((x) => x.slice(1, -1) in a) ? {} : null),
  }
}
function form(fields, attrs = {}) {
  const f = {
    tagName: 'FORM', elements: fields,
    getAttribute: (k) => (k in attrs ? attrs[k] : null), hasAttribute: (k) => k in attrs,
    closest: (sel) => (sel.split(',').some((x) => x.slice(1, -1) in attrs) ? {} : null),
  }
  for (const el of fields) el.form = f
  return f
}
function browser({ url = 'https://skylinetowers.in/', referrer = '', tagAttrs = {}, store = {} } = {}) {
  const listeners = {}
  const beacons = []
  const u = new URL(url)
  const storage = { ...store }
  const tag = { src: 'https://re.productionx.in/capture.js', getAttribute: (k) => ({ 'data-re-key': KEY, ...tagAttrs })[k] ?? null }
  const document = {
    currentScript: tag, referrer, title: 'Skyline Towers — 3 BHK',
    querySelectorAll: () => [tag],
    addEventListener: (t, fn) => { (listeners[t] ??= []).push(fn) },
  }
  const window = {
    location: { href: u.href, search: u.search, hostname: u.hostname },
    localStorage: { getItem: (k) => (k in storage ? storage[k] : null), setItem: (k, v) => { storage[k] = String(v) }, removeItem: (k) => { delete storage[k] } },
    navigator: { sendBeacon: (endpoint, blob) => { beacons.push({ endpoint, blob }); return true } },
    crypto: { randomUUID: () => '11111111-2222-4333-8444-555555555555' },
    fetch: () => { throw new Error('fetch should not be needed when sendBeacon works') },
  }
  const ctx = vm.createContext({ window, document, URL, Blob, WeakMap, JSON, Date, Math, Object, Array, String, decodeURIComponent })
  vm.runInContext(CAPTURE_SCRIPT, ctx)
  const submit = (f) => { for (const fn of listeners.submit ?? []) fn({ target: f }) }
  const focus = (el) => { for (const fn of listeners.focusin ?? []) fn({ target: el }) }
  const sent = async () => Promise.all(beacons.map(async (b) => ({ endpoint: b.endpoint, type: b.blob.type, body: JSON.parse(await b.blob.text()) })))
  return { window, storage, submit, focus, sent, REbyPX: window.REbyPX, REGrow: window.REGrow }
}
const enquiryForm = (extra = []) => form([
  field({ name: 'your-name', label: 'Full name' }, 'Priya Sharma'),
  field({ type: 'tel', name: 'mobile' }, '+91 98450 12345'),
  field({ type: 'email', name: 'email' }, 'priya@buyer.test'),
  field({ tag: 'textarea', name: 'message' }, 'Looking for a 3 BHK, east facing'),
  field({ tag: 'select', name: 'budget', options: [{ value: '', text: 'Select' }, { value: '1-1.5', text: '₹1–1.5 Cr' }], selectedIndex: 1 }),
  field({ type: 'hidden', name: 'csrf' }, 'secret-token'),
  field({ name: 'company' }, 'Acme'),
  ...extra,
])

console.log('WEBSITE CAPTURE')

{
  const b = browser({ url: 'https://skylinetowers.in/3bhk?utm_source=google&utm_campaign=diwali&gclid=abc123' })
  b.submit(enquiryForm())
  const [s] = await b.sent()
  assert.equal(s.endpoint, 'https://re.productionx.in/api/capture')
  assert.equal(s.type, 'text/plain')
  assert.deepEqual(
    { name: s.body.name, phone: s.body.phone, email: s.body.email, notes: s.body.notes, budget: s.body.budget, key: s.body.key },
    { name: 'Priya Sharma', phone: '+91 98450 12345', email: 'priya@buyer.test', notes: 'Looking for a 3 BHK, east facing', budget: '₹1–1.5 Cr', key: KEY }
  )
  assert.ok(!JSON.stringify(s.body).includes('secret-token'), 'hidden fields are never sent')
  assert.ok(!JSON.stringify(s.body).includes('Acme'), 'unrecognised fields are never sent')
  assert.deepEqual(Object.keys(s.body).sort(), ['budget', 'email', 'fillMs', 'first', 'formId', 'hp', 'key', 'last', 'name', 'notes', 'pageTitle', 'pageUrl', 'pages', 'phone', 'projectId', 'token', 'unit'])
  assert.equal(s.body.first.utm_campaign, 'diwali')
  assert.equal(s.body.first.gclid, 'abc123')
  assert.equal(s.body.first.landing, 'https://skylinetowers.in/3bhk?utm_source=google&utm_campaign=diwali&gclid=abc123')
  passed++; console.log('  ✓ a site form is captured: only name, phone, email, message, budget — sent as text/plain to /api/capture')
}

{
  // First visit from Google, a later visit from Facebook: both remembered across pages.
  const first = browser({ url: 'https://skylinetowers.in/?utm_source=google&gclid=g1', referrer: 'https://www.google.com/' })
  const later = browser({ url: 'https://skylinetowers.in/offers?fbclid=f9', referrer: 'https://l.facebook.com/', store: first.storage })
  const inside = browser({ url: 'https://skylinetowers.in/contact', referrer: 'https://skylinetowers.in/offers', store: later.storage })
  inside.submit(enquiryForm())
  const [s] = await inside.sent()
  assert.equal(s.body.first.gclid, 'g1')
  assert.equal(s.body.first.referrer, 'https://www.google.com/')
  assert.equal(s.body.last.fbclid, 'f9')
  assert.equal(s.body.last.landing, 'https://skylinetowers.in/offers?fbclid=f9')
  assert.equal(s.body.pages, 3)
  assert.equal(s.body.pageUrl, 'https://skylinetowers.in/contact')
  passed++; console.log('  ✓ first visit and latest campaign visit are remembered across pages; internal navigation changes neither')
}

{
  const b = browser()
  b.submit(enquiryForm([field({ type: 'password', name: 'pwd' }, 'hunter2')]))
  b.submit(form([field({ name: 'name' }, 'Ravi'), field({ type: 'tel', name: 'phone' }, '9845012345'), field({ name: 'card_number', autocomplete: 'cc-number' }, '4111111111111111')]))
  b.submit(form([field({ name: 'name' }, 'Ravi'), field({ type: 'tel', name: 'phone' }, '9845012345'), field({ name: 'otp' }, '123456')]))
  b.submit(form([field({ name: 'q', type: 'search' }, 'flats')])) // a search box: no phone or email
  b.submit(form(enquiryForm().elements, { 'data-regrow-ignore': '' }))
  b.submit(form(enquiryForm().elements, { 'data-re-ignore': '' }))
  assert.equal((await b.sent()).length, 0)
  passed++; console.log('  ✓ never reads forms with a password, card or OTP field, forms without a phone/email, or ignored forms')
}

{
  const b = browser({ tagAttrs: { 'data-regrow-forms': 'marked', 'data-regrow-project': 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' } })
  b.submit(enquiryForm())
  assert.equal((await b.sent()).length, 0, 'unmarked form skipped in "marked" mode')
  b.submit(form(enquiryForm().elements, { 'data-regrow-form': 'brochure' }))
  const [s] = await b.sent()
  assert.deepEqual([s.body.formId, s.body.projectId], ['brochure', 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'])
  passed++; console.log('  ✓ "only marked forms" mode and the project option')
}

{
  const b = browser()
  const f = form([field({ name: 'first_name' }, 'Arjun'), field({ name: 'last_name' }, 'Nair'), field({ name: 'phone_number' }, '9845012346'),
    field({ name: 'website', 'data-regrow-honeypot': '' }, 'http://spam.example')])
  b.submit(f)
  b.submit(f) // double submit
  const sent = await b.sent()
  assert.equal(sent.length, 1, 'a double submit is sent once')
  assert.deepEqual([sent[0].body.name, sent[0].body.hp], ['Arjun Nair', '1'])
  passed++; console.log('  ✓ first + last name are joined; a filled honeypot is flagged; double submits are sent once')
}

{
  const b = browser()
  assert.equal(b.REbyPX.capture({ name: 'Meera', message: 'Call me' }), false, 'needs a phone or email')
  assert.equal(b.REbyPX.capture({ name: 'Meera', phone: '9845012347', message: 'Call me' }), true)
  assert.equal(b.REGrow, b.REbyPX, 'old installs still reach the same API')
  b.REbyPX.optOut()
  assert.equal(b.REbyPX.capture({ name: 'Meera', phone: '9845012348' }), false)
  b.submit(enquiryForm())
  const sent = await b.sent()
  assert.equal(sent.length, 1)
  assert.deepEqual([sent[0].body.notes, sent[0].body.formId], ['Call me', 'script'])
  assert.equal(b.storage.regrow_attr_v1, undefined, 'opting out clears the stored visit details')
  passed++; console.log('  ✓ REbyPX.capture() for JavaScript forms (window.REGrow kept for old installs); REbyPX.optOut() stops capture and clears stored details')
}

{
  const b = browser()
  const name = field({ name: 'name' }, 'Kavya')
  const f = form([name, field({ type: 'tel', name: 'phone' }, '9845012349')])
  b.focus(name)
  b.submit(f)
  const [s] = await b.sent()
  assert.ok(s.body.fillMs >= 0 && s.body.fillMs < 1000)
  passed++; console.log('  ✓ fill time is measured on the device (from first touching the form), not by comparing clocks')
}

test('URLs: only http(s) survive; credentials are stripped', () => {
  assert.equal(attr.safeHttpUrl('javascript:alert(1)'), null)
  assert.equal(attr.safeHttpUrl('JaVaScRiPt:alert(1)'), null)
  assert.equal(attr.safeHttpUrl('data:text/html,<script>alert(1)</script>'), null)
  assert.equal(attr.safeHttpUrl('https://user:pw@site.in/a?b=1'), 'https://site.in/a?b=1')
  assert.equal(attr.safeHttpUrl('not a url'), null)
  assert.equal(attr.safeHttpUrl('https://x.in/' + 'a'.repeat(2000)), null)
})

test('visit details: unknown keys dropped, values capped, timestamps sane, ad platform from click IDs', () => {
  const t = attr.cleanTouch({ utm_source: 'g'.repeat(500), gclid: 'x', evil: 'y', landing: 'javascript:alert(1)', at: '2999-01-01T00:00:00Z' })
  assert.deepEqual(Object.keys(t).sort(), ['gclid', 'utm_source'])
  assert.equal(t.utm_source.length, 200)
  assert.equal(attr.adPlatform({ fbclid: '1' }), 'meta_ads')
  assert.equal(attr.adPlatform({ utm_source: 'google' }), null)
  assert.equal(attr.cleanTouch('nope'), null)
})

test('lead page rows link only http(s) URLs', () => {
  const rows = attr.visitDetails({ ad_platform: 'google_ads', last_touch: { utm_campaign: 'diwali', referrer: 'javascript:alert(1)' },
    first_touch: { landing: 'https://skylinetowers.in/a', at: '2026-11-01T10:00:00Z' }, referrer_url: 'https://www.google.com/', pages_viewed: 4 })
  assert.deepEqual(rows.map((r) => r.label), ['Came from an ad', 'UTM campaign', 'Referred by', 'First visit landed on', 'First visit', 'Pages viewed'])
  for (const r of rows) if (r.href) assert.match(r.href, /^https?:\/\//)
  assert.deepEqual(attr.visitDetails(null), [])
})

test('website enquiries: a javascript: page URL is never stored as a link', () => {
  const n = normalizeWebsiteEnquiry({ name: 'A', phone: '9845012345', pageUrl: 'javascript:alert(document.cookie)', referrer: 'data:x' }, { connectionId: KEY })
  assert.equal(n.sourceUrl, null)
  assert.equal(n.sourceMetadata.landing_page_url, null)
  assert.equal(n.sourceMetadata.referrer_url, null)
})

test('allowed domains: pasted URLs become hostnames; wildcards ok; bare words, IPs and "*" refused', () => {
  assert.equal(dom.normalizeDomain('https://www.SkylineTowers.in/contact?x=1'), 'www.skylinetowers.in')
  assert.equal(dom.normalizeDomain('*.skyline.co.in'), '*.skyline.co.in')
  for (const bad of ['*', 'localhost', '192.168.1.10', 'exa mple.com', '-bad.com', 'javascript:alert(1)']) assert.equal(dom.normalizeDomain(bad), null, bad)
  assert.deepEqual(dom.parseDomainList('a.in, b.in\nA.in  bad'), { domains: ['a.in', 'b.in'], invalid: ['bad'] })
})

test('both public endpoints share one set of checks; capture only works for listed domains; the lead page links safely', () => {
  const read = (f) => fs.readFileSync(path.join(root, f), 'utf8')
  assert.match(read('app/api/forms/submit/route.ts'), /ingestWebsiteEnquiry\(body, \{ origin, clientIp, mode: 'form' \}\)/)
  assert.match(read('app/api/capture/route.ts'), /mode: 'capture'/)
  assert.match(read('lib/integrations/forms/ingest.ts'), /ctx\.mode === 'capture' && allowedDomains\.length === 0/)
  const lead = read('app/(dashboard)/[orgSlug]/leads/[leadId]/page.tsx')
  assert.doesNotMatch(lead, /href=\{lead\.source_url\}/)
  assert.match(lead, /safeHttpUrl\(lead\.source_url\)/)
})

console.log(`\nWebsite capture: ${passed} checks passed.`)
