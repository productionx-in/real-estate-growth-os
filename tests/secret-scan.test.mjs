// tests/secret-scan.test.mjs — the repository holds no credentials, the scanner catches the formats that matter
// (examples are assembled at run time so this file itself stays clean), and fixed development fallbacks can never
// protect production data.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root }, moduleCache: false })
let passed = 0
async function test(name, fn) { await fn(); passed++; console.log(`  ✓ ${name}`) }
const { scanText } = await import(path.join(root, 'scripts/security/scan-secrets.mjs'))
const j = (...p) => p.join('')
const hex = (n) => Array.from({ length: n }, (_, i) => '0123456789abcdef'[(i * 7 + 3) % 16]).join('')
const alnum = (n) => Array.from({ length: n }, (_, i) => 'aZ3kQ9mW2xB7pL5tR8vN4cY6'[(i * 5 + 1) % 24]).join('')

console.log('SECRET SCAN')
await test('the working tree contains no credential (same check as CI and the pre-commit hook)', async () => {
  const out = execFileSync(process.execPath, [path.join(root, 'scripts/security/scan-secrets.mjs')], { cwd: root, encoding: 'utf8' })
  assert.match(out, /No secrets found \(tree\)/)
})

await test('detects bearer tokens, provider keys, JWTs, private keys and assigned secrets; never prints the value', async () => {
  const value = alnum(40)
  const cases = {
    'bearer-literal': j('curl -H "Authorization: Bear', 'er ', value, '"'),
    'repx-api-key': j("const k = 'px_li", 've_', hex(48), "'"),
    'razorpay-key': j("rz = 'rzp_li", 've_', alnum(14), "'"),
    'jwt': j('t = "ey', 'JhbGciOiJIUzI1NiJ9.ey', 'Jpc3MiOiJyZWFsLXByb2plY3QifQ.', alnum(30), '"'),
    'private-key': j('-----BEGIN ', 'PRIVATE KEY-----'),
    'assigned-secret': j("const RESEND_API_KEY = '", alnum(32), "'"),
    'github-token': j('gh', 'p_', alnum(36)),
    'url-credentials': j('postgres://admin:', alnum(16), '@db.example.org:5432/x'),
    'otpauth-uri': j('otp', 'auth://totp/REbyPX:a?secret=', 'JBSWY3DPEHPK3PXPJBSWY3DP', '&issuer=x'),
  }
  for (const [rule, line] of Object.entries(cases)) {
    const found = scanText('src/example.ts', line)
    assert.ok(found.some((f) => f.rule === rule), `${rule} not detected`)
    for (const f of found) assert.ok(!line.includes(f.preview.replace(/….*$/, '')) || f.preview.length < 20, 'preview is masked')
    assert.ok(found.every((f) => !f.preview.includes(value)), 'value never printed')
  }
})

await test('placeholders, template references and local Supabase demo keys are not reported', async () => {
  for (const line of ['Authorization: Bearer px_live_YOUR_API_KEY', 'Authorization: Bearer ${token}', 'Authorization: Bearer <key>', "headers: { Authorization: `Bearer ${this.apiKey}` }"]) {
    assert.deepEqual(scanText('src/x.ts', line), [], line)
  }
  const demo = j('ey', 'JhbGciOiJIUzI1NiJ9.', Buffer.from(JSON.stringify({ iss: 'supabase-demo', role: 'anon' })).toString('base64url'), '.', alnum(30))
  assert.deepEqual(scanText('tests/x.mjs', `const anon = '${demo}'`), [])
})

await test('private demo login sheets, env and key files can never be committed', async () => {
  for (const f of ['.demo-credentials/DEMO-LOGINS-local.md', 'x/.demo-credentials/a.json', '.env', '.env.local', 'certs/server.pem']) {
    assert.deepEqual(scanText(f, 'anything').map((x) => x.rule), ['forbidden-file'], f)
  }
  assert.deepEqual(scanText('.env.example', 'NEXT_PUBLIC_APP_URL=https://app.example.test'), [])
  assert.equal(execFileSync('git', ['ls-files', '.demo-credentials'], { cwd: root, encoding: 'utf8' }).trim(), '', 'no login sheet is tracked')
  assert.match(fs.readFileSync(path.join(root, '.gitignore'), 'utf8'), /^\.demo-credentials\/$/m)
})

