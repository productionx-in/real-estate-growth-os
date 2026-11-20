// tests/support-bubble.test.mjs — the parrot support bubble and the day/night switch (module test via jiti).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const C = await jiti.import(path.join(root, 'lib/support/contact.ts'))
const G = await jiti.import(path.join(root, 'lib/support/guide.ts'))
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8')
let passed = 0
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`) }
console.log('SUPPORT BUBBLE & THEME TOGGLE')

test('WhatsApp number: digits with country code only; anything else hides the option', () => {
  assert.equal(C.normaliseWhatsApp('+91 98765 43210'), '919876543210')
  assert.equal(C.normaliseWhatsApp(''), null)
  assert.equal(C.normaliseWhatsApp(undefined), null)
  assert.equal(C.normaliseWhatsApp('12345'), null, 'too short')
  assert.equal(C.whatsAppLink('hi', ''), null, 'no number configured → no link')
  assert.equal(C.whatsAppLink('Hi & bye', '+91 98765 43210'), 'https://wa.me/919876543210?text=Hi%20%26%20bye')
})

test('no contact detail is hard-coded: number from NEXT_PUBLIC_SUPPORT_WHATSAPP, e-mail from lib/legal.ts', () => {
  const src = read('lib/support/contact.ts') + read('components/support/SupportBubble.tsx')
  assert.match(src, /process\.env\.NEXT_PUBLIC_SUPPORT_WHATSAPP/)
  assert.doesNotMatch(src, /wa\.me\/\d/, 'no number in the code')
  assert.doesNotMatch(src, /mailto:[a-z]/i, 'no address in the code')
})

test('Rio travels the whole journey: website, sign-in, choosing a workspace, invitations, every workspace', () => {
  assert.match(read('components/marketing/MarketingShell.tsx'), /<SupportBubble context="website" \/>/)
  assert.match(read('app/(auth)/layout.tsx'), /<SupportBubble context="auth" \/>/)
  assert.match(read('app/(dashboard)/select-org/page.tsx'), /<SupportBubble context="auth" \/>/)
  assert.match(read('app/invite/[token]/page.tsx'), /<SupportBubble context="auth" \/>/)
  assert.match(read('app/(dashboard)/[orgSlug]/layout.tsx'), /<SupportBubble context="workspace" orgSlug=\{workspace\.org\.slug\}/)
  const bubble = read('components/support/SupportBubble.tsx')
  assert.match(bubble, /\{wa && <a/, 'WhatsApp only when configured')
  assert.match(bubble, /\{email && <a/, 'e-mail only when configured')
  assert.match(bubble, /rel="noopener noreferrer"/)
  assert.match(bubble, /e\.key === 'Escape'/)
  assert.match(bubble, /virtual guide/, 'says plainly it is a virtual guide')
  assert.match(bubble, /best answered by our team|right person from our team/, 'unknown questions hand over to a person')
})

test('Rio answers common questions in each context, with a link to where it is done', () => {
  const a = (q, c, org) => G.answer(q, c, org)
  assert.equal(a('how much does it cost?', 'website').id, 'price')
  assert.equal(a('Can I get a free trial', 'website').id, 'trial')
  assert.equal(a('does it work with 99acres and magicbricks', 'website').id, 'sources')
  assert.equal(a('I forgot my password', 'auth').id, 'forgot')
  assert.equal(a('it says I am not registered', 'auth').id, 'noaccount')
  const imp = a('how do I upload my excel leads', 'workspace', 'acme')
  assert.equal(imp.id, 'w-import'); assert.deepEqual(imp.links, [{ label: 'Import leads', href: '/acme/leads/import' }])
  assert.equal(a('invite a new salesperson', 'workspace', 'acme').id, 'w-team')
  assert.equal(a('connect facebook lead ads', 'workspace', 'acme').id, 'w-connect')
  assert.equal(a('something is broken', 'workspace', 'acme').id, 'w-problem')
  assert.equal(a('what is the weather in Pune', 'website'), null, 'no match → hand over, never guess')
  assert.equal(a('import leads', 'website').id, 'sources', 'workspace-only answers stay in workspaces')
})

test('every link Rio gives points at a page that exists', () => {
  const exists = (href) => {
    const p = href.replace('/{org}', '/[orgSlug]').replace(/^\//, '')
    return [`app/${p}/page.tsx`, `app/(auth)/${p}/page.tsx`, `app/(dashboard)/${p}/page.tsx`].some((f) => fs.existsSync(path.join(root, f)))
  }
  const bad = G.GUIDE_ENTRIES.flatMap((e) => e.links.map((l) => l.href)).filter((h) => !exists(h))
  assert.deepEqual(bad, [])
})

test('Rio never claims third-party sources work without setup (same rule as the website)', () => {
  const sources = G.GUIDE_ENTRIES.find((e) => e.id === 'sources').text
  assert.match(sources, /Ready to use: website forms, walk-ins and referrals, CSV import, and webhooks\/API\. With your own business account or API access: Meta/)
  for (const e of G.GUIDE_ENTRIES) assert.doesNotMatch(e.text, /single sign-on|custom roles|coming soon|guarantee/i, e.id)
})

test('starter questions fit the page', () => {
  assert.ok(G.suggestions('website', '/pricing').includes('Pricing'))
  assert.ok(G.suggestions('auth', '/login').includes('Forgot password'))
  assert.ok(G.suggestions('workspace', '/acme/leads').includes('Import my leads'))
  for (const c of ['website', 'auth', 'workspace']) for (const chip of G.suggestions(c, '/')) assert.ok(G.answerChip(chip, c, 'acme'), `${c}: ${chip}`)
})

test('day/night: one-tap switch in the console and app headers; full choices in the account menus', () => {
  assert.match(read('components/theme/ThemeToggle.tsx'), /setPreference\(dark \? 'light' : 'dark'\)/)
  const shell = read('components/platform/ConsoleShell.tsx')
  assert.match(shell, /<ThemeToggle \/>/); assert.match(shell, /<AppearanceMenu \/>/)
  assert.match(read('components/layout/Header.tsx'), /<ThemeToggle /)
})

console.log(`\nSupport bubble: ${passed} checks passed.`)
