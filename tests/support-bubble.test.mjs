// tests/support-bubble.test.mjs — the parrot support bubble and the day/night switch (module test via jiti).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const C = await jiti.import(path.join(root, 'lib/support/contact.ts'))
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

test('the bubble is on the website and in every workspace; the app version opens Help & support', () => {
  assert.match(read('components/marketing/MarketingShell.tsx'), /<SupportBubble variant="website" \/>/)
  assert.match(read('app/(dashboard)/[orgSlug]/layout.tsx'), /<SupportBubble variant="app" helpHref=\{`\/\$\{workspace\.org\.slug\}\/help`\}/)
  const bubble = read('components/support/SupportBubble.tsx')
  assert.match(bubble, /\{wa && \(/, 'WhatsApp only when configured')
  assert.match(bubble, /\{email && \(/, 'e-mail only when configured')
  assert.match(bubble, /rel="noopener noreferrer"/)
  assert.match(bubble, /e\.key === 'Escape'/, 'Escape closes it')
  assert.match(bubble, /bottom-\[calc\(var\(--bottom-nav-height\)/, 'sits above the phone bottom bar in the app')
})

test('day/night: one-tap switch in the console and app headers; full choices in the account menus', () => {
  assert.match(read('components/theme/ThemeToggle.tsx'), /setPreference\(dark \? 'light' : 'dark'\)/)
  const shell = read('components/platform/ConsoleShell.tsx')
  assert.match(shell, /<ThemeToggle \/>/); assert.match(shell, /<AppearanceMenu \/>/)
  assert.match(read('components/layout/Header.tsx'), /<ThemeToggle /)
})

console.log(`\nSupport bubble: ${passed} checks passed.`)
