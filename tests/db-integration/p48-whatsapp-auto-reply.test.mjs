// tests/db-integration/p48-whatsapp-auto-reply.test.mjs — WhatsApp auto-replies (20260089, Settings → WhatsApp,
// lib/integrations/whatsapp/auto-reply.ts and the processor) through the real signed webhook route on the local
// Supabase stack. Meta's Graph API is the only thing replaced. Off by default; a welcome only on a buyer's first
// message; an away message outside business hours at most every 12 hours; never for STOP/START, an opted-out buyer or
// a webhook retry; a failed send frees the claim so the next message can be answered.
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

const sent = []
const realFetch = globalThis.fetch
let metaOk = true
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.url
  if (url.startsWith('https://graph.facebook.com/')) {
    const body = JSON.parse(init.body)
    if (!metaOk) return new Response(JSON.stringify({ error: { message: 'Temporary failure', code: 2 } }), { status: 500 })
    sent.push(body)
    return new Response(JSON.stringify({ messages: [{ id: `wamid.OUT${crypto.randomBytes(6).toString('hex')}` }] }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  return realFetch(input, init)
}

async function main() {
  if (!globalThis.WebSocket) globalThis.WebSocket = class UnusedRealtimeTransport {}
  delete process.env.META_APP_SECRET
  delete process.env.WHATSAPP_APP_SECRET
  const jiti = createJiti(import.meta.url, { alias: { '@': root } })
  const { encryptCredential } = await jiti.import(path.join(root, 'lib/integrations/crypto.ts'))
  const hook = await jiti.import(path.join(root, 'app/api/webhooks/whatsapp/[connectionId]/route.ts'))
  const pg = await import('pg')
  const db = new (pg.default || pg).Client({ connectionString: DATABASE_URL }); await db.connect()
  const one = async (s, p) => (await db.query(s, p)).rows[0]

  console.log('P48 — WHATSAPP AUTO-REPLIES')
  const org = (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,'developer') RETURNING id`, [`AR ${RUN}`, `ar-${RUN}`])).id
  const APP_SECRET = `secret-${RUN}`
  try {
    const conn = (await one(`INSERT INTO public.integration_connections (org_id, provider, name, status, credential_ref, metadata)
      VALUES ($1,'whatsapp_cloud','WhatsApp','connected',$2,$3) RETURNING id`,
      [org, encryptCredential('EAAG-test-token'), JSON.stringify({ phone_number_id: 'PN-AR', appSecret: APP_SECRET })])).id
    const deliverRaw = async (raw) => {
      const sig = 'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(raw).digest('hex')
      const res = await hook.POST(new Request(`http://localhost/api/webhooks/whatsapp/${conn}`, { method: 'POST', headers: { 'x-hub-signature-256': sig }, body: raw }),
        { params: Promise.resolve({ connectionId: conn }) })
      assert.equal(res.status, 200)
    }
    const message = (from, name, text) => JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [{ id: 'WABA', changes: [{ field: 'messages', value: {
        messaging_product: 'whatsapp', metadata: { phone_number_id: 'PN-AR', display_phone_number: '918000000000' },
        contacts: [{ wa_id: from, profile: { name } }],
        messages: [{ id: `wamid.IN${crypto.randomBytes(6).toString('hex')}`, from, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: text } }],
      } }] }],
    })
    const say = (from, name, text) => deliverRaw(message(from, name, text))
    const setWhatsApp = (w) => db.query(`INSERT INTO public.org_settings (org_id, whatsapp) VALUES ($1,$2) ON CONFLICT (org_id) DO UPDATE SET whatsapp = EXCLUDED.whatsapp`, [org, JSON.stringify(w)])
    const ALWAYS_OPEN = { hoursStart: 0, hoursEnd: 24, workDays: [0, 1, 2, 3, 4, 5, 6] }
    const NEVER_OPEN = { hoursStart: 10, hoursEnd: 19, workDays: [] }
    const num = () => `91986${crypto.randomInt(1000000, 9999999)}`
    const textsTo = (to) => sent.filter((b) => b.to === to && b.type === 'text').map((b) => b.text.body)

    await test('off by default: a new enquiry gets no automatic reply', async () => {
      const a = num()
      await say(a, 'Anil Kumar', 'Is the 3 BHK available?')
      assert.deepEqual(textsTo(a), [])
    })

    await test('welcome: only on a buyer’s first message, with their first name; a webhook retry gets nothing', async () => {
      await setWhatsApp({ welcomeEnabled: true, welcomeMessage: 'Hi {{first_name}}, thanks for writing to us!', awayEnabled: false, ...ALWAYS_OPEN })
      const b = num()
      const first = message(b, 'priya sharma', 'Hello')
      await deliverRaw(first)
      assert.deepEqual(textsTo(b), ['Hi Priya, thanks for writing to us!'])
      await deliverRaw(first) // Meta retries the same webhook
      await say(b, 'priya sharma', 'Price please?')
      assert.equal(textsTo(b).length, 1, 'one welcome, ever')
      const stored = await one(`SELECT count(*) n FROM public.whatsapp_messages m JOIN public.whatsapp_conversations c ON c.id=m.conversation_id WHERE c.org_id=$1 AND c.wa_id=$2 AND m.direction='outbound'`, [org, b])
      assert.equal(Number(stored.n), 1, 'the reply is in the inbox thread')
    })

    await test('away: outside business hours, at most once every 12 hours per buyer', async () => {
      await setWhatsApp({ welcomeEnabled: true, welcomeMessage: 'Welcome!', awayEnabled: true, awayMessage: 'We are closed now, {{first_name}}. We reply from 10 am.', ...NEVER_OPEN })
      const c = num()
      await say(c, 'Rahul', 'Hi')
      await say(c, 'Rahul', 'Anyone there?')
      assert.deepEqual(textsTo(c), ['We are closed now, Rahul. We reply from 10 am.'], 'the away message replaces the welcome after hours, once')
      await db.query(`UPDATE public.whatsapp_conversations SET last_auto_reply_at = now() - interval '13 hours' WHERE org_id=$1 AND wa_id=$2`, [org, c])
      await say(c, 'Rahul', 'Morning?')
      assert.equal(textsTo(c).length, 2, 'again after 12 hours')
    })

    await test('never in answer to STOP/START, nor to a buyer who opted out', async () => {
      const d = num()
      await say(d, 'Deepa', 'STOP')
      await say(d, 'Deepa', 'what about the price')
      assert.deepEqual(textsTo(d), [])
      assert.equal((await one(`SELECT is_opted_out FROM public.whatsapp_conversations WHERE org_id=$1 AND wa_id=$2`, [org, d])).is_opted_out, true)
      await say(d, 'Deepa', 'START')
      assert.deepEqual(textsTo(d), [], 'START itself gets no automatic reply')
    })

    await test('a failed send frees the claim: the next message is answered', async () => {
      const e = num()
      metaOk = false
      await say(e, 'Esha', 'hi')
      metaOk = true
      assert.equal((await one(`SELECT last_auto_reply_at FROM public.whatsapp_conversations WHERE org_id=$1 AND wa_id=$2`, [org, e])).last_auto_reply_at, null)
      await say(e, 'Esha', 'hello?')
      assert.equal(textsTo(e).length, 1)
    })
  } finally {
    globalThis.fetch = realFetch
    await db.query('DELETE FROM public.leads_all WHERE org_id=$1', [org]).catch(() => {})
    await db.query('DELETE FROM public.organisations WHERE id=$1', [org]).catch((e) => console.error('cleanup', e.message))
    await db.end()
  }
  console.log(`\nWhatsApp auto-replies: ${passed} checks passed.`)
}
main().catch((e) => { console.error(e); process.exit(1) })
