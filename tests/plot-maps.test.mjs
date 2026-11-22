// tests/plot-maps.test.mjs — interactive plot maps (add-on, 20260072): the SVG reader that turns an uploaded drawing
// into plain geometry (lib/plots/svg.ts) must never let markup through; plot names match unit numbers; the add-on is
// off unless switched on, and every route checks it; buyers never see internal statuses.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const svg = await jiti.import(path.join(root, 'lib/plots/svg.ts'))
const match = await jiti.import(path.join(root, 'lib/plots/match.ts'))
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8')
let passed = 0
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`) }

const wrap = (inner, attrs = 'viewBox="0 0 1000 600"') => `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${inner}</svg>`

console.log('PLOT MAPS')

test('a typical export: plots named by id, data-name or their group; layers and tool names are background', () => {
  const r = svg.parseLayoutSvg(wrap(`<g id="Roads"><path d="M0 300 H1000" fill="#9CA3AF"/></g>
    <g id="Plots" transform="translate(10,10)"><g id="N46"><rect x="10" y="10" width="100" height="80"/><text x="40" y="50" font-size="14">N46</text></g>
    <polygon id="N47_1_" points="120,10 220,10 220,90 120,90"/><path data-name="Plot 12" d="M230 10 L330 10 L330 90 Z"/><rect id="rect123" width="5" height="5"/></g>`))
  assert.deepEqual(r.keys, ['N46', 'N47', 'Plot 12'])
  assert.equal(r.shapes.find((s) => s.key === 'N46').transform, 'translate(10,10)', 'group transforms are kept')
  assert.equal(r.shapes[0].key, null); assert.equal(r.shapes[0].fill, '#9ca3af', 'background keeps its colour')
  assert.deepEqual(r.labels, [{ x: 40, y: 50, text: 'N46', size: 14, transform: 'translate(10,10)' }])
  assert.equal(r.viewBox, '0 0 1000 600')
})

test('nothing executable survives: scripts, handlers, links, images, styles, foreign content and javascript: values', () => {
  const r = svg.parseLayoutSvg(wrap(`<rect id="N1" width="10" height="10" onclick="alert(1)" onload="alert(2)" style="fill:url(javascript:alert(3))"/>
    <script>alert(4)</script><style>*{background:url(javascript:alert(5))}</style><foreignObject><div onclick="x()"><rect id="N2" width="1" height="1"/></div></foreignObject>
    <image href="https://evil.example/x.png"/><a href="javascript:alert(6)"><rect id="N3" width="1" height="1"/></a><use href="#N1"/>
    <rect id="N4" x="javascript:alert(7)" width="10" height="10"/><path id="N5" d="M0 0 L10 10 url(javascript:alert(8))"/>
    <rect id="N6" width="10" height="10" transform="translate(1,1) expression(alert(9))"/>`))
  const out = JSON.stringify(r)
  for (const bad of ['alert', 'javascript', 'onclick', 'onload', 'script', 'style', 'href', 'foreignObject', 'evil']) assert.ok(!out.toLowerCase().includes(bad.toLowerCase()), `"${bad}" must not survive`)
  assert.deepEqual(r.keys, ['N1', 'N6'], 'only well-formed shapes outside foreign/link content')
  for (const s of r.shapes) for (const k of Object.keys(s.attrs)) assert.ok(['d', 'points', 'x', 'y', 'width', 'height', 'rx', 'ry', 'cx', 'cy', 'r', 'x1', 'y1', 'x2', 'y2'].includes(k), k)
})

test('dangerous or unusable files are refused with a plain reason', () => {
  assert.throws(() => svg.parseLayoutSvg('<!DOCTYPE svg [<!ENTITY a "aaaaaaaa"><!ENTITY b "&a;&a;&a;">]>' + wrap('<rect width="1" height="1"/>')), /entities/)
  assert.throws(() => svg.parseLayoutSvg('<svg><rect width="1" height="1"/></svg>'), /no size/)
  assert.throws(() => svg.parseLayoutSvg(wrap('<image href="plan.png"/>')), /No shapes/)
  assert.throws(() => svg.parseLayoutSvg(wrap('<rect width="1" height="1"/>'.repeat(9000))), /more than 8000 elements/)
  assert.throws(() => svg.parseLayoutSvg(''), /empty/)
})

test('duplicate plot names: the first is clickable and the rest are reported', () => {
  const r = svg.parseLayoutSvg(wrap('<rect id="N1" width="1" height="1"/><rect id="N1_2_" width="1" height="1"/><rect id="n-1" width="1" height="1"/>'))
  assert.deepEqual(r.keys, ['N1'])
  assert.ok(r.warnings.some((w) => /more than once/.test(w)))
})

test('plot names match unit numbers whatever the spacing or dashes; ambiguous and missing ones are reported', () => {
  const units = [{ id: 'u1', unit_number: 'N-46' }, { id: 'u2', unit_number: 'N47' }, { id: 'u3', unit_number: 'P 9' }, { id: 'u4', unit_number: 'P9' }, { id: 'u5', unit_number: 'S1' }]
  const r = match.matchShapes(['N46', 'n 47', 'P9', 'X1'], units)
  assert.deepEqual(r.links.map((l) => [l.shapeKey, l.unitId]), [['N46', 'u1'], ['n 47', 'u2']])
  assert.deepEqual(r.ambiguous.sort(), ['P 9', 'P9'])
  assert.deepEqual(r.unmatchedShapes, ['X1'])
  assert.deepEqual(r.unitsWithoutShape, ['S1'])
})

test('the add-on is activated per project; every map route checks it after authorising; a read error counts as not purchased', () => {
  const addons = read('lib/plots/addons.ts')
  assert.match(addons, /if \(error \|\| !data\) return NO_PROJECT_ADDON/)
  assert.match(addons, /if \(a\.state === 'active'\) return null/, 'only active grants use')
  const upload = read('app/api/plot-layouts/route.ts')
  assert.match(upload, /authorizeOrgAccess\(orgId, \['owner', 'admin', 'manager'\]\)/)
  assert.match(upload, /requireProjectAddon\(orgId, projectId, 'plot_maps'\)/)
  assert.ok(upload.indexOf('authorizeOrgAccess(') < upload.indexOf('requireProjectAddon('), 'authorise first')
  const layout = read('app/api/plot-layouts/[layoutId]/route.ts')
  assert.match(layout, /authorizeOrgAccess\(orgId, \['owner', 'admin', 'manager'\]\)[\s\S]*layoutProject\(orgId, layoutId\)[\s\S]*if \(!takesOffline\) \{ const a = await requireProjectAddon\(orgId, projectId, 'plot_maps'\)/)
  assert.match(layout, /const takesOffline = !newLink && change\.name === undefined && change\.showPrices === undefined && change\.embedDomains === undefined && change\.publish !== true && change\.share !== true/,
    'only unpublishing / link-off skip the check')
  assert.match(read('app/(dashboard)/[orgSlug]/projects/[projectId]/map/page.tsx'), /if \(addon\.state !== 'active' \|\| !modules\.inventory\)/)
  assert.match(read('lib/dal/plot-layouts.ts'), /if \(\(await getProjectAddon\(layout\.org_id, layout\.project_id, 'plot_maps'\)\)\.state !== 'active'\) return null/,
    'a public link dies unless the project’s add-on is active')
})

test('only a Platform Owner (MFA) activates or suspends, per project, audited without customer data', () => {
  const r = read('app/api/admin/project-addons/route.ts')
  assert.match(r, /authenticatePlatformAdmin\(\['super_admin'\], true\)/)
  assert.match(r, /\.from\('projects'\)\.select\('id'\)\.eq\('org_id', b\.orgId\)\.eq\('id', b\.projectId\)/, 'the project must belong to the workspace')
  assert.match(r, /logPlatformAction\(/)
  assert.doesNotMatch(r, /inventory_items|plot_layouts/, 'the console never reads the customer’s layouts or inventory')
  const req = read('app/api/plot-maps/activation-request/route.ts')
  assert.match(req, /authorizeOrgAccess\(orgId, \['owner', 'admin'\]\)/)
  assert.match(req, /status: 'pending' as const/, 'a workspace can only ask')
  assert.match(req, /if \(current\.state === 'active' \|\| current\.state === 'suspended'\)[\s\S]*status: 409/, 'and never touches an active or suspended entitlement')
})

test('buyers see available, reserved or sold — never blocked or on hold — and prices only when shown; links are 256-bit', async () => {
  const dal = read('lib/dal/plot-layouts.ts')
  const fn = new Function(`return ${dal.match(/export function publicStatus[\s\S]*?\n\}/)[0].replace('export function publicStatus', 'function').replace(/: string\)/, ')').replace(/\): 'available' \| 'reserved' \| 'sold' \{/, ') {')}`)()
  assert.deepEqual(['available', 'on_hold', 'blocked', 'booked', 'sold'].map(fn), ['available', 'reserved', 'reserved', 'sold', 'sold'])
  assert.match(dal, /liveFrom\(layout\.org_id, layout, layout\.show_prices\)/, 'prices follow the developer’s choice')
  assert.match(dal, /crypto\.randomBytes\(32\)\.toString\('base64url'\)/)
  assert.match(dal, /if \(!change\.publish\) patch\.share_enabled = false/, 'unpublishing turns the public link off')
  assert.match(read('proxy.ts'), /\/\^\\\/m\\\/\[A-Za-z0-9_-\]\{43\}\$\/\.test\(pathname\)/)
  assert.match(read('app/m/[token]/page.tsx'), /robots: \{ index: false, follow: false \}/)
})

test('the map draws geometry as React elements only, never HTML', () => {
  for (const f of ['components/plots/PlotMap.tsx', 'components/plots/LayoutManager.tsx', 'app/m/[token]/page.tsx']) assert.doesNotMatch(read(f), /dangerouslySetInnerHTML|innerHTML/, f)
})

console.log(`\nPlot maps: ${passed} checks passed.`)
