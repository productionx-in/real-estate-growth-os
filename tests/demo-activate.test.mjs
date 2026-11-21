// tests/demo-activate.test.mjs — a website demo request can be seen, activated into a workspace, and the owner
// invited even when e-mail is not set up (a one-time link for the verified Platform Owner to share).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8')
let passed = 0
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`) }
console.log('DEMO REQUEST → ACTIVATE')
test('new requests are visible: red Sales badge and a banner on Organisations', () => {
  assert.match(read('lib/platform/portal.ts'), /newRequests: p\.filter\(\(x\) => x\.stage === 'new'\)\.length/)
  assert.match(read('app/platform/layout.tsx'), /href: '\/platform\/sales\?stage=new'[^}]*badge: counts\.newRequests, badgeTone: 'alert'/)
  assert.match(read('app/platform/organisations/page.tsx'), /Review and activate/)
})
test('Activate: only the Platform Owner, prefilled from the request, and the request is linked to the workspace', () => {
  assert.match(read('app/platform/sales/[id]/page.tsx'), /role === 'super_admin'[\s\S]*\/admin\/provision\?prospect=\$\{p\.id\}/)
  const page = read('app/(dashboard)/admin/provision/page.tsx')
  assert.match(page, /platformUser\.role !== 'super_admin'/); assert.match(page, /if \(p && !p\.linked_org_id\)/)
  const route = read('app/api/admin/organisations/provision/route.ts')
  assert.match(route, /authenticatePlatformAdmin\(\['super_admin'\], true\)/)
  assert.match(route, /update\(\{ linked_org_id: orgId, stage: 'trial_started'/)
})
test('the invitation link goes only to the verified Platform Owner; never the token hash', () => {
  const route = read('app/api/admin/organisations/provision/route.ts')
  assert.match(route, /inviteUrl: shareUrl/); assert.doesNotMatch(route, /tokenHash[^\n]*NextResponse\.json|token_hash: tokenHash[^\n]*\}\s*,\s*\{ status: 201/)
  const re = read('app/api/admin/organisations/[orgId]/invite-link/route.ts')
  assert.match(re, /authenticatePlatformAdmin\(\['super_admin'\], true\)/); assert.match(re, /eq\('status', 'pending'\)/)
  assert.match(re, /action: 'invitation\.link_reissued'/); assert.doesNotMatch(re, /metadata: \{[^}]*url/, 'the link is never written to the audit log')
})
test('a re-issued link replaces the old one (new token hash, fresh 14-day expiry)', () => {
  const re = read('app/api/admin/organisations/[orgId]/invite-link/route.ts')
  assert.match(re, /token_hash: crypto\.createHash\('sha256'\)\.update\(raw\)\.digest\('hex'\), expires_at: expiresAt/)
  assert.match(re, /14 \* 86_400_000/)
})
console.log(`\nDemo activation: ${passed} checks passed.`)
