// tests/rio-providers.test.mjs — Rio on any AI provider (Claude, OpenAI, Gemini), with fallback, plus the privacy
// rules of its memory. Network calls are simulated; no keys needed.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
for (const k of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'REGROW_ASSISTANT_PROVIDER', 'REGROW_MODEL_OPENAI', 'REGROW_MODEL_GEMINI']) delete process.env[k]
const P = await jiti.import(path.join(root, 'lib/support/providers.ts'))
const A = await jiti.import(path.join(root, 'lib/support/ai.ts'))
const M = await jiti.import(path.join(root, 'lib/support/memory.ts'))
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8')
let passed = 0
async function test(name, fn) { await fn(); passed++; console.log(`  ✓ ${name}`) }
console.log('RIO PROVIDERS & MEMORY')

await test('provider choice is configuration: order, explicit first choice, and no model assumed for OpenAI/Gemini', () => {
  const names = (env) => P.configuredProviders(env).map((p) => `${p.name}:${p.model}`)
  assert.deepEqual(names({}), [])
  assert.deepEqual(names({ ANTHROPIC_API_KEY: 'k' }), ['anthropic:claude-opus-5-5'])
  assert.deepEqual(names({ OPENAI_API_KEY: 'k' }), [], 'OpenAI without a model is not used')
  assert.deepEqual(names({ ANTHROPIC_API_KEY: 'k', OPENAI_API_KEY: 'k', REGROW_MODEL_OPENAI: 'o-model', GEMINI_API_KEY: 'k', REGROW_MODEL_GEMINI: 'g-model' }), ['anthropic:claude-opus-5-5', 'openai:o-model', 'gemini:g-model'])
  assert.deepEqual(names({ ANTHROPIC_API_KEY: 'k', GEMINI_API_KEY: 'k', REGROW_MODEL_GEMINI: 'g-model', REGROW_ASSISTANT_PROVIDER: 'gemini', REGROW_MODEL_ANTHROPIC: 'claude-haiku-5-5' }), ['gemini:g-model', 'anthropic:claude-haiku-5-5'])
})

const good = { answer: 'Here is how.', links: [{ label: 'Plans', href: '/pricing' }, { label: 'Evil', href: 'https://evil.example' }], handoff: false, callback: null }
function mockFetch(handlers) {
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init, body: JSON.parse(init.body) })
    const h = handlers.find((x) => String(url).includes(x.match))
    return h.respond()
  }
  return calls
}
const ok = (data) => ({ ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) })
const fail = (status) => ({ ok: false, status, json: async () => ({}), text: async () => 'boom' })

await test('OpenAI request: strict JSON schema, system prompt with knowledge, chat history; reply validated and links filtered', async () => {
  Object.assign(process.env, { OPENAI_API_KEY: 'sk-test', REGROW_MODEL_OPENAI: 'o-model' })
  const calls = mockFetch([{ match: 'api.openai.com', respond: () => ok({ choices: [{ message: { content: JSON.stringify(good) } }], usage: { prompt_tokens: 900, completion_tokens: 40 } }) }])
  const r = await A.askRio({ context: 'website', path: '/', history: [{ role: 'user', text: 'Prices?' }] })
  assert.equal(calls[0].url, 'https://api.openai.com/v1/chat/completions')
  assert.equal(calls[0].init.headers.Authorization, 'Bearer sk-test')
  assert.equal(calls[0].body.response_format.json_schema.strict, true)
  assert.match(calls[0].body.messages[0].content, /You are Rio[\s\S]*Frequently asked/)
  assert.deepEqual(calls[0].body.messages.at(-1), { role: 'user', content: 'Prices?' })
  assert.deepEqual(r.reply.links, [{ label: 'Plans', href: '/pricing' }], 'external link dropped')
  assert.deepEqual([r.meta.provider, r.meta.model, r.meta.inputTokens, r.meta.outputTokens], ['openai', 'o-model', 900, 40])
  delete process.env.OPENAI_API_KEY; delete process.env.REGROW_MODEL_OPENAI
})

