// tests/db-integration/p26-assistant-memory.test.mjs — Rio's memory (migration 20260064, lib/support/memory.ts)
// against the local Supabase stack: turns stored redacted, conversations grouped, ratings only within their own
// conversation, workspace conversations never exported, no identity stored, and no client access to the tables.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) { console.error('FATAL: Supabase env required (URL, anon and service keys).'); process.exit(1) }
let passed = 0
async function test(name, fn) { try { await fn(); passed++; console.log(`  ✓ ${name}`) } catch (e) { console.error(`  ✗ ${name}`); throw e } }
class UnusedRealtimeTransport { constructor() { throw new Error('Realtime is not used by these tests') } }
const clientOpts = { auth: { persistSession: false, autoRefreshToken: false }, ...(globalThis.WebSocket ? {} : { realtime: { transport: UnusedRealtimeTransport } }) }

async function main() {
  const jiti = createJiti(import.meta.url, { alias: { '@': root } })
  const M = await jiti.import(path.join(root, 'lib/support/memory.ts'))
  const db = createClient(SUPABASE_URL, SERVICE_KEY, clientOpts)
  const anon = createClient(SUPABASE_URL, ANON_KEY, clientOpts)
  console.log('P26 — RIO MEMORY')
  const site = crypto.randomUUID(), ws = crypto.randomUUID()
  const meta = { provider: 'openai', model: 'test-model', latencyMs: 812, inputTokens: 1200, outputTokens: 90 }
  const turn = (over) => ({ conversationId: site, context: 'website', path: '/pricing', question: 'Call me on +91 98765 43210, mail asha@example.com', answer: 'Sure — I’ll pass 9876543210 on.', links: [{ label: 'Book a demo', href: '/demo' }], handoff: false, source: 'ai', meta, callbackSaved: false, ...over })

  let firstAnswer
  await test('turns are stored redacted and grouped by conversation; no identity is stored', async () => {
    firstAnswer = await M.rememberTurn(db, turn())
    assert.ok(firstAnswer)
    await M.rememberTurn(db, turn({ question: 'And the price?', answer: 'Plans are on the pricing page.', source: 'offline', meta: null, callbackSaved: true }))
    const { data: conv } = await db.from('assistant_conversations').select('*').eq('id', site).single()
    assert.equal(conv.message_count, 4); assert.equal(conv.callback_saved, true); assert.equal(conv.workspace_hash, null)
    const { data: msgs } = await db.from('assistant_messages').select('role, content, source, provider, model, latency_ms').eq('conversation_id', site).order('created_at')
    assert.equal(msgs.length, 4)
    assert.equal(msgs[0].content, 'Call me on [phone], mail [email]')
    assert.equal(msgs[1].content, 'Sure — I’ll pass [phone] on.')
    assert.deepEqual([msgs[1].provider, msgs[1].model, msgs[1].latency_ms], ['openai', 'test-model', 812])
    assert.equal(msgs[3].source, 'offline'); assert.equal(msgs[3].provider, null)
    assert.ok(!Object.keys(conv).some((k) => /user|org_id|ip/.test(k)), 'no user, organisation or address columns')
  })

  await test('ratings: only an assistant answer, only from its own conversation', async () => {
    assert.equal(await M.rateAnswer(db, crypto.randomUUID(), firstAnswer, 1), false, 'another conversation cannot rate it')
    assert.equal(await M.rateAnswer(db, site, firstAnswer, 1), true)
    const { data: userMsg } = await db.from('assistant_messages').select('id').eq('conversation_id', site).eq('role', 'user').limit(1).single()
    assert.equal(await M.rateAnswer(db, site, userMsg.id, 1), false, 'questions cannot be rated')
  })

  await test('workspace conversations: kept with a keyed hash only, and never exported', async () => {
    await M.rememberTurn(db, turn({ conversationId: ws, context: 'workspace', orgSlug: 'acme-builders', path: '/acme-builders/leads', question: 'Our Skyline leads are not routing', answer: 'Check Lead routing.' }))
    const { data: conv } = await db.from('assistant_conversations').select('workspace_hash').eq('id', ws).single()
    assert.equal(conv.workspace_hash, M.workspaceHash('acme-builders')); assert.doesNotMatch(conv.workspace_hash, /acme/)
    const rows = await M.exportConversations(db, { limit: 5000 })
    const ids = rows.map((r) => r.metadata.conversation)
    assert.ok(ids.includes(site)); assert.ok(!ids.includes(ws), 'workspace conversation not exported')
    const mine = rows.find((r) => r.metadata.conversation === site)
    assert.equal(mine.messages[0].role, 'system'); assert.equal(mine.messages.length, 5)
    assert.deepEqual(mine.metadata.ratings, [1])
    assert.ok(mine.metadata.answered_by.includes('openai:test-model') && mine.metadata.answered_by.includes('offline'))
    const good = await M.exportConversations(db, { onlyRatedGood: true, limit: 5000 })
    assert.ok(good.some((r) => r.metadata.conversation === site))
  })

  await test('no client access: anonymous users can neither read nor write the tables', async () => {
    const r1 = await anon.from('assistant_messages').select('id').limit(1)
    assert.ok(r1.error || r1.data.length === 0)
    const r2 = await anon.from('assistant_conversations').insert({ id: crypto.randomUUID(), context: 'website' })
    assert.ok(r2.error, 'insert refused')
  })

  console.log(`\nP26 Rio memory: ${passed} checks passed.`)
}
main().catch((e) => { console.error(e); process.exit(1) })