await test('allowlisted fixtures are pinned by hash: changing the value makes it reportable again', async () => {
  const allow = JSON.parse(fs.readFileSync(path.join(root, 'scripts/security/allowlist.json'), 'utf8'))
  assert.ok(allow.every((a) => /^[0-9a-f]{64}$/.test(a.sha256) && a.file && a.rule && a.reason), 'each entry has file, rule, hash and reason')
  assert.ok(scanText(allow[0].file, j("const SECRET_KEY = '", alnum(30), "'")).length > 0, 'a different value in the same file is reported')
})

await test('no browser-exposed variable carries a secret-like name', async () => {
  const files = execFileSync('git', ['ls-files', 'app', 'lib', 'components', 'proxy.ts'], { cwd: root, encoding: 'utf8' }).split('\n').filter((f) => /\.(ts|tsx)$/.test(f))
  const names = new Set(files.flatMap((f) => fs.readFileSync(path.join(root, f), 'utf8').match(/NEXT_PUBLIC_[A-Z0-9_]+/g) ?? []))
  for (const n of names) assert.doesNotMatch(n, /SECRET|SERVICE_ROLE|PRIVATE|PASSWORD|TOKEN|WEBHOOK/, n)
  assert.equal(execFileSync('git', ['ls-files', '.env', '.env.*', '*.pem', '*.key'], { cwd: root, encoding: 'utf8' }).trim(), '', 'no env or key files tracked')
})

await test('fixed development fallbacks refuse on a production deployment and work locally', async () => {
  const { devOnlyFallback } = await jiti.import(path.join(root, 'lib/security/dev-fallback.ts'))
  assert.equal(devOnlyFallback('X', 'dev-value', { VERCEL_ENV: 'preview' }), 'dev-value')
  assert.throws(() => devOnlyFallback('ENCRYPTION_KEY', 'dev-value', { VERCEL_ENV: 'production' }), /ENCRYPTION_KEY is not configured/)
  for (const f of ['lib/integrations/crypto.ts', 'lib/integrations/meta/oauth.ts', 'lib/integrations/google/oauth.ts']) {
    const src = fs.readFileSync(path.join(root, f), 'utf8')
    assert.match(src, /devOnlyFallback\(/, f)
    assert.doesNotMatch(src, /\|\|\s*'real-estate-growth-os-[a-z-]+-2026'/, `${f}: no bare literal fallback`)
  }
})

await test('the encryption key never falls back to the public seed in production', async () => {
  const saved = { ...process.env }
  try {
    for (const k of ['ENCRYPTION_KEY', 'META_APP_SECRET', 'SUPABASE_SERVICE_ROLE_KEY']) delete process.env[k]
    process.env.VERCEL_ENV = 'production'
    const { encryptCredential } = await jiti.import(path.join(root, 'lib/integrations/crypto.ts'))
    assert.throws(() => encryptCredential('token'), /ENCRYPTION_KEY is not configured/)
    process.env.VERCEL_ENV = 'development'
    assert.match(encryptCredential('token'), /^vault:\/\/aes256gcm:/)
  } finally { process.env = saved }
})

await test('the API documentation shows a placeholder key, not a realistic one', async () => {
  const src = fs.readFileSync(path.join(root, 'components/integrations/DeveloperApiDocsModal.tsx'), 'utf8')
  assert.match(src, /Bearer px_live_YOUR_API_KEY/)
  assert.doesNotMatch(src, /px_live_[0-9a-f]{8,}/)
  assert.doesNotMatch(src, /@gmail\.com/)
})

console.log(`Secret scan: ${passed} checks passed`)
