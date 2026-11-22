// tests/plot-map-addon.test.mjs — Interactive Plot Map is activated per project (20260080): the five states, the
// SQL and TypeScript definitions agree, the database refuses map changes unless active, and history is automatic.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
const S = await jiti.import(path.join(root, 'lib/plots/addon-states.ts'))
const sql = read('supabase/migrations/20260080_project_addons.sql')
let passed = 0
const test = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`) }

console.log('PLOT MAP ADD-ON (per project)')

test('five states: no row is not purchased; an active row past its end is expired', () => {
  const now = new Date('2026-11-22T10:00:00Z')
  assert.equal(S.addonState(null, now), 'not_purchased')
  assert.equal(S.addonState({ status: 'pending', valid_until: null }, now), 'pending')
  assert.equal(S.addonState({ status: 'active', valid_until: null }, now), 'active')
  assert.equal(S.addonState({ status: 'active', valid_until: '2026-11-22T10:00:01Z' }, now), 'active')
  assert.equal(S.addonState({ status: 'active', valid_until: '2026-11-22T10:00:00Z' }, now), 'expired', 'ends at the instant')
  assert.equal(S.addonState({ status: 'suspended', valid_until: null }, now), 'suspended')
  assert.equal(S.addonState({ status: 'suspended', valid_until: '2020-01-01T00:00:00Z' }, now), 'suspended', 'a suspension is not hidden by expiry')
  assert.equal(S.addonState({ status: 'weird', valid_until: null }, now), 'not_purchased', 'unknown values fail closed')
  assert.deepEqual([...S.ADDON_STATES], ['not_purchased', 'pending', 'active', 'suspended', 'expired'])
  for (const s of S.ADDON_STATES) assert.ok(S.STATE_INFO[s]?.customer, s)
})

test('the SQL state function derives the same five states', () => {
  assert.match(sql, /CASE WHEN a\.status = 'active' AND a\.valid_until IS NOT NULL AND a\.valid_until <= now\(\) THEN 'expired' ELSE a\.status END/)
  assert.match(sql, /\), 'not_purchased'\)/)
  assert.match(sql, /status\s+TEXT NOT NULL DEFAULT 'pending' CHECK \(status IN \('pending', 'active', 'suspended'\)\)/)
})

test('a paid period runs to the end of its last day in India', () => {
  assert.equal(S.endOfDayIst('2026-12-31'), '2026-12-31T18:29:59.999Z')
})

test('the database refuses to create, change, publish or share a map unless the project’s add-on is active', () => {
  const guard = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.guard_plot_layout()'), sql.indexOf('CREATE OR REPLACE FUNCTION public.guard_plot_layout_link()'))
  for (const w of ["TG_OP = 'INSERT'", 'NEW.geometry IS DISTINCT FROM OLD.geometry', 'NEW.share_token IS DISTINCT FROM OLD.share_token',
    "(NEW.status = 'published' AND OLD.status IS DISTINCT FROM 'published')", '(NEW.share_enabled AND NOT OLD.share_enabled)']) assert.ok(guard.includes(w), w)
  assert.match(guard, /public\.project_addon_state\(NEW\.project_id, 'plot_maps'\) <> 'active'/)
  assert.doesNotMatch(guard, /NEW\.status = 'draft'|NOT NEW\.share_enabled/, 'unpublishing and link-off are never blocked')
  const link = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.guard_plot_layout_link()'))
  assert.match(link, /IF public\.project_addon_state\(v_project, 'plot_maps'\) <> 'active' THEN/)
})

test('server-only tables, guarded ownership and automatic history', () => {
  assert.match(sql, /ALTER TABLE public\.project_addons ENABLE ROW LEVEL SECURITY;/)
  assert.match(sql, /ALTER TABLE public\.project_addon_events ENABLE ROW LEVEL SECURITY;/)
  assert.match(sql, /REVOKE ALL ON public\.project_addons, public\.project_addon_events FROM PUBLIC, anon, authenticated;/)
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.project_addon_state\(UUID, TEXT\) FROM PUBLIC, anon, authenticated;/)
  assert.match(sql, /project add-on: project belongs to another organisation/)
  assert.match(sql, /AFTER INSERT OR UPDATE ON public\.project_addons\s+FOR EACH ROW EXECUTE FUNCTION public\.log_project_addon\(\)/)
  assert.match(sql, /GRANT SELECT, INSERT ON public\.project_addon_events TO service_role;/, 'history is append-only for the app')
  assert.doesNotMatch(sql, /\b(DELETE FROM|TRUNCATE|DROP TABLE)\b/, 'additive: no existing data is touched')
})

test('suspended or expired projects serve nothing of the feature; the browser bundle gets no server code', () => {
  const page = read('app/(dashboard)/[orgSlug]/projects/[projectId]/map/page.tsx')
  assert.ok(page.indexOf("addon.state !== 'active'") < page.indexOf('listLayouts('), 'state checked before any layout is read')
  for (const f of ['components/platform/ProjectAddonControl.tsx', 'components/plots/RequestActivationButton.tsx']) {
    assert.doesNotMatch(read(f), /@\/lib\/plots\/addons'|@\/lib\/supabase\/server/, f)
  }
  assert.doesNotMatch(read('lib/plots/addon-states.ts'), /^import/m, 'pure module')
})

console.log(`\nPlot map add-on: ${passed} checks passed.`)
