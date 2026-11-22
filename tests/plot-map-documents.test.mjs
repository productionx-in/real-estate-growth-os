// tests/plot-map-documents.test.mjs — Interactive Plot Map document intake (20260081): files are judged by their
// real bytes, PDFs are parsed on the server, render sizes are decided by the server, storage stays private, every
// route runs the same gate, and versions never overwrite one another.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'
import { jpeg, pdf, png } from './helpers/plot-files.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
const F = await jiti.import(path.join(root, 'lib/plots/files.ts'))
const { inspectPdf } = await jiti.import(path.join(root, 'lib/plots/pdf-inspect.ts'))
const sql = read('supabase/migrations/20260081_plot_map_documents.sql')
let passed = 0
const tests = []
const test = (name, fn) => tests.push([name, fn])

test('the kind comes from the bytes; the name and declared type must agree with each other', () => {
  assert.equal(F.sniffKind(pdf()), 'pdf'); assert.equal(F.sniffKind(png(700, 700)), 'png'); assert.equal(F.sniffKind(jpeg(800, 600)), 'jpeg')
  assert.equal(F.sniffKind(new Uint8Array(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))), null, 'SVG, HTML and others are refused')
  assert.equal(F.declaredKind('application/pdf', 'Layout.PDF'), 'pdf')
  assert.equal(F.declaredKind('image/jpg', 'scan.jpeg'), 'jpeg')
  assert.equal(F.declaredKind('image/png', 'layout.pdf'), null, 'name and type disagree')
  assert.equal(F.declaredKind('image/svg+xml', 'layout.svg'), null)
  assert.deepEqual(F.checkUploadRequest('application/pdf', 'a.pdf', 26 * 1024 * 1024), { error: 'The file is larger than 25 MB.' })
  assert.deepEqual(F.checkUploadRequest('image/png', 'a.png', 16 * 1024 * 1024), { error: 'The file is larger than 15 MB.' })
  assert.deepEqual(F.checkUploadRequest('image/png', 'a.png', 1000), { kind: 'png' })
  assert.equal(F.cleanFileName('C:\\plans\\..\\Phase 1\u0007<final>.pdf'), 'Phase 1final.pdf')
})

test('image headers: real dimensions, too-small scans refused, renders must be exactly the size asked for', () => {
  assert.deepEqual(F.pngSize(png(700, 650)), { width: 700, height: 650 })
  assert.deepEqual(F.jpegSize(jpeg(1600, 1200)), { width: 1600, height: 1200 })
  assert.match(F.checkSourceImage(png(500, 900), 'png').error, /too small/)
  assert.deepEqual(F.checkSourceImage(jpeg(1600, 1200), 'jpeg'), { width: 1600, height: 1200 })
  assert.equal(F.checkRender(png(300, 260), { width: 300, height: 260 }, 'page'), null)
  assert.match(F.checkRender(png(300, 261), { width: 300, height: 260 }, 'page'), /does not match/)
  assert.match(F.checkRender(jpeg(300, 260), { width: 300, height: 260 }, 'page'), /not a PNG/)
  assert.match(F.checkRender(png(600, 300), { width: 0, height: 0 }, 'thumb'), /thumbnail is too large/)
})

test('render size: PDFs render at a 4096 px long edge; images are never enlarged; rotation swaps the sides', () => {
  assert.deepEqual(F.expectedRender({ width: 842, height: 595 }, 0, 'pdf'), { width: 4096, height: 2894, scale: 4096 / 842 })
  assert.deepEqual(F.expectedRender({ width: 842, height: 595 }, 90, 'pdf').width, 2894)
  assert.deepEqual(F.expectedRender({ width: 1600, height: 1200 }, 0, 'jpeg'), { width: 1600, height: 1200, scale: 1 })
  assert.deepEqual(F.expectedRender({ width: 9000, height: 3000 }, 270, 'png'), { width: 1365, height: 4096, scale: 4096 / 9000 })
  assert.match(read('lib/plots/browser-render.ts'), /expectedRender\(page, rotation, kind\)/, 'the browser uses the server’s own function')
})

test('PDFs are parsed on the server: pages, sizes and their own rotation; garbage is refused', async () => {
  const r = await inspectPdf(pdf())
  assert.equal(r.ok, true)
  assert.deepEqual(r.pages, [{ page: 1, width: 842, height: 595, rotate: 0 }, { page: 2, width: 842, height: 595, rotate: 90 }])
  const bad = await inspectPdf(new Uint8Array(Buffer.from('%PDF-1.4\nthis is not a pdf')))
  assert.equal(bad.ok, false)
  const many = await inspectPdf(pdf(Array.from({ length: 21 }, () => [595, 842, 0])))
  assert.match(many.error, /21 pages/)
  const src = read('lib/plots/pdf-inspect.ts')
  assert.match(src, /isEvalSupported: false/); assert.match(src, /PasswordException/)
  assert.match(src, /globalThis as \{ pdfjsWorker\?: unknown \}\)\.pdfjsWorker = worker/, 'the worker is bundled, not fetched at run time')
  assert.doesNotMatch(read('next.config.ts'), /serverExternalPackages/, 'externalising pdfjs-dist breaks the webpack build of the browser worker')
})

