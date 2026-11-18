// tests/workspace-select.test.mjs — choosing a workspace after sign-in (lib/workspace/select.ts) and the guards on
// /select-org and /create-org. Module test: no database.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const S = await jiti.import(path.join(root, 'lib/workspace/select.ts'))
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8')
let passed = 0
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`) }

console.log('WORKSPACE SELECTION')
const A = { slug: 'abc-realty', name: 'ABC Realty', type: 'channel_partner', role: 'owner' }
const B = { slug: 'abc-developers', name: 'ABC Developers', type: 'developer', role: 'admin' }

test('no workspace: an explained empty state, never a dead end', () => {
  assert.deepEqual(S.resolveWorkspaceDestination([], '/abc-realty/leads'), { kind: 'none' })
})

test('one workspace: open it, or the intended page inside it', () => {
  assert.deepEqual(S.resolveWorkspaceDestination([A], null), { kind: 'redirect', to: '/abc-realty' })
  assert.deepEqual(S.resolveWorkspaceDestination([A], '/abc-realty/leads?tag=nri'), { kind: 'redirect', to: '/abc-realty/leads?tag=nri' })
})

test('several workspaces: the intended page is kept only inside one of them; otherwise choose', () => {
  assert.deepEqual(S.resolveWorkspaceDestination([A, B], '/abc-developers/partners'), { kind: 'redirect', to: '/abc-developers/partners' })
  assert.deepEqual(S.resolveWorkspaceDestination([A, B], '/someone-else/leads'), { kind: 'choose' }, 'not a member: no shortcut')
  assert.deepEqual(S.resolveWorkspaceDestination([A, B], null), { kind: 'choose' })
})

test('unsafe destinations are ignored', () => {
  for (const bad of ['https://evil.test/abc-realty', '//evil.test/abc-realty', '/\\evil.test', 'javascript:alert(1)']) {
    assert.deepEqual(S.resolveWorkspaceDestination([A, B], bad), { kind: 'choose' }, bad)
  }
})

test('labels: developer and channel partner agency are named plainly', () => {
  assert.equal(S.ORG_TYPE_LABEL.developer, 'Developer')
  assert.equal(S.ORG_TYPE_LABEL.channel_partner, 'Channel partner agency')
})

test('guards: membership is read on the server; creating an organisation is checked on the server', () => {
  const page = read('app/(dashboard)/select-org/page.tsx')
  assert.match(page, /\.eq\('profile_id', profile\.id\)/)
  assert.match(page, /\.eq\('status', 'active'\)/)
  assert.match(page, /resolveWorkspaceDestination\(/)
  assert.doesNotMatch(page, /redirect\('\/create-org'\)/, 'no redirect into a page that refuses the user')
  assert.match(read('app/(dashboard)/create-org/page.tsx'), /canCreateOrganisation\(/)
  assert.match(read('app/api/orgs/route.ts'), /super_admin/, 'the API still refuses everyone else')
})

console.log(`\nWorkspace selection: ${passed} checks passed.`)
