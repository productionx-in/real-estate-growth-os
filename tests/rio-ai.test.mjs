// tests/rio-ai.test.mjs — Rio's AI answers: grounded knowledge, no unpublished prices, safe links, safe endpoint.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
delete process.env.NEXT_PUBLIC_PRICES_PUBLISHED
delete process.env.ANTHROPIC_API_KEY
const K = await jiti.import(path.join(root, 'lib/support/knowledge.ts'))
const A = await jiti.import(path.join(root, 'lib/support/ai.ts'))
const G = await jiti.import(path.join(root, 'lib/support/guide.ts'))
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8')
let passed = 0
async function test(name, fn) { await fn(); passed++; console.log(`  ✓ ${name}`) }
console.log('RIO AI')

await test('knowledge repeats the homepage word for word (FAQ, steps, features, problems, lead sources)', () => {
  const home = read('app/page.tsx').replace(/&rsquo;/g, '’')
  const H = K.HOME_CONTENT
  for (const [q, a] of H.faq) { assert.ok(home.includes(q), q); assert.ok(home.includes(a), a.slice(0, 40)) }
  for (const [t, b] of [...H.steps, ...H.features, ...H.problems]) { assert.ok(home.includes(t), t); assert.ok(home.includes(b), b.slice(0, 40)) }
  for (const s of [...H.sourcesReady, ...H.sourcesWithSetup]) assert.ok(home.includes(`'${s}'`), s)
  const doc = K.buildKnowledge()
  for (const [, a] of H.faq) assert.ok(doc.includes(a))
})

await test('while prices are unpublished, the knowledge holds no amount and tells Rio not to quote one', () => {
  const doc = K.buildKnowledge()
  assert.doesNotMatch(doc, /₹|\bINR\b|\d{1,3},\d{3}/, 'no amounts')
  assert.match(doc, /Do not state or estimate any price/)
  assert.match(doc, /public prices are not published yet/)
})

await test('links: only real RE pages survive (website, or this workspace), max 3, no duplicates', () => {
  const L = (href) => ({ label: 'x', href })
  assert.deepEqual(A.allowedLinks([L('/demo'), L('https://evil.example'), L('/nope'), L('//evil.example'), L('/demo')], 'website').map((l) => l.href), ['/demo'])
  assert.deepEqual(A.allowedLinks([L('/acme/leads/import'), L('/other/leads'), L('/acme/secret'), L('/pricing')], 'workspace', 'acme').map((l) => l.href), ['/acme/leads/import', '/pricing'])
  assert.deepEqual(A.allowedLinks([L('/acme/leads')], 'website'), [], 'workspace links never on the website')
  assert.equal(A.allowedLinks([L('/demo'), L('/pricing'), L('/features'), L('/contact')], 'website').length, 3)
  for (const href of Object.keys(K.WEBSITE_LINKS)) {
    const p = href.replace(/^\//, '')
    assert.ok([`app/${p}/page.tsx`, `app/(auth)/${p}/page.tsx`, 'app/page.tsx'].some((f) => fs.existsSync(path.join(root, f)) && (p || f === 'app/page.tsx')), href)
  }
  for (const sub of Object.keys(K.WORKSPACE_LINKS)) assert.ok(fs.existsSync(path.join(root, `app/(dashboard)/[orgSlug]${sub}/page.tsx`)), sub || '(home)')
})

await test('the model is grounded and guarded: knowledge cached, rules forbid inventing, competitors, prices, data access', () => {
  const src = read('lib/support/ai.ts')
  assert.equal(A.RIO_MODEL, 'claude-opus-5-5')
  assert.match(read('lib/support/providers.ts'), /cache_control: \{ type: 'ephemeral' \}/)
  assert.match(src, /Use ONLY the product knowledge below/)
  assert.match(src, /Never name or criticise other companies/)
  assert.match(src, /never state or estimate any amount/)
  assert.match(src, /cannot see or change anyone's data/)
  assert.match(read('lib/support/providers.ts'), /stop_reason === 'refusal'/)
  assert.match(src, /allowedLinks\(r\.links/)
  assert.match(src, /senior sales consultant, technical support specialist and customer-success manager/)
  assert.match(src, /never claim to be a human/)
  assert.match(src, /Fill ONLY when the person has explicitly agreed to be called back/)
  assert.match(src, /callback: input\.context === 'workspace' \? null : r\.callback/, 'no callbacks collected inside workspaces')
})

await test('callbacks: saved to the Sales pipeline only with usable details; one per number per day', async () => {
  const P = await jiti.import(path.join(root, 'lib/support/prospect.ts'))
  const rows = []; let recent = []
  const db = { from: () => ({
    select: () => ({ eq: () => ({ gte: () => ({ limit: async () => ({ data: recent }) }) }) }),
    insert: async (r) => { rows.push(r); return { error: null } },
  }) }
  const c = { name: 'Asha', phone: '+91 98765 43210', company: 'Skyline Homes', companyType: 'developer', teamSize: 12, summary: 'Developer, 12 sales, Meta + 99acres, slow first calls' }
  assert.equal(await P.saveRioCallback(db, { ...c, phone: '123' }), false, 'bad number')
  assert.equal(await P.saveRioCallback(db, { ...c, name: 'A' }), false, 'no name')
  assert.equal(rows.length, 0)
  assert.equal(await P.saveRioCallback(db, c), true)
  assert.equal(rows[0].source, 'website'); assert.equal(rows[0].campaign, 'rio-chat'); assert.equal(rows[0].stage, 'new')
  assert.equal(rows[0].company_name, 'Skyline Homes'); assert.match(rows[0].notes, /^From the Rio chat:/)
  recent = [{ id: 'x' }]
  assert.equal(await P.saveRioCallback(db, c), true); assert.equal(rows.length, 1, 'same number within a day: not duplicated')
  const route = read('app/api/assistant/route.ts')
  assert.match(route, /rio-callback:ip:\$\{ip\}`, limit: 3, windowMs: 86_400_000/)
})

await test('endpoint: works without any AI key (offline guide answers); validates input; rate-limited', () => {
  const src = read('app/api/assistant/route.ts')
  assert.match(src, /catch \{[\s\S]*offlineAnswer\(question/, 'offline guide when no provider or all fail')
  assert.match(src, /checkDistributedRateLimit\(\{ key: `rio:ip:\$\{ip\}`/)
  assert.match(src, /\.max\(12\)/); assert.match(src, /\.max\(800\)/); assert.match(src, /conversationId: z\.string\(\)\.uuid\(\)/)
  assert.match(read('components/support/SupportBubble.tsx'), /fetch\('\/api\/assistant'[\s\S]*catch \{[\s\S]*reply = local\(\)/, 'network failure: local guide')
})

await test('offline guide understands everyday wording', () => {
  const a = (q, c) => G.answer(q, c, 'acme')?.id ?? null
  assert.equal(a('Prices ?', 'auth'), 'price')
  assert.equal(a('How is RE different from others', 'auth'), 'different')
  assert.equal(a('how long does onboarding take', 'website'), 'setup')
  assert.equal(a('How do I add salespeople', 'workspace'), 'w-team')
  assert.equal(a('is it expensive', 'website'), 'price')
  assert.equal(a('what is the weather in Pune', 'website'), null)
})

console.log(`\nRio AI: ${passed} checks passed.`)
