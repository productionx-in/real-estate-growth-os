// tests/db-integration/p21-showroom-enquiry.test.mjs — buyer enquiries from a project's public showroom (/p/<slug>)
// against the local Supabase stack: the real route handler, the real lead pipeline. The organisation and project come
// only from the published microsite; the body cannot redirect a lead to another organisation.
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
  const { POST } = await jiti.import(path.join(root, 'app/api/microsites/[slug]/enquiry/route.ts'))
  const { NextRequest } = await import('next/server.js')
  const pg = await import('pg')
  const db = new (pg.default || pg).Client({ connectionString: DATABASE_URL })
  await db.connect()
  const one = async (s, p) => (await db.query(s, p)).rows[0]
  let ipSeq = 0
  const send = (slug, body, ip = `10.9.${RUN.charCodeAt(0) % 200}.${++ipSeq}`) =>
    POST(new NextRequest(`http://localhost/api/microsites/${slug}/enquiry`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip }, body: JSON.stringify(body) }), { params: Promise.resolve({ slug }) })

  console.log('P21 — PROJECT SHOWROOM ENQUIRIES')
  const org = (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,'developer') RETURNING id`, [`Showroom ${RUN}`, `showroom-${RUN}`])).id
  const other = (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,'developer') RETURNING id`, [`Other ${RUN}`, `other-${RUN}`])).id
  const slug = `towers-${RUN}`, draft = `draft-${RUN}`
  try {
    const proj = (await one(`INSERT INTO public.projects (org_id, name, slug, city) VALUES ($1,'Towers',$2,'Pune') RETURNING id`, [org, `t-${RUN}`])).id
    const proj2 = (await one(`INSERT INTO public.projects (org_id, name, slug, city) VALUES ($1,'Draft',$2,'Pune') RETURNING id`, [org, `d-${RUN}`])).id
    await db.query(`INSERT INTO public.project_microsites (org_id, project_id, slug, title, is_published) VALUES ($1,$2,$3,'Towers',true), ($1,$4,$5,'Draft',false)`, [org, proj, slug, proj2, draft])

    await test('a published showroom enquiry becomes a lead in that organisation, on that project, timed as a capture', async () => {
      const res = await send(slug, { name: 'Asha Rao', phone: '9876501234', email: 'asha@example.test' })
      assert.equal(res.status, 200)
      const lead = await one(`SELECT org_id, project_id, received_at, source FROM public.leads WHERE phone_e164='+919876501234' AND org_id=$1`, [org])
      assert.equal(lead.project_id, proj); assert.ok(lead.received_at, 'captured enquiry (kept even over a trial lead limit)')
    })

    await test('the body cannot choose the organisation or project (strict schema); unpublished and unknown showrooms are 404', async () => {
      assert.equal((await send(slug, { name: 'X Y', phone: '9876500000', orgId: other })).status, 400)
      assert.equal((await send(slug, { name: 'X Y', phone: '9876500000', projectId: proj2 })).status, 400)
      assert.equal((await send(draft, { name: 'X Y', phone: '9876500001' })).status, 404)
      assert.equal((await send('nope-' + RUN, { name: 'X Y', phone: '9876500002' })).status, 404)
      assert.equal((await send('Bad_Slug', { name: 'X Y', phone: '9876500003' })).status, 404)
      assert.equal(Number((await one(`SELECT count(*) n FROM public.leads WHERE org_id=$1`, [other])).n), 0)
    })

    await test('a filled honeypot is accepted silently and dropped; bad input is refused', async () => {
      assert.equal((await send(slug, { name: 'Bot', phone: '9876500004', website: 'http://spam' })).status, 200)
      assert.equal(Number((await one(`SELECT count(*) n FROM public.leads WHERE org_id=$1 AND phone_e164='+919876500004'`, [org])).n), 0)
      assert.equal((await send(slug, { name: 'A', phone: '1' })).status, 400)
    })

    await test('one network is limited to 10 enquiries per 5 minutes', async () => {
      const ip = `10.250.${RUN.charCodeAt(1) % 200}.9`
      const codes = []
      for (let i = 0; i < 11; i++) codes.push((await send(slug, { name: `Buyer ${i}`, phone: `98765${String(10000 + i)}` }, ip)).status)
      assert.deepEqual([codes.slice(0, 10).every((c) => c === 200), codes[10]], [true, 429])
    })

    console.log(`\nP21 showroom enquiries: ${passed} checks passed.`)
  } finally {
    for (const id of [org, other]) {
      await db.query('DELETE FROM public.leads WHERE org_id=$1', [id]).catch((e) => console.error('cleanup', e.message))
      await db.query('DELETE FROM public.project_microsites WHERE org_id=$1', [id]).catch(() => {})
      await db.query('DELETE FROM public.projects WHERE org_id=$1', [id]).catch(() => {})
      await db.query('DELETE FROM public.organisations WHERE id=$1', [id]).catch((e) => console.error('cleanup', e.message))
    }
    await db.end()
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
