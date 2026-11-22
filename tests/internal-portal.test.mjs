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
  assert.deepEqual(row('support_agent'), ['dashboard', 'organisations', 'plotMapSetup', 'supportRead', 'supportWrite'], 'support also runs map set-ups (metadata only)')
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

function fakeDb({ existingUser = null, staffRow = null, lastSignIn = null } = {}) {
  const log = { links: [], inserts: [], audits: [] }
  const db = {
    rpc: async () => ({ data: existingUser, error: null }),
    auth: { admin: {
      generateLink: async ({ type, email }) => { log.links.push({ type, email }); return { data: { user: { id: existingUser ?? 'new-user' }, properties: { hashed_token: 'h' + log.links.length } }, error: null } },
      getUserById: async () => ({ data: { user: { id: existingUser, last_sign_in_at: lastSignIn } }, error: null }),
    } },
    from: (table) => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: staffRow }) }) }),
      insert: (row) => {
        if (table === 'platform_audit_logs') { log.audits.push(row); return Promise.resolve({ error: null }) }
        log.inserts.push(row)
        return { select: () => ({ single: async () => ({ data: { id: 'pu1' }, error: null }) }) }
      },
    }),
  }
  return { db, log }
}
const owner = { userId: 'owner', role: 'super_admin' }
const origin = 'https://app.example.test'

async function atest(name, fn) { await fn(); passed++; console.log(`  ✓ ${name}`) }

await atest('add staff: no account yet → account created, one-time setup link returned, audited without the link', async () => {
  const { db, log } = fakeDb()
  const r = await P.addStaff(db, owner, 'new@example.test', 'sales_rep', origin)
  assert.equal(r.success, true)
  assert.deepEqual(log.links, [{ type: 'invite', email: 'new@example.test' }])
  assert.equal(log.inserts[0].user_id, 'new-user')
  assert.equal(log.inserts[0].mfa_enforced, true)
  assert.equal(r.data.setupLink, `${origin}/auth/confirm?token_hash=h1&type=invite&next=%2Freset-password`)
  assert.equal(log.audits[0].action, 'staff.added')
  assert.doesNotMatch(JSON.stringify(log.audits), /token_hash|h1/, 'the link itself is never written to the audit log')
})

await atest('add staff: existing account that has signed in → added, no link', async () => {
  const { db, log } = fakeDb({ existingUser: 'u1', lastSignIn: '2026-01-01T00:00:00Z' })
  const r = await P.addStaff(db, owner, 'old@example.test', 'auditor', origin)
  assert.equal(r.success, true)
  assert.equal(r.data.setupLink, null)
  assert.equal(log.links.length, 0)
})

await atest('add staff again before first sign-in → fresh link, no duplicate row; after sign-in → 409', async () => {
  const a = fakeDb({ existingUser: 'u1', staffRow: { id: 'pu1' } })
  const r = await P.addStaff(a.db, owner, 'x@example.test', 'sales_rep', origin)
  assert.equal(r.success, true)
  assert.equal(r.data.reissued, true)
  assert.equal(a.log.links[0].type, 'recovery')
  assert.equal(a.log.inserts.length, 0)
  const b = fakeDb({ existingUser: 'u1', staffRow: { id: 'pu1' }, lastSignIn: '2026-01-01T00:00:00Z' })
  const r2 = await P.addStaff(b.db, owner, 'x@example.test', 'sales_rep', origin)
  assert.equal(r2.success, false)
  assert.equal(r2.status, 409)
  assert.equal(b.log.links.length, 0)
})

await atest('add staff: only the Platform Owner; nothing is created otherwise', async () => {
  const { db, log } = fakeDb()
  const r = await P.addStaff(db, { userId: 'a', role: 'platform_admin' }, 'n@example.test', 'sales_rep', origin)
  assert.equal(r.success, false)
  assert.equal(r.status, 403)
  assert.equal(log.links.length + log.inserts.length, 0)
})