test('storage is private: no public bucket and no storage policies, so only the server reads or writes', () => {
  assert.match(sql, /VALUES \('plot-map-files', 'plot-map-files', false, 26214400, ARRAY\['application\/pdf', 'image\/png', 'image\/jpeg'\]\)/)
  assert.doesNotMatch(sql, /CREATE POLICY/i)
  const dal = read('lib/dal/plot-map-documents.ts')
  assert.match(dal, /const SIGNED_READ_SECONDS = 120/)
  assert.doesNotMatch(dal, /getPublicUrl/)
})

test('the server checks what actually arrived, and keeps nothing it rejects', () => {
  const dal = read('lib/dal/plot-map-documents.ts')
  const complete = dal.slice(dal.indexOf('export async function completeDocumentUpload'), dal.indexOf('export async function originalReadUrl'))
  for (const s of ["if (doc.status !== 'uploading')", 'bytes.length !== Number(doc.byte_size)', 'sniffKind(bytes)', 'if (kind !== doc.kind)', 'inspectPdf(bytes)', 'checkSourceImage(bytes, kind)', "createHash('sha256')"]) assert.ok(complete.includes(s), s)
  assert.match(complete, /await storage\(\)\.remove\(\[doc\.storage_path\]\) \/\/ a rejected file is not kept/)
  const cv = dal.slice(dal.indexOf('export async function createVersion'), dal.indexOf('export async function retryVersionUpload'))
  assert.match(cv, /if \(expect\.width !== input\.width \|\| expect\.height !== input\.height\)/, 'the server decides the render size')
  assert.match(cv, /rpc\('next_plot_map_version_no'/)
})

test('every route: managers and above, Inventory on, the project’s add-on active — then rate limits and audit', () => {
  const gate = read('lib/plots/gate.ts')
  assert.match(gate, /authorizeOrgAccess\(orgId, \['owner', 'admin', 'manager'\]\)[\s\S]*requireModule\(orgId, 'inventory'\)[\s\S]*requireProjectAddon\(orgId, pid, 'plot_maps'\)/)
  for (const f of ['app/api/plot-maps/documents/route.ts', 'app/api/plot-maps/documents/[documentId]/route.ts', 'app/api/plot-maps/versions/route.ts', 'app/api/plot-maps/versions/[versionId]/route.ts']) {
    const src = read(f)
    assert.match(src, /gatePlotMapWrite\(orgId,/, f)
    for (const h of src.match(/export async function (GET|POST)[\s\S]*?\n\}/g)) assert.match(h, /gatePlotMapWrite\(/, `${f}: every handler`)
  }
  assert.match(read('app/api/plot-maps/documents/route.ts'), /limit: 3, windowMs: 60_000[\s\S]*limit: 20, windowMs: 86_400_000/)
  assert.match(read('app/api/plot-maps/documents/route.ts'), /\.strict\(\)/)
  assert.match(read('app/api/plot-maps/versions/route.ts'), /plot_map\.version_created/)
})

test('versions never overwrite: identity is fixed, published history is frozen, numbers are taken under a lock', () => {
  assert.match(sql, /plot map version: its source, page and rotation cannot change \(make a new version\)/)
  assert.match(sql, /a published or superseded version cannot be changed/)
  assert.match(sql, /PERFORM 1 FROM public\.plot_layouts WHERE id = p_layout FOR UPDATE;/)
  assert.match(sql, /UNIQUE \(layout_id, version_no\)/)
  assert.match(sql, /plot map document: the original and its identity cannot change/)
  for (const t of ['plot_map_documents', 'plot_map_versions']) assert.match(sql, new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY;`))
  assert.match(sql, /REVOKE ALL ON public\.plot_map_documents, public\.plot_map_versions FROM PUBLIC, anon, authenticated;/)
  assert.match(sql, /GRANT SELECT, INSERT, UPDATE ON public\.plot_map_documents, public\.plot_map_versions TO service_role;/, 'no deletes: history is kept')
  for (const g of ['guard_plot_map_document', 'guard_plot_map_version']) assert.match(sql, new RegExp(`${g}\\(\\)[\\s\\S]*project_addon_state\\(NEW\\.project_id, 'plot_maps'\\) <> 'active'`))
})

test('the browser draws images without EXIF auto-rotation (so sizes agree) and never runs PDF scripts', () => {
  const br = read('lib/plots/browser-render.ts')
  assert.match(br, /imageOrientation: 'none'/)
  assert.match(br, /isEvalSupported: false/)
  assert.doesNotMatch(read('components/plots/MapDocuments.tsx'), /dangerouslySetInnerHTML/)
})

for (const [name, fn] of tests) { await fn(); passed++; console.log(`  ✓ ${name}`) }
console.log(`\nPlot map documents: ${passed} checks passed.`)
