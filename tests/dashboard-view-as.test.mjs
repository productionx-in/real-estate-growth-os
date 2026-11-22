// tests/dashboard-view-as.test.mjs — the home page greeting (India time) and "View as": only owners, admins and
// managers, only active members of the same workspace (checked on the server), never oneself; the preview computes
// the board and summary exactly as for that person's role.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const G = await jiti.import(path.join(root, 'lib/dashboard/greeting.ts'))
let passed = 0
const test = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`) }

console.log('DASHBOARD VIEW AS')

test('greeting follows India time', () => {
  assert.equal(G.greeting(new Date('2026-11-23T03:30:00Z')).hello, 'Good morning') // 09:00 IST
  assert.equal(G.greeting(new Date('2026-11-23T08:30:00Z')).hello, 'Good afternoon') // 14:00 IST
  assert.equal(G.greeting(new Date('2026-11-23T14:30:00Z')).hello, 'Good evening') // 20:00 IST
  assert.equal(G.greeting(new Date('2026-11-22T20:30:00Z')).hello, 'Good evening') // 02:00 IST
  assert.match(G.greeting(new Date('2026-11-23T03:30:00Z')).date, /Monday.*23.*November/)
  assert.equal(G.firstName('  Asha  Rao '), 'Asha'); assert.equal(G.firstName(null), 'there')
})

test('view as: managers only, active members of this workspace only, never oneself, server-checked', () => {
  const page = read('app/(dashboard)/[orgSlug]/page.tsx')
  assert.match(page, /const members = isManager\s*\?/)
  assert.match(page, /\.eq\('org_id', org\.id\)\.eq\('status', 'active'\)\.neq\('profile_id', profile\.id\)/)
  assert.match(page, /const target = isManager && as && z\.string\(\)\.uuid\(\)\.safeParse\(as\)\.success \? members\.find\(\(m\) => m\.profile_id === as\) \?\? null : null/)
  assert.match(page, /const mine = leadScopeOf\(viewRole\) !== 'all'/)
  assert.match(page, /profileId: mine \? viewProfileId : null/)
  assert.match(page, /role=\{viewRole\}\s*profileId=\{viewProfileId\}/)
  assert.match(page, /const setup = !target && isManager/, 'no setup checklist inside a preview')
  assert.match(page, /Back to my view/)
})

console.log(`\nDashboard view as: ${passed} checks passed.`)
