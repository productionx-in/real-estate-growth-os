// tests/password-reset.test.mjs — e-mailed password-reset links reach the reset screen however Supabase returns
// them, and a link that fails says why (real modules via jiti; routing checked in source).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const { authMethods, isRecoverySession, linkProblem, problemFromParams, LINK_PROBLEM_MESSAGE } = await jiti.import(path.join(root, 'lib/auth/recovery.ts'))
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8')
let passed = 0
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`) }
const jwt = (payload) => ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify(payload)).toString('base64url'), 'sig'].join('.')

console.log('PASSWORD RESET LINKS')
test('a recovery session is recognised from the token (amr), whatever "next" says', () => {
  assert.equal(isRecoverySession(jwt({ amr: [{ method: 'recovery', timestamp: 1 }] })), true)
  assert.equal(isRecoverySession(jwt({ amr: [{ method: 'password', timestamp: 1 }] })), false)
  assert.deepEqual(authMethods(jwt({ amr: ['otp'] })), ['otp'])
  assert.equal(isRecoverySession('not-a-token'), false); assert.equal(isRecoverySession(null), false)
})
test('expired, already-used, other-device and invalid links each get their own message', () => {
  assert.equal(linkProblem({ code: 'otp_expired' }), 'link_expired')
  assert.equal(linkProblem({ message: 'Email link is invalid or has expired' }), 'link_expired')
  assert.equal(linkProblem({ code: 'flow_state_not_found' }), 'other_device')
  assert.equal(linkProblem({ message: 'invalid request: both auth code and code verifier should be non-empty' }), 'other_device')
  assert.equal(linkProblem({ message: 'Token has already been used' }), 'link_used')
  assert.equal(linkProblem({ message: 'something else' }), 'link_invalid')
  for (const k of ['link_expired', 'link_used', 'other_device', 'link_invalid']) assert.ok(LINK_PROBLEM_MESSAGE[k].length > 20, k)
  assert.equal(problemFromParams(new URLSearchParams('error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired')), 'link_expired')
  assert.equal(problemFromParams(new URLSearchParams('next=/x')), null)
})
test('a link Supabase sent to the homepage (?code= or ?error_code=) is forwarded to /auth/callback', () => {
  const p = read('proxy.ts')
  assert.match(p, /to\.pathname = '\/auth\/callback'[\s\S]*searchParams\.set\('code'/)
  assert.match(p, /sp\.get\('error_code'\)/)
  assert.match(p, /'\/reset-password'\]/, '/reset-password is reachable without a session so an expired link can explain itself')
})
test('callback and confirm send a recovery to /reset-password and failures to sign-in with "Forgot password" open', () => {
  const cb = read('app/auth/callback/route.ts')
  assert.match(cb, /isRecoverySession\(data\.session\?\.access_token\)/); assert.match(cb, /\/login\?error=\$\{problem\}&mode=forgot/)
  const cf = read('app/auth/confirm/route.ts')
  assert.match(cf, /type === 'recovery' \? '\/reset-password' : next/); assert.match(cf, /linkProblem\(error\)/)
  assert.match(read('components/auth/LoginForm.tsx'), /useState\(searchParams\.get\('mode'\) === 'forgot'\)/)
})
test('a #access_token / #error_code link is finished in the browser on any page', () => {
  const c = read('components/auth/AuthLinkCatcher.tsx')
  assert.match(c, /setSession\(\{ access_token, refresh_token \}\)/); assert.match(c, /type === 'recovery' \? '\/reset-password'/)
  assert.match(read('app/layout.tsx'), /<AuthLinkCatcher \/>/)
})
test('the reset e-mail template uses a token-hash link that works on any device', () => {
  const t = read('supabase/templates/recovery.html')
  assert.match(t, /\{\{ \.SiteURL \}\}\/auth\/confirm\?token_hash=\{\{ \.TokenHash \}\}&type=recovery&next=\/reset-password/)
  assert.doesNotMatch(t, /ConfirmationURL/)
})
console.log(`\nPassword reset: ${passed} checks passed.`)
