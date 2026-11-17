// tests/entitlements-guard.test.mjs
// Every API handler of a switchable module must check the organisation's module switch on the server
// (lib/auth/entitlements.ts requireModule). Lead-capture endpoints (OAuth callbacks) and static files are exempt
// so that switching a module off never loses an enquiry.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MODULE_DIRS = { 'app/api/sales': 'sales', 'app/api/inventory': 'inventory', 'app/api/v1/inventory': 'inventory',
  'app/api/routing': 'routing', 'app/api/integrations': 'integrations', 'app/api/analytics': 'analytics',
  'app/api/site-visits': 'sales' }
const EXEMPT = new Set([
  'app/api/integrations/google/callback/route.ts', // OAuth return from Google: completes a connection already started
  'app/api/integrations/meta/callback/route.ts', // OAuth return from Meta
  'app/api/inventory/import/template/route.ts', // static CSV template, no organisation data
])
let passed = 0
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`) }
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : e.name === 'route.ts' ? [path.join(d, e.name)] : [])

console.log('MODULE ENTITLEMENTS')
test('every handler in a switchable module checks the module on the server', () => {
  const missing = []
  for (const [dir, mod] of Object.entries(MODULE_DIRS)) {
    for (const file of walk(path.join(root, dir))) {
      const rel = path.relative(root, file)
      if (EXEMPT.has(rel)) continue
      const src = fs.readFileSync(file, 'utf8')
      const handlers = (src.match(/^export async function (GET|POST|PUT|PATCH|DELETE)\b/gm) ?? []).length
      const checks = (src.match(new RegExp(`requireModule\\([^,]+, '${mod}'\\)`, 'g')) ?? []).length
      if (checks < handlers) missing.push(`${rel}: ${checks}/${handlers} handlers check '${mod}'`)
    }
  }
  assert.deepEqual(missing, [])
})

const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const { resolveModules, ALL_ON } = await jiti.import(path.join(root, 'lib/auth/entitlements.ts'))
test('a workspace with no switches keeps every module (no feature removed by default)', () => {
  assert.deepEqual(resolveModules([]), ALL_ON)
})
test('switched-off modules are off; unknown module names are ignored', () => {
  const m = resolveModules([{ module: 'inventory', enabled: false }, { module: 'sales', enabled: true }, { module: 'bogus', enabled: false }])
  assert.deepEqual(m, { ...ALL_ON, inventory: false })
})
console.log(`\nEntitlements: ${passed} checks passed.`)