await test('fallback: OpenAI fails → Gemini answers; a malformed reply also falls through; all failing throws', async () => {
  Object.assign(process.env, { OPENAI_API_KEY: 'sk', REGROW_MODEL_OPENAI: 'o', GEMINI_API_KEY: 'g', REGROW_MODEL_GEMINI: 'gm' })
  let calls = mockFetch([
    { match: 'api.openai.com', respond: () => fail(500) },
    { match: 'generativelanguage', respond: () => ok({ candidates: [{ content: { parts: [{ text: JSON.stringify({ answer: 'From Gemini', links: [], handoff: false }) }] } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } }) },
  ])
  const r = await A.askRio({ context: 'website', path: '/', history: [{ role: 'user', text: 'hi' }] })
  assert.equal(r.meta.provider, 'gemini'); assert.equal(r.reply.answer, 'From Gemini'); assert.equal(r.reply.callback, null)
  const g = calls.find((c) => c.url.includes('generativelanguage'))
  assert.match(g.url, /models\/gm:generateContent$/); assert.equal(g.init.headers['x-goog-api-key'], 'g')
  assert.equal(g.body.generationConfig.responseMimeType, 'application/json')
  calls = mockFetch([
    { match: 'api.openai.com', respond: () => ok({ choices: [{ message: { content: '{"nope":1}' } }] }) },
    { match: 'generativelanguage', respond: () => fail(503) },
  ])
  await assert.rejects(A.askRio({ context: 'website', path: '/', history: [{ role: 'user', text: 'hi' }] }))
  for (const k of ['OPENAI_API_KEY', 'REGROW_MODEL_OPENAI', 'GEMINI_API_KEY', 'REGROW_MODEL_GEMINI']) delete process.env[k]
})

await test('callbacks are never taken inside a workspace, whichever provider', async () => {
  Object.assign(process.env, { OPENAI_API_KEY: 'sk', REGROW_MODEL_OPENAI: 'o' })
  mockFetch([{ match: 'api.openai.com', respond: () => ok({ choices: [{ message: { content: JSON.stringify({ ...good, callback: { name: 'A', phone: '9876543210', company: null, companyType: 'unknown', teamSize: null, summary: 's' } }) } }] }) }])
  assert.equal((await A.askRio({ context: 'workspace', orgSlug: 'acme', path: '/acme', history: [{ role: 'user', text: 'x' }] })).reply.callback, null)
  delete process.env.OPENAI_API_KEY; delete process.env.REGROW_MODEL_OPENAI
})

await test('memory redaction: e-mails, phone numbers and long digit runs are masked; ordinary numbers stay', () => {
  assert.equal(M.redact('mail asha@example.co.in or +91 98765-43210'), 'mail [email] or [phone]')
  assert.equal(M.redact('OTP 482913 please'), 'OTP [number] please')
  assert.equal(M.redact('We have 12 salespeople and 3 projects, since 2026-11-20'), 'We have 12 salespeople and 3 projects, since 2026-11-20')
  assert.equal(M.workspaceHash('acme', 'k').length, 64); assert.notEqual(M.workspaceHash('acme', 'k'), M.workspaceHash('acme', 'other'))
})

await test('every turn is stored whoever answers (AI or offline); export is Platform Owner only, audited, no workspaces', () => {
  const route = read('app/api/assistant/route.ts')
  assert.match(route, /source = 'offline'/); assert.match(route, /rememberTurn\(db, \{ conversationId/)
  const exp = read('app/api/platform/assistant/export/route.ts')
  assert.match(exp, /staffActor\('staff'\)/); assert.match(exp, /action: 'assistant\.exported'/)
  assert.match(read('lib/support/memory.ts'), /\.in\('context', \['website', 'auth'\]\)/)
  assert.match(read('supabase/migrations/20260064_assistant_interactions.sql'), /REVOKE ALL ON public\.%I FROM PUBLIC, anon, authenticated/)
  assert.match(read('components/support/SupportBubble.tsx'), /Chats are saved to improve REGrow/)
})

console.log(`\nRio providers & memory: ${passed} checks passed.`)
