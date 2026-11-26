// tests/db-integration/p11-website-capture.test.mjs — the website capture endpoint (app/api/capture/route.ts), the
// hosted form endpoint (app/api/forms/submit/route.ts) and website settings (lib/dal/website-capture.ts), called as
// real route handlers against the local Supabase stack.
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
  const jiti = createJiti(import.meta.url, { alias: { '@': root } })
  const capture = await jiti.import(path.join(root, 'app/api/capture/route.ts'))
  const formSubmit = await jiti.import(path.join(root, 'app/api/forms/submit/route.ts'))
  const site = await jiti.import(path.join(root, 'lib/dal/website-capture.ts'))
  const pg = await import('pg')
  const db = new (pg.default || pg).Client({ connectionString: DATABASE_URL })
  await db.connect()
  const one = async (s, p) => (await db.query(s, p)).rows[0]
  let ipN = 0
  const ip = () => `198.51.100.${(ipN++ % 250) + 1}` // a fresh network per call, so the per-IP limit is not what is tested
  const phone = () => `9${crypto.randomInt(100000000, 999999999)}`
  const send = (body, origin = 'https://skylinetowers.in', raw = false) =>
    capture.POST(new Request('http://localhost/api/capture', {
      method: 'POST', headers: { 'content-type': 'text/plain', origin, 'x-forwarded-for': ip() }, body: raw ? body : JSON.stringify(body),
    }))
  const leadBy = (p) => one(`SELECT id, org_id, name, email, source, source_url, connection_id, campaign_name, source_metadata FROM public.leads WHERE phone LIKE '%' || $1`, [p.slice(-10)])

  console.log('P11 — WEBSITE CAPTURE')
  const org = (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,'developer') RETURNING id`, [`Web ${RUN}`, `web-${RUN}`])).id
  const other = (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,'developer') RETURNING id`, [`Web2 ${RUN}`, `web2-${RUN}`])).id
  try {
    const uid = crypto.randomUUID()
    await db.query(`INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
      VALUES ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),now(),now(),'{}','{"full_name":"Web Owner"}')`, [uid, `web-${RUN}@repx.test`])
    const owner = (await one('SELECT id FROM public.profiles WHERE auth_user_id=$1', [uid])).id
    await db.query(`INSERT INTO public.org_members (org_id, profile_id, role) VALUES ($1,$2,'owner'),($3,$2,'owner')`, [org, owner, other])

    let key
    await test('switching website enquiries on needs at least one domain; saving creates one website connection', async () => {
      const refused = await site.saveWebsiteSettings(org, owner, { domains: [], enabled: true })
      assert.deepEqual([refused.success, refused.status], [false, 400])
      const ok = await site.saveWebsiteSettings(org, owner, { domains: ['skylinetowers.in', '*.skyline.co.in'], enabled: true })
      assert.equal(ok.success, true, ok.error)
      key = ok.data.connectionId
      assert.deepEqual([ok.data.enabled, ok.data.domains], [true, ['skylinetowers.in', '*.skyline.co.in']])
      const again = await site.saveWebsiteSettings(org, owner, { domains: ['skylinetowers.in', '*.skyline.co.in'], enabled: true })
      assert.equal(again.data.connectionId, key, 'saving again updates the same connection')
      assert.equal((await one(`SELECT count(*)::int n FROM public.integration_connections WHERE org_id=$1 AND provider='website_webhook'`, [org])).n, 1)
    })

    await test('a captured form becomes a lead with where the visitor came from', async () => {
      const p = phone()
      const res = await send({
        key, token: crypto.randomUUID(), name: 'Priya Sharma', phone: p, email: 'priya@buyer.test', notes: '3 BHK please', budget: '₹1–1.5 Cr',
        pageUrl: 'https://skylinetowers.in/contact', pageTitle: 'Contact — Skyline', pages: 4, fillMs: 9000,
        first: { utm_source: 'google', utm_campaign: 'diwali', gclid: 'g-1', landing: 'https://skylinetowers.in/?gclid=g-1', referrer: 'https://www.google.com/', at: new Date().toISOString() },
        last: { utm_source: 'facebook', utm_campaign: 'retarget', fbclid: 'f-1', landing: 'https://skylinetowers.in/offers?fbclid=f-1', at: new Date().toISOString() },
      })
      assert.equal(res.status, 200, JSON.stringify(await res.clone().json()))
      const body = await res.json()
      assert.deepEqual(Object.keys(body).sort(), ['message', 'success'], 'no internal ids are returned')
      const lead = await leadBy(p)
      assert.ok(lead, 'lead created')
      assert.deepEqual([lead.org_id, lead.connection_id, lead.source_url, lead.campaign_name], [org, key, 'https://skylinetowers.in/contact', 'retarget'])
      const m = lead.source_metadata
      assert.equal(m.ingested_via, 'website_capture')
      assert.equal(m.ad_platform, 'meta_ads', 'latest visit came from a Facebook ad')
      assert.equal(m.first_touch.gclid, 'g-1')
      assert.equal(m.last_touch.utm_campaign, 'retarget')
      assert.equal(m.pages_viewed, 4)
      assert.equal(m.budget_range, '₹1–1.5 Cr')
    })

    await test('subdomains match a *.domain entry; any other website is refused and nothing is stored', async () => {
      const p1 = phone()
      assert.equal((await send({ key, name: 'Sub', phone: p1, fillMs: 5000 }, 'https://offers.skyline.co.in')).status, 200)
      assert.ok(await leadBy(p1))
      const p2 = phone()
      assert.equal((await send({ key, name: 'Copycat', phone: p2, fillMs: 5000 }, 'https://evil.example')).status, 403)
      assert.equal((await send({ key, name: 'Lookalike', phone: p2, fillMs: 5000 }, 'https://skylinetowers.in.evil.example')).status, 403)
      assert.equal(await leadBy(p2), undefined)
    })

    await test('only the known fields are read: no organisation switch, no extra fields, no unsafe links', async () => {
      const p = phone()
      const res = await send({ key, name: 'Ravi', phone: p, fillMs: 5000, org_id: other, password: 'hunter2', role: 'owner',
        pageUrl: 'javascript:alert(document.cookie)', first: { landing: 'javascript:alert(1)', evil: 'x' } })
      assert.equal(res.status, 200)
      const lead = await leadBy(p)
      assert.equal(lead.org_id, org)
      assert.equal(lead.source_url, null)
      const raw = JSON.stringify(lead.source_metadata)
      for (const s of ['hunter2', 'javascript:', other, '"evil"']) assert.ok(!raw.includes(s), `${s} is not stored`)
    })

    await test('a phone-only form still creates a lead (named "Website visitor"); no phone or email is refused', async () => {
      const p = phone()
      assert.equal((await send({ key, phone: p, fillMs: 5000 })).status, 200)
      assert.equal((await leadBy(p)).name, 'Website visitor')
      assert.equal((await send({ key, name: 'Nobody', fillMs: 5000 })).status, 400)
    })

    await test('bots: a filled honeypot or a form filled in under 1.2 s is answered "thanks" but stores nothing', async () => {
      const p1 = phone(), p2 = phone()
      assert.equal((await send({ key, name: 'Bot', phone: p1, hp: '1', fillMs: 5000 })).status, 200)
      assert.equal((await send({ key, name: 'Fast', phone: p2, fillMs: 300 })).status, 200)
      assert.equal(await leadBy(p1), undefined)
      assert.equal(await leadBy(p2), undefined)
    })

    await test('the same submission sent twice (same token) creates one lead', async () => {
      const p = phone(), token = crypto.randomUUID()
      await send({ key, token, name: 'Twice', phone: p, fillMs: 5000 })
      await send({ key, token, name: 'Twice', phone: p, fillMs: 5000 })
      assert.equal((await one(`SELECT count(*)::int n FROM public.leads WHERE phone LIKE '%' || $1`, [p])).n, 1)
    })

    await test('bad payloads: not JSON, too large, or no valid key → 400', async () => {
      assert.equal((await send('not json', undefined, true)).status, 400)
      assert.equal((await send({ key, name: 'x'.repeat(20_000), phone: phone() })).status, 400)
      assert.equal((await send({ key: 'conn_website_default', name: 'A', phone: phone() })).status, 400)
      assert.equal((await send({ key: crypto.randomUUID(), name: 'A', phone: phone(), fillMs: 5000 })).status, 404)
    })

    await test('capture is refused when no domain is listed (the hosted form keeps its old rule)', async () => {
      await db.query(`UPDATE public.integration_connections SET metadata = metadata - 'allowedDomains' WHERE id=$1`, [key])
      const p = phone()
      assert.equal((await send({ key, name: 'NoDomains', phone: p, fillMs: 5000 })).status, 403)
      assert.equal(await leadBy(p), undefined)
      await site.saveWebsiteSettings(org, owner, { domains: ['skylinetowers.in', '*.skyline.co.in'], enabled: true })
    })

    await test('switched off → refused; another organisation\'s settings never touch this connection', async () => {
      await site.saveWebsiteSettings(other, owner, { domains: ['other.in'], enabled: true })
      const status = await site.getWebsiteStatus(org)
      assert.deepEqual([status.connectionId, status.domains], [key, ['skylinetowers.in', '*.skyline.co.in']])
      assert.ok(status.enquiries30d >= 4 && status.lastEnquiryAt)
      await site.saveWebsiteSettings(org, owner, { domains: ['skylinetowers.in'], enabled: false })
      assert.equal((await send({ key, name: 'Off', phone: phone(), fillMs: 5000 })).status, 400)
      await site.saveWebsiteSettings(org, owner, { domains: ['skylinetowers.in'], enabled: true })
    })

    await test('the hosted enquiry form still works through the shared checks (and also stores no unsafe link)', async () => {
      const p = phone()
      const res = await formSubmit.POST(new Request('http://localhost/api/forms/submit', {
        method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://skylinetowers.in', 'x-forwarded-for': ip() },
        body: JSON.stringify({ connectionId: key, name: 'Form User', phone: p, formLoadTime: Date.now() - 5000, pageUrl: 'javascript:alert(1)' }),
      }))
      assert.equal(res.status, 200)
      const lead = await leadBy(p)
      assert.deepEqual([lead.org_id, lead.source_url, lead.source_metadata.ingested_via], [org, null, 'website_enquiry_form'])
      const blocked = await formSubmit.POST(new Request('http://localhost/api/forms/submit', {
        method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example', 'x-forwarded-for': ip() },
        body: JSON.stringify({ connectionId: key, name: 'Form User', phone: phone(), formLoadTime: Date.now() - 5000 }),
      }))
      assert.equal(blocked.status, 403)
    })

    console.log(`\nP11 website capture: ${passed} checks passed.`)
  } finally {
    for (const id of [org, other]) {
      await db.query('DELETE FROM public.leads WHERE org_id=$1', [id]).catch(() => {})
      await db.query('DELETE FROM public.organisations WHERE id=$1', [id]).catch(() => {})
    }
    await db.end()
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
