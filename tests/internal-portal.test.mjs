// tests/internal-portal.test.mjs — the three experiences (module test on the real code via jiti):
// sign-in entry points and landing pages, workspace preference by type, and the internal portal's role matrix.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const S = await jiti.import(path.join(root, 'lib/workspace/select.ts'))
const P = await jiti.import(path.join(root, 'lib/platform/portal.ts'))
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8')
let passed = 0
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`) }

console.log('INTERNAL PORTAL & SIGN-IN')

test('sign-in: two public entry points, staff unlisted; each lands in the right place; unknown values fall back safely', () => {
  assert.deepEqual(S.AUDIENCES.map((a) => a.id), ['developer', 'agency', 'staff'])
  assert.deepEqual(S.PUBLIC_AUDIENCES.map((a) => a.id), ['developer', 'agency'], 'the staff sign-in is not offered publicly')
  assert.equal(S.audienceHome('staff'), '/platform')
  assert.equal(S.audienceHome('agency'), '/select-org?type=channel_partner')
  assert.equal(S.audienceHome('developer'), '/select-org?type=developer')
  assert.equal(S.parseAudience('https://evil.example'), 'developer')
  const login = read('app/(auth)/login/page.tsx')
  assert.match(login, /redirectTo\?\.startsWith\('\/platform'\) \? 'staff'/, 'console sign-in links open the staff entry')
  assert.match(login, /PUBLIC_AUDIENCES\.map/, 'the switcher lists public entry points only')
  assert.doesNotMatch(login, /AUDIENCES\.map\(\(a\) => \{\s*const Icon = ICON\[a\.id\]\s*const active = a\.id === audience\s*return \(\s*<Link key=\{a\.id\} href=\{`\/login\?for=\$\{a\.id\}\$\{a\.id === 'staff'/)
  for (const f of ['app/page.tsx', 'components/marketing/MarketingHeader.tsx', 'components/marketing/MarketingFooter.tsx', 'components/marketing/MobileMenu.tsx']) {
    if (fs.existsSync(path.join(root, f))) assert.doesNotMatch(read(f), /for=staff/, `${f} must not link the staff sign-in`)
  }
  assert.match(read('components/auth/LoginForm.tsx'), /safeRedirectPath\(searchParams\.get\('redirectTo'\), defaultRedirect \? safeRedirectPath\(defaultRedirect\)/, 'redirects stay same-origin')
})

test('workspace choice: the type you signed in as opens directly when you have exactly one of it', () => {
  const dev = { slug: 'skyline', name: 'Skyline', type: 'developer', role: 'owner' }
  const ag = { slug: 'prime', name: 'Prime Realty', type: 'channel_partner', role: 'admin' }
  assert.deepEqual(S.resolveWorkspaceDestination([dev, ag], null, 'channel_partner'), { kind: 'redirect', to: '/prime' })
  assert.deepEqual(S.resolveWorkspaceDestination([dev, ag], null, 'developer'), { kind: 'redirect', to: '/skyline' })
  assert.deepEqual(S.resolveWorkspaceDestination([dev, ag, { ...ag, slug: 'other' }], null, 'channel_partner'), { kind: 'choose' })
  assert.deepEqual(S.resolveWorkspaceDestination([dev, ag], '/prime/leads', 'developer'), { kind: 'redirect', to: '/prime/leads' }, 'an explicit safe destination wins')
  assert.deepEqual(S.resolveWorkspaceDestination([dev], null, 'channel_partner'), { kind: 'redirect', to: '/skyline' })
})

test('role matrix: sales never touches support or customer records; support never sees sales; only the owner manages staff', () => {
  const roles = ['super_admin', 'platform_admin', 'finance_admin', 'sales_manager', 'sales_rep', 'support_agent', 'auditor']
  const row = (r) => Object.keys(P.CAN).filter((k) => P.can(r, k))
  assert.deepEqual(row('sales_rep'), ['dashboard', 'organisations', 'salesRead', 'salesWrite'])
  assert.deepEqual(row('sales_manager'), ['dashboard', 'organisations', 'salesRead', 'salesWrite', 'salesAll'])
  assert.deepEqual(row('support_agent'), ['dashboard', 'organisations', 'supportRead', 'supportWrite'])
  assert.deepEqual(row('finance_admin'), ['dashboard', 'organisations'])
  assert.deepEqual(row('auditor'), ['dashboard', 'organisations', 'salesRead', 'salesAll', 'supportRead'], 'auditors read, never write')
  for (const r of roles) assert.equal(P.can(r, 'staff'), r === 'super_admin', r)
  for (const r of roles) assert.ok(P.ROLE_LABEL[r], r)
})

test('sales code reads no customer CRM table except REGrow’s own website-request connection', () => {
  const src = read('lib/platform/portal.ts')
  const sales = src.slice(src.indexOf('// ── Internal Sales'), src.indexOf('// ── Internal Support'))
  const tables = [...sales.matchAll(/from\('([a-z_]+)'\)/g)].map((m) => m[1])
  assert.deepEqual([...new Set(tables)].sort(), ['internal_prospect_activities', 'internal_prospects', 'leads', 'platform_users'])
  assert.match(sales, /from\('leads'\)\.select\([^)]*\)\.eq\('connection_id', connectionId\)/, 'only the website form connection')
})

test('every staff route checks the role and MFA; the customer help route checks membership', () => {
  for (const f of ['app/api/platform/sales/route.ts', 'app/api/platform/sales/[id]/route.ts', 'app/api/platform/support/route.ts', 'app/api/platform/support/[id]/route.ts', 'app/api/platform/staff/route.ts', 'app/api/platform/staff/[id]/route.ts']) {
    assert.match(read(f), /staffActor\('/, f)
  }
  assert.match(read('lib/platform/route-auth.ts'), /authenticatePlatformAdmin\(\[\.\.\.CAN\[what\]\] as PlatformRole\[\], true\)/, 'MFA required')
  assert.match(read('app/api/help/route.ts'), /authorizeOrgAccess\(orgId\)/)
})

test('console dashboard: weekly series buckets real dates, oldest first; future and old dates ignored', () => {
  const now = Date.parse('2026-11-20T12:00:00Z')
  const d = (days) => new Date(now - days * 86_400_000).toISOString()
  assert.deepEqual(P.weeklySeries([d(0), d(1), d(8), d(20), d(400), new Date(now + 86_400_000).toISOString(), null, 'not a date'], 4, now), [0, 1, 1, 2])
})

test('console shell: nav is built on the server from the role; audit and staff links only for their roles', () => {
  const layout = read('app/platform/layout.tsx')
  assert.match(layout, /can\(role, 'staff'\) \? \[\{ href: '\/platform\/staff'/)
  assert.match(layout, /PLATFORM_AUDIT_READERS\.includes\(access\.role\) \? \[\{ href: '\/platform\/audit'/)
  assert.match(layout, /state === 'mfa_required'[\s\S]*<MfaGate \/>/, 'no console screen before the authenticator step')
  assert.doesNotMatch(read('app/platform/page.tsx'), /Math\.random/, 'dashboard shows real figures only')
})

console.log(`\nInternal portal: ${passed} checks passed.`)
