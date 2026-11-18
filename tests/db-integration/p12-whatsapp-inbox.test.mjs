// tests/db-integration/p12-whatsapp-inbox.test.mjs — the WhatsApp inbox (migration 20260051, lib/dal/whatsapp-inbox.ts,
// the processor and the real webhook + reply routes) against the local Supabase stack. Meta's Graph API is the only
// thing replaced: calls to graph.facebook.com are answered here and recorded; everything else is real.
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

// Meta Graph API stand-in: everything else goes to the real network (Supabase).
const metaCalls = []
const realFetch = globalThis.fetch
let metaReply = () => ({ status: 200, body: { messages: [{ id: `wamid.OUT${crypto.randomBytes(6).toString('hex')}` }] } })
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.url
  if (url.startsWith('https://graph.facebook.com/')) {
    metaCalls.push({ url, auth: init?.headers?.Authorization, body: JSON.parse(init.body) })
    const r = metaReply()
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json' } })
  }
  return realFetch(input, init)
}

async function main() {
  if (!globalThis.WebSocket) globalThis.WebSocket = class UnusedRealtimeTransport {}
  delete process.env.META_APP_SECRET
  delete process.env.WHATSAPP_APP_SECRET
  const jiti = createJiti(import.meta.url, { alias: { '@': root } })
  const inbox = await jiti.import(path.join(root, 'lib/dal/whatsapp-inbox.ts'))
  const { encryptCredential } = await jiti.import(path.join(root, 'lib/integrations/crypto.ts'))
  const hook = await jiti.import(path.join(root, 'app/api/webhooks/whatsapp/[connectionId]/route.ts'))
  const centralHook = await jiti.import(path.join(root, 'app/api/webhooks/whatsapp/route.ts'))
  const pg = await import('pg')
  const db = new (pg.default || pg).Client({ connectionString: DATABASE_URL })
  await db.connect()
  const one = async (s, p) => (await db.query(s, p)).rows[0]
  const mkProfile = async (n) => {
    const id = crypto.randomUUID()
    await db.query(`INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
      VALUES ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),now(),now(),'{}',$3)`, [id, `${n}-${RUN}@regrow.test`, JSON.stringify({ full_name: n })])
    return (await one('SELECT id FROM public.profiles WHERE auth_user_id=$1', [id])).id
  }

  console.log('P12 — WHATSAPP INBOX')
  const org = (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,'developer') RETURNING id`, [`WA ${RUN}`, `wa-${RUN}`])).id
  const other = (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,'developer') RETURNING id`, [`WA2 ${RUN}`, `wa2-${RUN}`])).id
  const APP_SECRET = `secret-${RUN}`
  try {
    const manager = await mkProfile('Meera Manager')
    const asha = await mkProfile('Asha Exec')
    const kiran = await mkProfile('Kiran Exec')
    const viewer = await mkProfile('Rita Readonly')
    for (const [p, role] of [[manager, 'manager'], [asha, 'sales_exec'], [kiran, 'sales_exec'], [viewer, 'readonly']]) {
      await db.query(`INSERT INTO public.org_members (org_id, profile_id, role) VALUES ($1,$2,$3)`, [org, p, role])
    }
    const conn = (await one(`INSERT INTO public.integration_connections (org_id, provider, name, status, credential_ref, metadata)
      VALUES ($1,'whatsapp_cloud','WhatsApp','connected',$2,$3) RETURNING id`,
      [org, encryptCredential('EAAG-test-token'), JSON.stringify({ phone_number_id: 'PN-1', appSecret: APP_SECRET })])).id
    await db.query(`INSERT INTO public.whatsapp_templates (org_id, connection_id, template_name, language, category, status, components) VALUES
      ($1,$2,'visit_reminder','en','UTILITY','APPROVED',$3), ($1,$2,'promo_draft','en','MARKETING','PENDING','[]')`,
      [org, conn, JSON.stringify([{ type: 'BODY', text: 'Hi {{1}}, your visit to {{2}} is confirmed.' }])])

    const M = { role: 'manager', profileId: manager }, A = { role: 'sales_exec', profileId: asha }
    const K = { role: 'sales_exec', profileId: kiran }, R = { role: 'readonly', profileId: viewer }

    // A real signed webhook post from "Meta".
    const deliver = async (payload, secret = APP_SECRET) => {
      const raw = JSON.stringify(payload)
      const sig = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex')
      return hook.POST(new Request(`http://localhost/api/webhooks/whatsapp/${conn}`, { method: 'POST', headers: { 'x-hub-signature-256': sig }, body: raw }),
        { params: Promise.resolve({ connectionId: conn }) })
    }
    const inbound = (from, name, text, at = Math.floor(Date.now() / 1000), type = 'text') => ({
      object: 'whatsapp_business_account',
      entry: [{ id: 'WABA', changes: [{ field: 'messages', value: {
        messaging_product: 'whatsapp', metadata: { phone_number_id: 'PN-1', display_phone_number: '918000000000' },
        contacts: [{ wa_id: from, profile: { name } }],
        messages: [{ id: `wamid.IN${crypto.randomBytes(6).toString('hex')}`, from, timestamp: String(at), type,
          ...(type === 'text' ? { text: { body: text } } : { [type]: { id: 'media-1' } }) }],
      } }] }],
    })
    const status = (wamid, s) => ({ object: 'whatsapp_business_account', entry: [{ id: 'WABA', changes: [{ field: 'messages', value: {
      messaging_product: 'whatsapp', metadata: { phone_number_id: 'PN-1' }, statuses: [{ id: wamid, status: s, timestamp: String(Math.floor(Date.now() / 1000)), recipient_id: '1' }] } }] }] })
    const conv = (wa) => one(`SELECT * FROM public.whatsapp_conversations WHERE org_id=$1 AND wa_id=$2`, [org, wa])

    const PRIYA = `91984${crypto.randomInt(1000000, 9999999)}`
    const RAHUL = `91985${crypto.randomInt(1000000, 9999999)}`
    let priya, rahul

    await test('webhook posts must be signed with the app secret (forged or unsigned → refused, nothing stored)', async () => {
      const forged = await deliver(inbound(PRIYA, 'Priya', 'hi'), 'wrong-secret')
      assert.equal(forged.status, 401)
      const unsigned = await hook.POST(new Request(`http://localhost/api/webhooks/whatsapp/${conn}`, { method: 'POST', body: JSON.stringify(inbound(PRIYA, 'Priya', 'hi')) }),
        { params: Promise.resolve({ connectionId: conn }) })
      assert.equal(unsigned.status, 401)
      const central = await centralHook.POST(new Request('http://localhost/api/webhooks/whatsapp', { method: 'POST', body: JSON.stringify(inbound(PRIYA, 'Priya', 'hi')) }))
      assert.equal(central.status, 503, 'central route: no secret configured → refuse')
      assert.equal(await conv(PRIYA), undefined)
    })

    await test('a buyer’s messages build one conversation: name, preview, unread count, linked lead', async () => {
      assert.equal((await deliver(inbound(PRIYA, 'Priya Sharma', 'Is the 3 BHK available?'))).status, 200)
      assert.equal((await deliver(inbound(PRIYA, 'Priya Sharma', 'Also, what is the price?'))).status, 200)
      priya = await conv(PRIYA)
      assert.equal(priya.contact_name, 'Priya Sharma')
      assert.equal(priya.unread_count, 2)
      assert.equal(priya.last_message_preview, 'Also, what is the price?')
      assert.equal(priya.last_direction, 'inbound')
      assert.ok(priya.lead_id, 'linked to a lead')
      await deliver(inbound(RAHUL, 'Rahul', 'Brochure please'))
      rahul = await conv(RAHUL)
      await db.query('UPDATE public.leads SET assigned_to=$1 WHERE id=$2', [asha, priya.lead_id])
      await db.query('UPDATE public.leads SET assigned_to=$1 WHERE id=$2', [kiran, rahul.lead_id])
    })

    await test('who sees what: a sales executive only their own leads’ chats; managers and read-only see all; other orgs nothing', async () => {
      const names = async (v, f) => (await inbox.listConversations(org, v, f)).map((c) => c.id).sort()
      assert.deepEqual(await names(A), [priya.id])
      assert.deepEqual(await names(K), [rahul.id])
      assert.deepEqual(await names(M), [priya.id, rahul.id].sort())
      assert.deepEqual(await names(R), [priya.id, rahul.id].sort())
      assert.deepEqual(await names(M, 'mine'), [])
      assert.equal(await inbox.getThread(org, priya.id, K), null, 'another executive’s buyer is not found')
      assert.equal(await inbox.getThread(other, priya.id, M), null, 'another organisation cannot open it')
      assert.equal(await inbox.markRead(other, priya.id, M), false)
      const t = await inbox.getThread(org, priya.id, A)
      assert.deepEqual(t.messages.map((m) => m.body), ['Is the 3 BHK available?', 'Also, what is the price?'])
      assert.equal(t.reply.mode, 'text')
      assert.deepEqual(t.templates.map((x) => [x.name, x.params]), [['visit_reminder', 2]], 'only approved templates are offered')
    })

    await test('opening the conversation marks it read — for its salesperson, not for a manager looking in', async () => {
      assert.equal(await inbox.markRead(org, priya.id, M), true)
      assert.equal((await conv(PRIYA)).unread_count, 2, 'a manager opening it leaves it unread for Asha')
      assert.equal(await inbox.markRead(org, priya.id, A), true)
      const c = await conv(PRIYA)
      assert.deepEqual([c.unread_count, c.last_read_by], [0, asha])
    })

    await test('replying: sent to Meta with the token, stored with who sent it, logged on the lead', async () => {
      metaCalls.length = 0
      const r = await inbox.sendReply(org, priya.id, A, { kind: 'text', text: 'Yes! It is available. When can you visit?' })
      assert.equal(r.success, true, r.error)
      assert.equal(metaCalls.length, 1)
      assert.equal(metaCalls[0].url, 'https://graph.facebook.com/v21.0/PN-1/messages')
      assert.equal(metaCalls[0].auth, 'Bearer EAAG-test-token')
      assert.deepEqual([metaCalls[0].body.to, metaCalls[0].body.type, metaCalls[0].body.text.body], [PRIYA, 'text', 'Yes! It is available. When can you visit?'])
      const m = await one(`SELECT direction, sent_by, body, conversation_id FROM public.whatsapp_messages WHERE wamid=$1`, [r.data.messageId])
      assert.deepEqual([m.direction, m.sent_by, m.conversation_id], ['outbound', asha, priya.id])
      const c = await conv(PRIYA)
      assert.deepEqual([c.last_direction, c.unread_count], ['outbound', 0])
      const act = await one(`SELECT type, actor_id FROM public.lead_activities WHERE lead_id=$1 AND type='whatsapp_logged' ORDER BY created_at DESC LIMIT 1`, [priya.lead_id])
      assert.deepEqual([act.type, act.actor_id], ['whatsapp_logged', asha])
      const lead = await one('SELECT first_action_at FROM public.leads WHERE id=$1', [priya.lead_id])
      assert.ok(lead.first_action_at, 'counts as first contact')
    })

    await test('who may not reply: read-only members, another executive, another organisation', async () => {
      metaCalls.length = 0
      const ro = await inbox.sendReply(org, priya.id, R, { kind: 'text', text: 'hi' })
      assert.deepEqual([ro.success, ro.status], [false, 403])
      const exec = await inbox.sendReply(org, priya.id, K, { kind: 'text', text: 'hi' })
      assert.deepEqual([exec.success, exec.status], [false, 404])
      const cross = await inbox.sendReply(other, priya.id, M, { kind: 'text', text: 'hi' })
      assert.deepEqual([cross.success, cross.status], [false, 404])
      assert.equal(metaCalls.length, 0, 'nothing reached WhatsApp')
    })

    await test('after 24 hours only an approved template can be sent, with every blank filled', async () => {
      await db.query(`UPDATE public.whatsapp_conversations SET last_inbound_at = now() - interval '25 hours' WHERE id=$1`, [rahul.id])
      metaCalls.length = 0
      const text = await inbox.sendReply(org, rahul.id, M, { kind: 'text', text: 'Following up' })
      assert.deepEqual([text.success, text.status], [false, 409])
      const pending = await inbox.sendReply(org, rahul.id, M, { kind: 'template', name: 'promo_draft', language: 'en', params: [] })
      assert.deepEqual([pending.success, pending.status], [false, 400], 'an unapproved template is refused')
      const blanks = await inbox.sendReply(org, rahul.id, M, { kind: 'template', name: 'visit_reminder', language: 'en', params: ['Rahul'] })
      assert.deepEqual([blanks.success, blanks.status], [false, 400], 'missing blank refused')
      assert.equal(metaCalls.length, 0)
      const ok = await inbox.sendReply(org, rahul.id, M, { kind: 'template', name: 'visit_reminder', language: 'en', params: ['Rahul', 'Skyline Towers'] })
      assert.equal(ok.success, true, ok.error)
      assert.deepEqual(metaCalls[0].body.template, { name: 'visit_reminder', language: { code: 'en' },
        components: [{ type: 'body', parameters: [{ type: 'text', text: 'Rahul' }, { type: 'text', text: 'Skyline Towers' }] }] })
      const m = await one('SELECT body FROM public.whatsapp_messages WHERE wamid=$1', [ok.data.messageId])
      assert.equal(m.body, 'Hi Rahul, your visit to Skyline Towers is confirmed.')
    })

    await test('STOP blocks all replies; an ordinary message later does not undo it; START does', async () => {
      await deliver(inbound(PRIYA, 'Priya Sharma', 'STOP'))
      assert.equal((await conv(PRIYA)).is_opted_out, true)
      await deliver(inbound(PRIYA, 'Priya Sharma', 'hi again'))
      assert.equal((await conv(PRIYA)).is_opted_out, true, 'still opted out after an ordinary message')
      metaCalls.length = 0
      const blocked = await inbox.sendReply(org, priya.id, A, { kind: 'text', text: 'Hello?' })
      assert.deepEqual([blocked.success, blocked.status], [false, 409])
      assert.equal(metaCalls.length, 0)
      await deliver(inbound(PRIYA, 'Priya Sharma', 'START'))
      assert.equal((await conv(PRIYA)).is_opted_out, false)
    })

    await test('many messages from one buyer stay one lead, still with the same salesperson', async () => {
      const leads = await db.query(`SELECT id, assigned_to FROM public.leads WHERE org_id=$1 AND phone LIKE '%' || $2`, [org, PRIYA.slice(-10)])
      assert.equal(leads.rows.length, 1, 'no duplicate lead per message')
      assert.equal(leads.rows[0].assigned_to, asha)
      const c = await conv(PRIYA)
      assert.equal(c.lead_id, priya.lead_id, 'the conversation still points at the original lead')
      assert.equal((await inbox.listConversations(org, A)).some((x) => x.id === priya.id), true, 'still in Asha’s inbox')
    })

    await test('delivery ticks only move forward; a failure always shows', async () => {
      const ok = await inbox.sendReply(org, priya.id, A, { kind: 'text', text: 'Welcome back' })
      assert.equal(ok.success, true, JSON.stringify(ok))
      const wamid = ok.data.messageId
      const tick = async () => (await one('SELECT delivery_status s FROM public.whatsapp_messages WHERE wamid=$1', [wamid])).s
      await deliver(status(wamid, 'read'))
      await deliver(status(wamid, 'delivered')) // arrives late
      assert.equal(await tick(), 'read')
      await deliver(status(wamid, 'failed'))
      assert.equal(await tick(), 'failed')
    })

    await test('Meta refusing a message is reported, and nothing is recorded as sent', async () => {
      metaReply = () => ({ status: 400, body: { error: { message: 'Recipient phone number not in allowed list', code: 131030 } } })
      const before = (await one('SELECT count(*)::int n FROM public.whatsapp_messages WHERE conversation_id=$1', [priya.id])).n
      const r = await inbox.sendReply(org, priya.id, A, { kind: 'text', text: 'Hello' })
      assert.deepEqual([r.success, r.status], [false, 502])
      assert.match(r.error, /not in allowed list/)
      assert.equal((await one('SELECT count(*)::int n FROM public.whatsapp_messages WHERE conversation_id=$1', [priya.id])).n, before)
      metaReply = () => ({ status: 200, body: { messages: [{ id: `wamid.OUT${crypto.randomBytes(6).toString('hex')}` }] } })
      // A broken set-up gives a plain instruction, not internals.
      const good = (await one('SELECT credential_ref FROM public.integration_connections WHERE id=$1', [conn])).credential_ref
      await db.query(`UPDATE public.integration_connections SET credential_ref='not-a-real-ref' WHERE id=$1`, [conn])
      const setup = await inbox.sendReply(org, priya.id, A, { kind: 'text', text: 'Hello' })
      assert.deepEqual([setup.success, setup.status], [false, 503])
      assert.match(setup.error, /not fully connected/)
      assert.doesNotMatch(setup.error, /decrypt|credential|vault/i)
      await db.query(`UPDATE public.integration_connections SET credential_ref=$2 WHERE id=$1`, [conn, good])
    })

    await test('photos show as a label; a message can never be attached to another organisation’s conversation', async () => {
      await deliver(inbound(RAHUL, 'Rahul', '', undefined, 'image'))
      const t = await inbox.getThread(org, rahul.id, M)
      const photo = t.messages.find((m) => m.type === 'image')
      assert.ok(photo, 'the photo is in the thread')
      await assert.rejects(db.query(`INSERT INTO public.whatsapp_messages (org_id, conversation_id, wamid, direction, body) VALUES ($1,$2,'wamid.X','inbound','x')`, [other, rahul.id]),
        /another organisation/)
    })

    console.log(`\nP12 WhatsApp inbox: ${passed} checks passed.`)
  } finally {
    globalThis.fetch = realFetch
    for (const id of [org, other]) {
      await db.query('DELETE FROM public.leads WHERE org_id=$1', [id]).catch(() => {})
      await db.query('DELETE FROM public.organisations WHERE id=$1', [id]).catch(() => {})
    }
    await db.end()
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
