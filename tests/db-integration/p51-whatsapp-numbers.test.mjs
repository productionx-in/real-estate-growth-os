// tests/db-integration/p51-whatsapp-numbers.test.mjs — several WhatsApp numbers in one workspace, through RE’s real
// central webhook route (signed with the app secret) on the local Supabase stack. Meta's Graph API is the only thing
// replaced. Two numbers of one business account each receive only their own buyers; a reply goes out from the number
// the conversation is on — including a number connected through Embedded Signup (selectedPhoneNumberId); another
// workspace's number never receives these messages.
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

const sentUrls = []
const realFetch = globalThis.fetch
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.url
  if (url.startsWith('https://graph.facebook.com/')) {
    sentUrls.push(url)
    return new Response(JSON.stringify({ messages: [{ id: `wamid.OUT${crypto.randomBytes(6).toString('hex')}` }] }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  return realFetch(input, init)
}

async function main() {
  if (!globalThis.WebSocket) globalThis.WebSocket = class UnusedRealtimeTransport {}
  const APP_SECRET = `central-${RUN}`
  process.env.META_APP_SECRET = APP_SECRET
  delete process.env.WHATSAPP_APP_SECRET
  const jiti = createJiti(import.meta.url, { alias: { '@': root } })
  const { encryptCredential } = await jiti.import(path.join(root, 'lib/integrations/crypto.ts'))
  const central = await jiti.import(path.join(root, 'app/api/webhooks/whatsapp/route.ts'))
  const inbox = await jiti.import(path.join(root, 'lib/dal/whatsapp-inbox.ts'))
  const pg = await import('pg')
  const db = new (pg.default || pg).Client({ connectionString: DATABASE_URL }); await db.connect()
  const one = async (s, p) => (await db.query(s, p)).rows[0]

  console.log('P51 — SEVERAL WHATSAPP NUMBERS')
  const org = (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,'developer') RETURNING id`, [`Num ${RUN}`, `num-${RUN}`])).id
  const other = (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,'developer') RETURNING id`, [`Oth ${RUN}`, `oth-${RUN}`])).id
  const WABA = `WABA-${RUN}`, P1 = `P1-${RUN}`, P2 = `P2-${RUN}`, PX = `PX-${RUN}`
  try {
    const conn = async (o, meta, name) => (await one(`INSERT INTO public.integration_connections (org_id, provider, name, status, credential_ref, metadata, external_account_id)
      VALUES ($1,'whatsapp_cloud',$2,'connected',$3,$4,$5) RETURNING id`, [o, name, encryptCredential('EAAG-test'), JSON.stringify(meta), meta.wabaId ?? null])).id
    // One number via Embedded Signup (selectedPhoneNumberId), one via the manual wizard (phone_number_id), same account.
    const sales = await conn(org, { connectedVia: 'embedded_signup', wabaId: WABA, selectedPhoneNumberId: P1, displayPhoneNumber: '+91 80000 00001' }, 'WhatsApp · Sales')
    const service = await conn(org, { wabaId: WABA, phone_number_id: P2, display_phone_number: '918000000002' }, 'WhatsApp · Service')
    const rival = await conn(other, { wabaId: `RIVAL-${RUN}`, phone_number_id: PX }, 'WhatsApp')

    const deliver = async (phoneId, from, text) => {
      const raw = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: WABA, changes: [{ field: 'messages', value: {
        messaging_product: 'whatsapp', metadata: { phone_number_id: phoneId, display_phone_number: '91800000000' },
        contacts: [{ wa_id: from, profile: { name: 'Buyer' } }],
        messages: [{ id: `wamid.IN${crypto.randomBytes(6).toString('hex')}`, from, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: text } }],
      } }] }] })
      const sig = 'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(raw).digest('hex')
      const res = await central.POST(new Request('http://localhost/api/webhooks/whatsapp', { method: 'POST', headers: { 'x-hub-signature-256': sig }, body: raw }))
      assert.equal(res.status, 200)
    }
    const convsOf = async (connId) => (await db.query(`SELECT wa_id FROM public.whatsapp_conversations WHERE connection_id=$1`, [connId])).rows.map((r) => r.wa_id)
    const asha = `91981${crypto.randomInt(1000000, 9999999)}`, ravi = `91982${crypto.randomInt(1000000, 9999999)}`

    await test('two numbers of one business account each receive only their own buyers, once', async () => {
      await deliver(P1, asha, 'Hi sales')
      await deliver(P2, ravi, 'Hi service')
      assert.deepEqual(await convsOf(sales), [asha])
      assert.deepEqual(await convsOf(service), [ravi])
      assert.equal(Number((await one(`SELECT count(*) n FROM public.whatsapp_messages m JOIN public.whatsapp_conversations c ON c.id=m.conversation_id WHERE c.org_id=$1 AND m.direction='inbound'`, [org])).n), 2)
    })

    await test('another workspace’s number never receives them, and a message to an unknown number is dropped', async () => {
      await deliver(`UNKNOWN-${RUN}`, asha, 'lost')
      assert.deepEqual(await convsOf(rival), [])
      assert.equal(Number((await one(`SELECT count(*) n FROM public.whatsapp_conversations WHERE org_id=$1`, [org])).n), 2)
    })

    await test('a reply goes out from the number the conversation is on (Embedded Signup numbers included)', async () => {
      const manager = (await one(`SELECT p.id FROM public.profiles p LIMIT 1`)).id
      const convA = (await one(`SELECT id FROM public.whatsapp_conversations WHERE connection_id=$1`, [sales])).id
      const convR = (await one(`SELECT id FROM public.whatsapp_conversations WHERE connection_id=$1`, [service])).id
      const viewer = { role: 'owner', profileId: manager }
      sentUrls.length = 0
      const a = await inbox.sendReply(org, convA, viewer, { kind: 'text', text: 'Hello from sales' })
      assert.equal(a.success, true, a.error)
      const r = await inbox.sendReply(org, convR, viewer, { kind: 'text', text: 'Hello from service' })
      assert.equal(r.success, true, r.error)
      assert.match(sentUrls[0], new RegExp(`/${P1}/messages$`))
      assert.match(sentUrls[1], new RegExp(`/${P2}/messages$`))
      const list = await inbox.listConversations(org, viewer, 'all')
      assert.deepEqual(new Set(list.map((c) => c.connectionId)), new Set([sales, service]))
    })
  } finally {
    globalThis.fetch = realFetch
    for (const id of [org, other]) {
      await db.query('DELETE FROM public.leads_all WHERE org_id=$1', [id]).catch(() => {})
      await db.query('DELETE FROM public.organisations WHERE id=$1', [id]).catch((e) => console.error('cleanup', e.message))
    }
    await db.end()
  }
  console.log(`\nSeveral WhatsApp numbers: ${passed} checks passed.`)
}
main().catch((e) => { console.error(e); process.exit(1) })
