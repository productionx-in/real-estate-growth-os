// tests/plot-map-publishing.test.mjs — Interactive Plot Map review and publishing (20260083): the order of steps,
// who may take them, one published version per map with history kept, and the public map — an allow-listed JSON API,
// the page image only through the share link, enquiries and site-visit requests through the normal lead intake.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
const sql = read('supabase/migrations/20260083_plot_map_publishing.sql')
const dal = read('lib/dal/plot-map-publishing.ts')
let passed = 0
const test = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`) }

console.log('PLOT MAP PUBLISHING')

test('the order is enforced in the database: submit → QA → approve → publish; send back from review or approval', () => {
  for (const [a, rule] of [
    ['submit', /IF v\.status NOT IN \('draft', 'rejected'\) THEN RAISE EXCEPTION 'plot map review: only a draft can be submitted/],
    ['submit', /draw at least one plot first/],
    ['approve', /record a QA pass before approving/],
    ['approve', /action = 'qa_passed' AND created_at >= COALESCE\(last_submit, '-infinity'\)/],
    ['publish', /IF v\.status <> 'approved' THEN RAISE EXCEPTION 'plot map review: only an approved version can be published/],
    ['reject', /IF v\.status NOT IN \('in_review', 'approved'\)/],
  ]) assert.match(sql, rule, a)
  assert.match(sql, /project_addon_state\(v\.project_id, 'plot_maps'\) <> 'active'/)
})

test('publishing replaces, never overwrites: the previous version is superseded and kept; one published version per map', () => {
  assert.match(sql, /UPDATE public\.plot_map_versions SET status = 'superseded' WHERE id = prev;/)
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS uq_plot_map_versions_published ON public\.plot_map_versions \(layout_id\) WHERE status = 'published';/)
  assert.match(sql, /UPDATE public\.plot_layouts SET published_version_id = p_version, status = 'published'/)
  assert.doesNotMatch(sql, /DELETE FROM public\.plot_map_(shapes|versions)/, 'old geometry and links are kept')
})

test('review history is append-only and server-only', () => {
  assert.match(sql, /plot map reviews are append-only/)
  assert.match(sql, /BEFORE UPDATE OR DELETE ON public\.plot_map_reviews/)
  assert.match(sql, /ALTER TABLE public\.plot_map_reviews ENABLE ROW LEVEL SECURITY;/)
  assert.match(sql, /REVOKE ALL ON public\.plot_map_reviews FROM PUBLIC, anon, authenticated;/)
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.plot_map_version_action\(UUID, UUID, UUID, TEXT, TEXT\) FROM PUBLIC, anon, authenticated;/)
})

test('managers prepare and check; only owners and admins approve, send back and publish (checked on the server)', () => {
  assert.match(dal, /approve: \['owner', 'admin'\],\s*reject: \['owner', 'admin'\],\s*publish: \['owner', 'admin'\],/)
  assert.match(dal, /submit: \['owner', 'admin', 'manager'\],/)
  const route = read('app/api/plot-maps/versions/[versionId]/review/route.ts')
  assert.match(route, /gatePlotMapWrite\(orgId, \(\) => versionProjectId\(orgId, versionId\)\)/)
  assert.match(route, /if \(!ACTION_ROLES\[action\]\.includes\(g\.context\.role\)\)/)
  assert.ok(route.indexOf('gatePlotMapWrite(') < route.indexOf('ACTION_ROLES[action]'), 'authorise, then check the step')
  assert.match(route, /plot_map\.version_\$\{action\}/)
})

test('submitting re-runs the editor’s checks on what was saved; sending back needs a reason', () => {
  assert.match(dal, /if \(!isSubmittable\(check\)\)/)
  assert.match(dal, /if \(action === 'reject' && !comment\?\.trim\(\)\)/)
})

test('the public JSON is an explicit, validated allow-list — no ids, buyers, bookings, holds or storage paths', () => {
  const r = read('app/api/public/plot-maps/[token]/route.ts')
  assert.match(r, /status: z\.enum\(\['available', 'reserved', 'sold'\]\)/)
  assert.match(r, /\}\)\.strict\(\)/)
  assert.match(r, /PublicMap\.parse\(/)
  assert.match(r, /price: map\.showPrices && p\.price != null \? Number\(p\.price\) : null/)
  for (const leak of ['unitId', 'imagePath', 'orgId', 'internal_notes', 'lead', 'booking']) assert.doesNotMatch(r.slice(r.indexOf('PublicMap.parse')), new RegExp(leak), leak)
  assert.match(read('lib/dal/plot-layouts.ts'), /p\.status = publicStatus\(p\.status\); p\.unitId = ''/, 'the public page gets no internal ids either')
})

test('buyers get the page image only through the share link, and only the published version’s', () => {
  const img = read('app/api/public/plot-maps/[token]/image/route.ts')
  assert.match(img, /const map = await openSharedLayout\(token\)/)
  assert.match(img, /readVersionImage\(map\.imagePath\)/)
  assert.match(read('lib/dal/plot-layouts.ts'), /if \(live\.image\) live\.image\.href = `\/api\/public\/plot-maps\/\$\{token\}\/image`/)
  assert.match(dal, /if \(!v \|\| v\.status !== 'published' \|\| !v\.image_width \|\| !v\.image_height\) return null/)
  const page = read('app/m/[token]/page.tsx')
  assert.doesNotMatch(page, /orgId|imagePath/, 'server-only fields are never passed to the browser')
})

test('enquiries and site-visit requests: server-resolved project, strict body, honeypot, rate limits, available plots only', () => {
  const e = read('app/api/public/plot-maps/[token]/enquiry/route.ts')
  assert.match(e, /\}\)\.strict\(\)/)
  assert.match(e, /if \(b\.website\) return NextResponse\.json\(\{ success: true \}\) \/\/ bot/)
  assert.match(e, /limit: 10, windowMs: 300_000/); assert.match(e, /limit: 60, windowMs: 60_000/)
  assert.match(e, /if \(!plot \|\| plot\.status !== 'available'\)/)
  assert.match(e, /processInboundLead\(map\.orgId, \{[\s\S]*\}, \{ projectId: map\.projectId \}\)/)
  assert.match(e, /preferred_visit_date/)
  assert.doesNotMatch(e, /orgId:|projectId: b\./, 'never taken from the request body')
})

test('maps refresh themselves while visible; the public page can be embedded in a compact mode', () => {
  const ar = read('components/plots/AutoRefresh.tsx')
  assert.match(ar, /document\.visibilityState === 'visible'/)
  assert.match(read('app/m/[token]/page.tsx'), /<AutoRefresh seconds=\{30\} \/>/)
  assert.match(read('app/(dashboard)/[orgSlug]/projects/[projectId]/map/page.tsx'), /<AutoRefresh seconds=\{30\} \/>/)
  assert.match(read('app/m/[token]/page.tsx'), /const embed = \(await searchParams\)\.embed === '1'/)
})

console.log(`\nPlot map publishing: ${passed} checks passed.`)
