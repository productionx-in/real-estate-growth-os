// tests/two-step.test.mjs — two-step verification for workspace users (lib/auth/two-step.ts, 20260106): a person who
// turned it on is asked for the code every session (pages and APIs); a workspace can require it for everyone; turning
// it off needs the current code; requiring it needs the person switching it on to use it themselves.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const T = await jiti.import(path.join(root, 'lib/auth/two-step.ts'))
const W = await jiti.import(path.join(root, 'lib/settings/workspace.ts'))
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
let passed = 0
const test = async (name, fn) => { await fn(); passed++; console.log(`  ✓ ${name}`) }
console.log('TWO-STEP VERIFICATION')

await test('who must do what: code this session, set-up when the workspace requires it, nothing otherwise', () => {
  const s = (current, hasFactor) => ({ current, hasFactor })
  assert.equal(T.twoStepNeed(s('aal2', true), true), null)
  assert.equal(T.twoStepNeed(s('aal1', true), false), 'verify')
  assert.equal(T.twoStepNeed(s('aal1', true), true), 'verify')
  assert.equal(T.twoStepNeed(s('aal1', false), true), 'enrol')
  assert.equal(T.twoStepNeed(s('aal1', false), false), null)
})

await test('reading the session level from Supabase', async () => {
  const fake = (currentLevel, nextLevel) => ({ auth: { mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel, nextLevel } }) } } })
  assert.deepEqual(await T.readTwoStep(fake('aal1', 'aal2')), { current: 'aal1', hasFactor: true })
  assert.deepEqual(await T.readTwoStep(fake('aal2', 'aal2')), { current: 'aal2', hasFactor: true })
  assert.deepEqual(await T.readTwoStep(fake('aal1', 'aal1')), { current: 'aal1', hasFactor: false })
})

await test('workspace setting: off by default; only a real true turns it on; old rows read as off', () => {
  assert.equal(W.DEFAULT_SETTINGS.security.requireTwoStep, false)
  assert.equal(W.normaliseSection('security', { requireTwoStep: true }).value.requireTwoStep, true)
  assert.equal(W.normaliseSection('security', { requireTwoStep: 'yes' }).value.requireTwoStep, false)
  assert.equal(W.settingsFromRow({}).security.requireTwoStep, false)
  assert.equal(W.settingsFromRow({ security: { requireTwoStep: true } }).security.requireTwoStep, true)
})

await test('server enforcement: every authorised API refuses a session that still owes its code or set-up', () => {
  const t = read('lib/auth/tenant.ts')
  assert.match(t, /twoStepNeed\(twoStep, false\) === 'verify'[\s\S]{0,200}TWO_STEP_REQUIRED/)
  // Each of the four authorisations starts the workspace rule read alongside its membership lookup and refuses on it.
  assert.equal((t.match(/= workspaceTwoStepBlock\(/g) ?? []).length, 4, 'org, project, inventory and lead authorisation')
  assert.equal((t.match(/const twoStepBlock = await twoStepPending\n\s*if \(twoStepBlock\) return \{ success: false, response: twoStepBlock \}/g) ?? []).length, 4, 'each refuses when the rule blocks')
  assert.match(t, /TWO_STEP_SETUP_REQUIRED/)
  assert.match(read('supabase/migrations/20260106_workspace_two_step.sql'), /ADD COLUMN IF NOT EXISTS security JSONB/)
})

await test('screens: the workspace shows the code / set-up screen; turning off asks for the code; requiring needs your own', () => {
  const layout = read('app/(dashboard)/[orgSlug]/layout.tsx')
  assert.match(layout, /twoStepNeed\(twoStep, security\.requireTwoStep\)/); assert.match(layout, /<MfaGate/)
  const panels = read('components/settings/SecurityPanels.tsx')
  assert.match(panels, /challengeAndVerify[\s\S]{0,300}unenroll/, 'code checked before the authenticator is removed')
  const route = read('app/api/settings/workspace/route.ts')
  assert.match(route, /section === 'security'[\s\S]{0,120}!access\.context\.twoStep/)
  assert.match(route, /authorizeOrgAccess\(orgId, \['owner', 'admin'\]\)/)
})

console.log(`\nTwo-step verification: ${passed} checks passed.`)
