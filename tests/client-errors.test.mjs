// tests/client-errors.test.mjs — errors in the browser: a tab left open across a release reloads itself once (no
// loop); every error shows a reference; browser errors reach the server logs sanitised; and "Your account" stays
// inside the workspace while two-step verification returns to where it was opened from.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const C = await jiti.import(path.join(root, 'lib/errors/client.ts'))
let passed = 0
const test = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`) }

console.log('CLIENT ERRORS')

test('stale-release errors are recognised; ordinary errors are not', () => {
  for (const m of ['Loading chunk 812 failed.', 'Failed to fetch dynamically imported module: https://x/_next/a.js', 'Failed to find Server Action "abc". This request might be from an older or newer deployment.', 'Importing a module script failed.'])
    assert.equal(C.isStaleBuildError({ name: 'Error', message: m }), true, m)
  assert.equal(C.isStaleBuildError({ name: 'ChunkLoadError', message: '' }), true)
  for (const m of ["Cannot read properties of undefined (reading 'map')", 'Network request failed'])
    assert.equal(C.isStaleBuildError({ name: 'TypeError', message: m }), false, m)
  assert.equal(C.isStaleBuildError(null), false)
})

test('references are short and readable; reports are sanitised', () => {
  assert.match(C.clientReference(), /^C-[A-Z0-9]{6}$/)
  const r = C.sanitiseReport({ ref: 'C-ABC234', name: 'TypeError', message: 'bad a.b@example.com 9876543210\nnext', path: '/org/leads?phone=98765#x', stale: 'yes' })
  assert.equal(r.message, 'bad [email] [number] next'); assert.equal(r.path, '/org/leads'); assert.equal(r.stale, false)
  assert.equal(C.sanitiseReport({ ref: '<script>' }).ref, 'C-INVALID')
  assert.equal(C.sanitiseReport({ path: 'https://evil.example/x' }).path, '')
  assert.ok(C.sanitiseReport({ message: 'x'.repeat(5000) }).message.length <= 500)
})

test('the error pages reload once for a stale release, guarded against loops, and always show a reference', () => {
  for (const f of ['app/error.tsx', 'app/global-error.tsx']) {
    const s = read(f)
    assert.match(s, /isStaleBuildError\(error\)/, f)
    assert.match(s, /Date\.now\(\) - last > 60_000[\s\S]*sessionStorage\.setItem[\s\S]*window\.location\.reload\(\)/, f)
    assert.match(s, /error\.digest \? reset\(\) : window\.location\.reload\(\)/, f)
  }
  const page = read('app/error.tsx')
  assert.match(page, /useState\(\(\) => error\.digest \?\? clientReference\(\)\)/)
  assert.doesNotMatch(page, /\{error\.digest && \(/, 'the reference is shown for browser errors too')
  const api = read('app/api/client-errors/route.ts')
  assert.match(api, /checkDistributedRateLimit/); assert.match(api, /sanitiseReport\(body\)/); assert.match(api, /raw\.length > 4000/)
})

test('"Your account" opens the workspace profile; two-step verification returns to the settings it came from', () => {
  assert.match(read('components/team/TeamManagementClient.tsx'), /href=\{`\/\$\{orgSlug\}\/settings\/profile`\}[^>]*>Your account</)
  assert.match(read('app/(dashboard)/[orgSlug]/settings/security/page.tsx'), /\/account\/security\?next=\$\{encodeURIComponent\(`\/\$\{orgSlug\}\/settings\/security`\)\}/)
  const sec = read('app/account/security/page.tsx')
  assert.match(sec, /safeRedirectPath\(raw, ''\)/, 'next is validated as a same-site path')
  assert.match(sec, /const href = next \|\| \(staff \? '\/platform' : '\/select-org'\)/)
})

console.log(`\nClient errors: ${passed} checks passed.`)
