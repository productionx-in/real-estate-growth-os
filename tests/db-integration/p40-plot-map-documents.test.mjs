// tests/db-integration/p40-plot-map-documents.test.mjs — Interactive Plot Map document intake (20260081,
// lib/dal/plot-map-documents.ts) against the local Supabase stack, with real storage uploads: a PDF and an image are
// accepted from their real bytes; disguised, truncated or garbage files are refused and deleted; renders must be
// exactly the size the server chose; versions are numbered and never overwritten; workspaces are isolated; the
// bucket and tables are closed to clients; nothing works unless the project's add-on is active.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'
import { createClient } from '@supabase/supabase-js'
import { jpeg, pdf, png } from '../helpers/plot-files.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL, SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!URL_ || !SERVICE) { console.error('FATAL: Supabase env required.'); process.exit(1) }
const RUN = crypto.randomBytes(4).toString('hex')
let passed = 0
async function test(name, fn) { try { await fn(); passed++; console.log(`  ✓ ${name}`) } catch (e) { console.error(`  ✗ ${name}`); throw e } }

async function main() {
  if (!globalThis.WebSocket) globalThis.WebSocket = class UnusedRealtimeTransport {}
  const jiti = createJiti(import.meta.url, { alias: { '@': root } })
  const D = await jiti.import(path.join(root, 'lib/dal/plot-map-documents.ts'))
  const pg = await import('pg')
  const sql = new (pg.default || pg).Client({ connectionString: DATABASE_URL }); await sql.connect()
  const one = async (s, p) => (await sql.query(s, p)).rows[0]
  const service = createClient(URL_, SERVICE, { auth: { persistSession: false } })
  const bucket = service.storage.from('plot-map-files')
  const put = async (ticket, bytes, contentType, upsert = false) => {
    const { error } = await bucket.uploadToSignedUrl(ticket.path, ticket.token, new Blob([bytes], { type: contentType }), { contentType, upsert })
    assert.equal(error, null, error?.message)
  }

  console.log('P40 — PLOT MAP DOCUMENTS')
  const org = (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,'developer') RETURNING id`, [`Docs ${RUN}`, `docs-${RUN}`])).id
  const other = (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,'developer') RETURNING id`, [`Other ${RUN}`, `docs2-${RUN}`])).id
  const project = (await one(`INSERT INTO public.projects (org_id, name, slug, category) VALUES ($1,'Green Enclave',$2,'plotted_developments') RETURNING id`, [org, `gd-${RUN}`])).id
  const actor = (await one(`SELECT id FROM public.profiles LIMIT 1`))?.id ?? null
  const docPdf = pdf()

  await test('nothing starts unless the project’s add-on is active', async () => {
    const r = await D.startDocumentUpload(org, project, actor, { layoutName: 'Phase 1', fileName: 'layout.pdf', mime: 'application/pdf', size: docPdf.length })
    assert.equal(r.success, false, 'no add-on: the map itself cannot be created')
    await sql.query(`INSERT INTO public.project_addons (org_id, project_id, addon, status) VALUES ($1,$2,'plot_maps','active')`, [org, project])
  })

  let pdfDoc, layoutId
  await test('a PDF uploaded through a one-time URL is checked from its bytes and recorded with its pages', async () => {
    const r = await D.startDocumentUpload(org, project, actor, { layoutName: 'Phase 1', fileName: 'C:\\plans\\layout.pdf', mime: 'application/pdf', size: docPdf.length })
    assert.equal(r.success, true, r.error)
    pdfDoc = r.data.documentId; layoutId = r.data.layoutId
    assert.match(r.data.upload.path, new RegExp(`^org/${org}/project/${project}/documents/${pdfDoc}/original\\.pdf$`))
    await put(r.data.upload, docPdf, 'application/pdf')
    const done = await D.completeDocumentUpload(org, pdfDoc)
    assert.equal(done.data.status, 'ready', done.data.error)
    assert.deepEqual(done.data.pages.map((p) => [p.page, p.width, p.height, p.rotate]), [[1, 842, 595, 0], [2, 842, 595, 90]])
    const row = await one('SELECT file_name, sha256, page_count FROM public.plot_map_documents WHERE id=$1', [pdfDoc])
    assert.equal(row.file_name, 'layout.pdf'); assert.equal(row.page_count, 2)
    assert.equal(row.sha256, crypto.createHash('sha256').update(docPdf).digest('hex'))
    assert.equal((await D.completeDocumentUpload(org, pdfDoc)).status, 409, 'checked once')
  })

  await test('disguised, truncated or garbage uploads are refused with a reason and deleted from storage', async () => {
    const cases = [
      { name: 'fake.pdf', mime: 'application/pdf', bytes: png(800, 800), reason: /really a PNG/ },
      { name: 'broken.pdf', mime: 'application/pdf', bytes: new Uint8Array(Buffer.from('%PDF-1.4\nnot really')), reason: /not a readable PDF/ },
      { name: 'small.jpg', mime: 'image/jpeg', bytes: jpeg(400, 300), reason: /too small/ },
    ]
    for (const c of cases) {
      const r = await D.startDocumentUpload(org, project, actor, { layoutId, fileName: c.name, mime: c.mime, size: c.bytes.length })
      await put(r.data.upload, c.bytes, c.mime)
      const done = await D.completeDocumentUpload(org, r.data.documentId)
      assert.equal(done.data.status, 'failed', c.name); assert.match(done.data.error, c.reason, c.name)
      const { data } = await bucket.download(r.data.upload.path)
      assert.equal(data, null, `${c.name}: removed from storage`)
    }
    const lie = await D.startDocumentUpload(org, project, actor, { layoutId, fileName: 'size.pdf', mime: 'application/pdf', size: docPdf.length + 10 })
    await put(lie.data.upload, docPdf, 'application/pdf')
    assert.match((await D.completeDocumentUpload(org, lie.data.documentId)).data.error, /not the one that was announced/)
    const never = await D.startDocumentUpload(org, project, actor, { layoutId, fileName: 'never.png', mime: 'image/png', size: 1000 })
    assert.match((await D.completeDocumentUpload(org, never.data.documentId)).data.error, /did not arrive/)
    assert.equal((await D.startDocumentUpload(org, project, actor, { layoutId, fileName: 'x.svg', mime: 'image/svg+xml', size: 100 })).status, 400)
  })

  let v1
  await test('a version is rendered at the size the server chose; a wrong-size render is refused and can be retried', async () => {
    const wrong = await D.createVersion(org, pdfDoc, actor, { page: 2, rotation: 0, width: 4000, height: 2894, renderer: 'pdfjs-dist', rendererVersion: '4.10.38' })
    assert.equal(wrong.status, 400); assert.match(wrong.error, /4096 × 2894/)
    const r = await D.createVersion(org, pdfDoc, actor, { page: 2, rotation: 0, width: 4096, height: 2894, renderer: 'pdfjs-dist', rendererVersion: '4.10.38' })
    assert.equal(r.success, true, r.error); assert.equal(r.data.versionNo, 1)
    v1 = r.data.versionId
    await put(r.data.page, png(4096, 2890), 'image/png'); await put(r.data.thumb, png(512, 362), 'image/png')
    const bad = await D.completeVersion(org, v1)
    assert.equal(bad.data.status, 'failed'); assert.match(bad.data.error, /does not match/)
    const retry = await D.retryVersionUpload(org, v1)
    assert.equal(retry.success, true)
    await put(retry.data.page, png(4096, 2894), 'image/png', true); await put(retry.data.thumb, png(512, 362), 'image/png', true)
    assert.equal((await D.completeVersion(org, v1)).data.status, 'ready')
    const row = await one('SELECT render, image_width, image_height, status FROM public.plot_map_versions WHERE id=$1', [v1])
    assert.deepEqual([row.image_width, row.image_height, row.status], [4096, 2894, 'draft'])
    assert.equal(row.render.sourceRotate, 90); assert.equal(row.render.renderer, 'pdfjs-dist')
  })

  await test('an image upload becomes a one-page document; a second version gets the next number and leaves the first alone', async () => {
    const img = png(1600, 1200)
    const r = await D.startDocumentUpload(org, project, actor, { layoutId, fileName: 'scan.png', mime: 'image/png', size: img.length })
    await put(r.data.upload, img, 'image/png')
    assert.equal((await D.completeDocumentUpload(org, r.data.documentId)).data.status, 'ready')
    const v = await D.createVersion(org, r.data.documentId, actor, { page: 1, rotation: 90, width: 1200, height: 1600, renderer: 'canvas', rendererVersion: '1' })
    assert.equal(v.data.versionNo, 2)
    assert.equal((await one('SELECT render_status FROM public.plot_map_versions WHERE id=$1', [v1])).render_status, 'ready', 'version 1 untouched')
    const list = await D.listMapFiles(org, project)
    assert.ok(list.versions.find((x) => x.id === v1).thumbUrl?.includes('token='), 'thumbnails only through short-lived signed links')
  })

  await test('identity and history are frozen in the database', async () => {
    await assert.rejects(sql.query(`UPDATE public.plot_map_versions SET page=1 WHERE id=$1`, [v1]), /cannot change/)
    await assert.rejects(sql.query(`UPDATE public.plot_map_documents SET storage_path=storage_path||'x' WHERE id=$1`, [pdfDoc]), /cannot change/)
    await sql.query(`UPDATE public.plot_map_versions SET status='published' WHERE id=$1`, [v1])
    await assert.rejects(sql.query(`UPDATE public.plot_map_versions SET status='draft' WHERE id=$1`, [v1]), /cannot be changed/)
    await sql.query(`UPDATE public.plot_map_versions SET status='superseded' WHERE id=$1`, [v1])
    await assert.rejects(sql.query(`UPDATE public.plot_map_versions SET status='published' WHERE id=$1`, [v1]), /cannot be changed/)
  })

  await test('workspaces are isolated in the app and the database', async () => {
    assert.equal((await D.completeDocumentUpload(other, pdfDoc)).status, 404)
    assert.equal(await D.originalReadUrl(other, pdfDoc), null)
    assert.equal((await D.createVersion(other, pdfDoc, actor, { page: 1, rotation: 0, width: 4096, height: 2894, renderer: 'x', rendererVersion: '1' })).status, 404)
    assert.deepEqual((await D.listMapFiles(other, project)).documents, [])
    await assert.rejects(sql.query(`INSERT INTO public.plot_map_documents (org_id, project_id, layout_id, kind, file_name, byte_size, storage_path)
      VALUES ($1,$2,$3,'pdf','x.pdf',10,$4)`, [other, project, layoutId, `org/${other}/project/${project}/documents/${crypto.randomUUID()}/original.pdf`]), /another organisation or project/)
  })

  await test('suspended: no new documents or versions (the database refuses too)', async () => {
    await sql.query(`UPDATE public.project_addons SET status='suspended', status_reason='test' WHERE project_id=$1`, [project])
    await assert.rejects(sql.query(`INSERT INTO public.plot_map_documents (org_id, project_id, layout_id, kind, file_name, byte_size, storage_path)
      VALUES ($1,$2,$3,'pdf','x.pdf',10,$4)`, [org, project, layoutId, `org/${org}/project/${project}/documents/${crypto.randomUUID()}/original.pdf`]), /add-on is not active/)
    assert.equal((await D.createVersion(org, pdfDoc, actor, { page: 1, rotation: 0, width: 4096, height: 2894, renderer: 'x', rendererVersion: '1' })).success, false)
    await sql.query(`UPDATE public.project_addons SET status='active' WHERE project_id=$1`, [project])
  })

  await test('clients can read or write neither the tables nor the private bucket', async () => {
    for (const role of ['anon', 'authenticated']) {
      await sql.query('BEGIN')
      try {
        await sql.query(`SET LOCAL ROLE ${role}`)
        for (const q of ['SELECT * FROM public.plot_map_documents', 'SELECT * FROM public.plot_map_versions', `SELECT public.next_plot_map_version_no('${layoutId}')`]) {
          await sql.query('SAVEPOINT s'); await assert.rejects(sql.query(q), /permission denied/, `${role}: ${q}`); await sql.query('ROLLBACK TO SAVEPOINT s')
        }
      } finally { await sql.query('ROLLBACK') }
    }
    if (ANON) {
      const anon = createClient(URL_, ANON, { auth: { persistSession: false } }).storage.from('plot-map-files')
      const { data } = await anon.download(`org/${org}/project/${project}/documents/${pdfDoc}/original.pdf`)
      assert.equal(data, null, 'the original cannot be downloaded without a signed link')
      const { data: listed } = await anon.list(`org/${org}`)
      assert.ok(!listed || listed.length === 0, 'nor listed')
      const { error } = await anon.upload(`org/${org}/project/${project}/documents/x/original.pdf`, new Blob([docPdf]), { contentType: 'application/pdf' })
      assert.ok(error, 'nor written')
    }
    const { data: b } = await service.storage.getBucket('plot-map-files')
    assert.equal(b.public, false)
  })

  // Clean up this run's files and rows (the add-on rows first, so nothing is left behind).
  const paths = (await sql.query(`SELECT storage_path p FROM public.plot_map_documents WHERE org_id=$1 UNION ALL SELECT image_path FROM public.plot_map_versions WHERE org_id=$1 UNION ALL SELECT thumb_path FROM public.plot_map_versions WHERE org_id=$1`, [org])).rows.map((r) => r.p)
  if (paths.length) await bucket.remove(paths)
  await sql.query('DELETE FROM public.project_addons WHERE org_id = ANY($1)', [[org, other]])
  await sql.end()
  console.log(`\nP40 plot map documents: ${passed} checks passed.`)
}
main().catch((e) => { console.error(e); process.exit(1) })