test('setup links: /auth/confirm verifies the token and only redirects same-origin', () => {
  const route = read('app/auth/confirm/route.ts')
  assert.match(route, /verifyOtp\(\{ token_hash: tokenHash, type \}\)/)
  assert.match(route, /safeRedirectPath\(searchParams\.get\('next'\)\)/)
  assert.match(read('proxy.ts'), /'\/auth\/confirm'/)
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

const I = await jiti.import(path.join(root, 'lib/platform/insights.ts'))

test('customer health: deductions, bands and reasons follow docs/design/console-roles.md', () => {
  const now = Date.parse('2026-11-20T12:00:00Z')
  const ago = (d) => new Date(now - d * 86_400_000).toISOString()
  const base = { lifecycle: 'active', billingHold: false, subStatus: 'active', periodEnd: ago(-200), lastSignIn: ago(1), urgentCases: 0, staleInvites: 0 }
  assert.deepEqual(I.healthScore(base, now), { score: 100, band: 'healthy', reasons: [] })
  assert.equal(I.healthScore({ ...base, lastSignIn: ago(15) }, now).score, 80, '14+ days idle: -20')
  assert.equal(I.healthScore({ ...base, lastSignIn: ago(31) }, now).score, 65, '30+ days idle: -35')
  assert.equal(I.healthScore({ ...base, lastSignIn: null }, now).reasons[0], 'Nobody has signed in yet')
  assert.equal(I.healthScore({ ...base, subStatus: 'trial', periodEnd: ago(-3) }, now).score, 85, 'trial ending within 7 days: -15')
  const bad = I.healthScore({ ...base, billingHold: true, subStatus: 'past_due', urgentCases: 2, staleInvites: 1, lastSignIn: null }, now)
  assert.equal(bad.score, 0, 'clamped at 0'); assert.equal(bad.band, 'at_risk')
  assert.equal(I.healthScore({ ...base, subStatus: 'expired', staleInvites: 1, lastSignIn: ago(20) }, now).band, 'at_risk', '100-25-10-20 = 45')
  assert.equal(I.healthScore({ ...base, subStatus: 'expired' }, now).band, 'healthy', '75 is healthy')
  assert.equal(I.healthScore({ ...base, subStatus: 'expired', urgentCases: 1 }, now).band, 'watch', '65 is watch')
})

test('sales funnel: stage counts, open total, win rate only once deals close', () => {
  assert.equal(I.funnel([{ stage: 'new' }, { stage: 'qualified' }]).winRate, null)
  const f = I.funnel([{ stage: 'new' }, { stage: 'won' }, { stage: 'won' }, { stage: 'lost' }, { stage: 'bogus' }])
  assert.equal(f.byStage.won, 2); assert.equal(f.winRate, 67); assert.equal(f.open, 2)
})

test('support ages: oldest and median in hours; labels switch to days after 48 h', () => {
  const now = Date.parse('2026-11-20T12:00:00Z')
  const h = (n) => new Date(now - n * 3_600_000).toISOString()
  assert.deepEqual(I.caseAges([h(1), h(10), h(100)], now), { oldestHours: 100, medianHours: 10 })
  assert.deepEqual(I.caseAges([h(2), h(4)], now), { oldestHours: 4, medianHours: 3 })
  assert.deepEqual(I.caseAges([], now), { oldestHours: null, medianHours: null })
  assert.equal(I.ageLabel(47), '47 h'); assert.equal(I.ageLabel(72), '3 d'); assert.equal(I.ageLabel(null), '—')
})

test('console: sign out is always reachable (user menu, rail, phone menu, authenticator step)', () => {
  const shell = read('components/platform/ConsoleShell.tsx')
  assert.match(shell, /auth\.signOut\(\)/)
  assert.ok((shell.match(/<SignOutButton \/>/g) ?? []).length >= 2, 'rail and phone drawer')
  assert.match(shell, /onSelect=\{signOut\}/, 'user menu item')
  assert.match(read('app/platform/layout.tsx'), /mfa_required[\s\S]*<ConsoleShell groups=\{\[\]\}/, 'the authenticator step uses the shell, so sign out is there too')
})

test('console home: every role has its own focus row and body', () => {
  const page = read('app/platform/page.tsx')
  for (const r of ['super_admin', 'platform_admin', 'finance_admin', 'sales_manager', 'sales_rep', 'support_agent', 'auditor']) {
    assert.match(page, new RegExp(`\\n    ${r}: \\[`), `focus row for ${r}`)
    assert.match(page, new RegExp(`\\n    ${r}: <>`), `body for ${r}`)
  }
})

console.log(`\nInternal portal: ${passed} checks passed.`)
