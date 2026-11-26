// tests/auth-team-ux.test.mjs — sign-in screens and the team actions menu: back to home, show/hide password,
// invitation for an existing account, readable role names, and a menu that is never clipped.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8')
let passed = 0
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`) }
console.log('AUTH & TEAM UX')

test('every sign-in screen has a way back to the home page', () => {
  for (const f of ['components/auth/AuthFrame.tsx', 'app/invite/[token]/page.tsx']) assert.match(read(f), /<Link href="\/"[^>]*>[\s\S]{0,120}Back to home/, f)
  assert.match(read('components/login/ReLoginPage.tsx'), /href=\{homeHref\}[\s\S]{0,600}Back to home/); assert.match(read('components/login/CustomerSignIn.tsx'), /homeHref="\/"/)
})

test('every password field can be shown or hidden while typing', () => {
  const pi = read('components/auth/PasswordInput.tsx')
  assert.match(pi, /type=\{show \? 'text' : 'password'\}/); assert.match(pi, /aria-label=\{show \? 'Hide password' : 'Show password'\}/); assert.match(pi, /type="button"/)
  for (const f of ['components/auth/LoginForm.tsx', 'components/auth/RegisterForm.tsx', 'components/auth/AcceptInviteForm.tsx']) {
    assert.match(read(f), /<PasswordInput/, f); assert.doesNotMatch(read(f), /type="password"/, `${f} has a bare password field`)
  }
  assert.match(read('components/auth/ResetPasswordForm.tsx'), /show \? 'text' : 'password'|EyeOff/)
})

test('invitation for an existing account switches to sign-in-and-accept (no dead end); roles read as words', () => {
  const f = read('components/auth/AcceptInviteForm.tsx')
  assert.doesNotMatch(f, /Please sign in below to accept/, 'the old dead-end message is gone')
  assert.match(f, /already registered[\s\S]{0,80}setMode\('signin'\)/)
  assert.match(f, /identities\.length === 0\) \{\s*setMode\('signin'\)/, 'silent duplicate sign-up also handled')
  assert.match(f, /signInWithPassword\(\{ email: invitation\.email, password \}\)[\s\S]*await handleAcceptLoggedIn\(\)/)
  assert.match(f, /Sign in to accept/); assert.match(f, /Forgot password\?/)
  assert.match(f, /import \{ ROLE_LABELS \} from '@\/lib\/auth\/permissions'/, 'shared role names (Team lead, not team_lead)')
})

test('team actions menu: a portalled dropdown (never clipped), current role ticked, deactivate kept', () => {
  const t = read('components/team/TeamManagementClient.tsx')
  assert.match(t, /<DropdownMenuContent align="end" collisionPadding=\{12\}/)
  assert.match(t, /<DropdownMenuRadioGroup value=\{m\.role\}/)
  assert.match(t, /<DropdownMenuItem destructive onSelect=\{\(\) => setDeactivateTarget\(m\)\}/)
  assert.doesNotMatch(t, /activeMenuId/, 'the hand-made absolute menu is gone')
  assert.match(read('components/ui/dropdown-menu.tsx'), /<Menu\.Portal>/)
})

test('team page: no actions on your own row, owners only managed by an owner, title shown once', () => {
  const t = read('components/team/TeamManagementClient.tsx')
  assert.match(t, /const isSelf = m\.profileId === currentProfileId/)
  assert.match(t, /const canManage = !isDeactivated && !isSelf && \(m\.role !== 'owner' \|\| viewerRole === 'owner'\)/)
  assert.match(t, /\{canManage && \(\s*<DropdownMenu>/, 'the actions menu depends on canManage')
  assert.doesNotMatch(t, /Team &amp; Access Management/, 'the page title lives in PageShell only')
  const page = read('app/(dashboard)/[orgSlug]/team/page.tsx')
  assert.match(page, /currentProfileId=\{workspace\.profile\.id\}/)
  // The server stays the authority: it refuses self-deactivation, own-role changes and removing the last owner.
  const dal = read('lib/dal/invitations.ts')
  assert.match(dal, /You cannot deactivate your own account\./)
  assert.match(dal, /You cannot change your own role\./)
  assert.match(dal, /Cannot deactivate the sole owner/)
})

console.log(`\nAuth & team UX: ${passed} checks passed.`)
