// tests/auth-safety.test.mjs — post-sign-in redirect guard and password policy (real modules via jiti).
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const { safeRedirectPath } = await jiti.import(path.join(root, 'lib/auth/safe-redirect.ts'))
const { passwordProblem } = await jiti.import(path.join(root, 'lib/auth/password-policy.ts'))
let passed = 0
const test = (n, fn) => { fn(); passed++; console.log(`  ✓ ${n}`) }
console.log('AUTH SAFETY')

test('keeps same-origin paths, including query and hash', () => {
  assert.equal(safeRedirectPath('/acme/leads'), '/acme/leads')
  assert.equal(safeRedirectPath('/acme/leads?view=mine#top'), '/acme/leads?view=mine#top')
  assert.equal(safeRedirectPath('/reset-password'), '/reset-password')
  assert.equal(safeRedirectPath('/invite/abc123'), '/invite/abc123')
})
test('rejects every off-site form and falls back to the default', () => {
  const attacks = ['@evil.example', '@evil.example/x', '//evil.example', '//evil.example/path', '/\\evil.example', '\\\\evil.example',
    'https://evil.example', 'http:evil.example', 'javascript:alert(1)', 'data:text/html,hi', ' //evil.example', '/\t/evil.example',
    '/\n/evil.example', 'evil.example', '', null, undefined, '/'.padEnd(3000, 'a')]
  for (const a of attacks) assert.equal(safeRedirectPath(a), '/select-org', JSON.stringify(a))
})
test('the callback could never build a foreign URL from the result', () => {
  for (const a of ['@evil.example', '//evil.example', '/\\evil.example', '/ok']) {
    const url = new URL(safeRedirectPath(a), 'https://app.regrow.in')
    assert.equal(url.origin, 'https://app.regrow.in', a)
  }
})
test('custom fallback is honoured', () => {
  assert.equal(safeRedirectPath('//x', '/login'), '/login')
})
test('password policy: length, letters + numbers, no email local part', () => {
  assert.match(passwordProblem('short1'), /at least 10/)
  assert.match(passwordProblem('onlyletterslong'), /upper- and lower-case letters, a number and a symbol/)
  assert.match(passwordProblem('1234567890123'), /upper- and lower-case letters, a number and a symbol/)
  assert.match(passwordProblem('skyline-towers-2026'), /upper- and lower-case/, 'no capital letter')
  assert.match(passwordProblem('SkylineTowers2026'), /symbol/, 'no symbol')
  assert.match(passwordProblem('Ravikumar-2026x', 'ravikumar@skyline.in'), /email/)
  assert.equal(passwordProblem('Skyline-Towers-2026'), null)
})
console.log(`\nALL ${passed} AUTH SAFETY TESTS PASSED`)
