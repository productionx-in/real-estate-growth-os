// lib/dal/plot-map-documents.ts — Interactive Plot Map document intake (20260081). Callers authorise first and
// require the project's add-on (lib/plots/addons.ts); every query is scoped by organisation and the database
// re-checks ownership and the add-on on every write.
//
// Upload flow (files never pass through the app server's request body, which is size-limited):
//   1. startDocumentUpload  → a `uploading` row + a one-time signed upload URL for the private bucket.
//   2. the browser PUTs the file to that URL.
//   3. completeDocumentUpload → the server downloads the object and checks the real bytes: signature matches the
//      declared kind, size, SHA-256, and (PDF) structure/pages or (image) dimensions. Bad files are deleted from
//      storage and the row keeps the reason (`failed`); good ones become `ready`. The original is never changed.
//   4. createVersion (page + rotation) → a numbered draft version + signed upload URLs for the rendered PNG and
//      thumbnail; the browser renders them with PDF.js / canvas at the size the server computed.
//   5. completeVersion → the server checks both PNGs (signature, exact declared size, limits); `ready` or `failed`.
//      A failed render can be retried (new upload URLs for the same version).
import crypto from 'node:crypto'
import { createServiceClient } from '@/lib/supabase/server'
import { checkRender, checkSourceImage, checkUploadRequest, cleanFileName, expectedRender, KIND_MIME, LIMITS, paths, PLOT_MAP_BUCKET, sniffKind, type DocKind } from '@/lib/plots/files'
import { inspectPdf, type PdfPage } from '@/lib/plots/pdf-inspect'
import type { DalResult } from '@/lib/dal/routing'
import type { Json } from '@/types/database'

const db = () => createServiceClient()
const storage = () => db().storage.from(PLOT_MAP_BUCKET)
const SIGNED_READ_SECONDS = 120

export interface UploadTicket { path: string; signedUrl: string; token: string }

async function uploadTicket(path: string, upsert = false): Promise<UploadTicket | null> {
  const { data, error } = await storage().createSignedUploadUrl(path, { upsert })
  return error || !data ? null : { path, signedUrl: data.signedUrl, token: data.token }
}

// ── Documents ────────────────────────────────────────────────────────────────────────────────────────────────

export async function startDocumentUpload(
  orgId: string, projectId: string, actorId: string,
  input: { layoutId?: string; layoutName?: string; fileName: string; mime: string; size: number },
): Promise<DalResult<{ documentId: string; layoutId: string; upload: UploadTicket; mime: string }>> {
  const req = checkUploadRequest(input.mime, input.fileName, input.size)
  if ('error' in req) return { success: false, error: req.error, status: 400 }
  const client = db()
  const { data: project } = await client.from('projects').select('id').eq('org_id', orgId).eq('id', projectId).maybeSingle()
  if (!project) return { success: false, error: 'Project not found.', status: 404 }

  let layoutId = input.layoutId
  if (layoutId) {
    const { data: l } = await client.from('plot_layouts').select('id').eq('org_id', orgId).eq('project_id', projectId).eq('id', layoutId).maybeSingle()
    if (!l) return { success: false, error: 'Map not found.', status: 404 }
  } else {
    const name = (input.layoutName ?? '').trim()
    if (name.length < 1 || name.length > 80) return { success: false, error: 'Name the map, e.g. “Phase 1”.', status: 400 }
    const { data: l, error } = await client.from('plot_layouts')
      .insert({ org_id: orgId, project_id: projectId, name, created_by: actorId, updated_by: actorId }).select('id').single()
    if (error?.code === '23505') return { success: false, error: 'This project already has a map with that name.', status: 409 }
    if (error || !l) return { success: false, error: 'Could not create the map.', status: 500 }
    layoutId = l.id
  }

  const documentId = crypto.randomUUID()
  const path = paths.original(orgId, projectId, documentId, req.kind)
  const { error } = await client.from('plot_map_documents').insert({
    id: documentId, org_id: orgId, project_id: projectId, layout_id: layoutId!, kind: req.kind,
    file_name: cleanFileName(input.fileName), byte_size: input.size, storage_path: path, status: 'uploading', uploaded_by: actorId,
  })
  if (error) return { success: false, error: 'Could not start the upload.', status: 500 }
  const upload = await uploadTicket(path)
  if (!upload) {
    await client.from('plot_map_documents').update({ status: 'failed', error: 'Storage did not accept the upload.' }).eq('org_id', orgId).eq('id', documentId)
    return { success: false, error: 'File storage is not available. Please try again.', status: 503 }
  }
  return { success: true, data: { documentId, layoutId: layoutId!, upload, mime: KIND_MIME[req.kind] } }
}

async function download(path: string): Promise<Uint8Array | null> {
  const { data, error } = await storage().download(path)
  return error || !data ? null : new Uint8Array(await data.arrayBuffer())
}

/** Checks the uploaded bytes; returns the document's final state. */
export async function completeDocumentUpload(orgId: string, documentId: string): Promise<DalResult<{ status: 'ready' | 'failed'; error: string | null; pages: PdfPage[] }>> {
  const client = db()
  const { data: doc } = await client.from('plot_map_documents').select('id, kind, byte_size, storage_path, status')
    .eq('org_id', orgId).eq('id', documentId).maybeSingle()
  if (!doc) return { success: false, error: 'Document not found.', status: 404 }
  if (doc.status !== 'uploading') return { success: false, error: 'This upload has already been checked.', status: 409 }

  const fail = async (reason: string) => {
    await storage().remove([doc.storage_path]) // a rejected file is not kept
    await client.from('plot_map_documents').update({ status: 'failed', error: reason, checked_at: new Date().toISOString() }).eq('org_id', orgId).eq('id', documentId)
    return { success: true as const, data: { status: 'failed' as const, error: reason, pages: [] } }
  }

  const bytes = await download(doc.storage_path)
  if (!bytes) return fail('The file did not arrive. Please upload it again.')
  if (bytes.length !== Number(doc.byte_size)) return fail('The uploaded file is not the one that was announced. Please upload it again.')
  const kind = sniffKind(bytes)
  if (kind !== doc.kind) return fail(kind ? `The file is really a ${kind.toUpperCase()}, not what its name says.` : 'The file is not a PDF, PNG or JPG.')

  let pages: PdfPage[]
  if (kind === 'pdf') {
    const r = await inspectPdf(bytes)
    if (!r.ok) return fail(r.error)
    pages = r.pages
  } else {
    const r = checkSourceImage(bytes, kind)
    if ('error' in r) return fail(r.error)
    pages = [{ page: 1, width: r.width, height: r.height, rotate: 0 }]
  }
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex')
  const { error } = await client.from('plot_map_documents').update({
    status: 'ready', error: null, sha256, page_count: pages.length, pages: pages as unknown as Json, checked_at: new Date().toISOString(),
  }).eq('org_id', orgId).eq('id', documentId)
  if (error) return { success: false, error: 'Could not record the check.', status: 500 }
  return { success: true, data: { status: 'ready', error: null, pages } }
}

/** A two-minute link to the original, for the uploader's own browser (page thumbnails and rendering). */
export async function originalReadUrl(orgId: string, documentId: string): Promise<string | null> {
  const { data: doc } = await db().from('plot_map_documents').select('storage_path, status').eq('org_id', orgId).eq('id', documentId).maybeSingle()
  if (!doc || doc.status !== 'ready') return null
  const { data } = await storage().createSignedUrl(doc.storage_path, SIGNED_READ_SECONDS)
  return data?.signedUrl ?? null
}

// ── Versions ─────────────────────────────────────────────────────────────────────────────────────────────────

export async function createVersion(
  orgId: string, documentId: string, actorId: string,
  input: { page: number; rotation: 0 | 90 | 180 | 270; width: number; height: number; renderer: string; rendererVersion: string },
): Promise<DalResult<{ versionId: string; versionNo: number; page: UploadTicket; thumb: UploadTicket }>> {
  const client = db()
  const { data: doc } = await client.from('plot_map_documents').select('id, project_id, layout_id, kind, status, pages')
    .eq('org_id', orgId).eq('id', documentId).maybeSingle()
  if (!doc) return { success: false, error: 'Document not found.', status: 404 }
  if (doc.status !== 'ready') return { success: false, error: 'The document has not passed its checks.', status: 409 }
  const page = (doc.pages as unknown as PdfPage[]).find((p) => p.page === input.page)
  if (!page) return { success: false, error: 'That page does not exist in the document.', status: 400 }
  const expect = expectedRender(page, input.rotation, doc.kind as DocKind)
  if (expect.width !== input.width || expect.height !== input.height) {
    return { success: false, error: `Render the page at ${expect.width} × ${expect.height} pixels.`, status: 400 }
  }

  const versionId = crypto.randomUUID()
  const { data: no, error: noErr } = await client.rpc('next_plot_map_version_no', { p_layout: doc.layout_id })
  if (noErr || typeof no !== 'number') return { success: false, error: 'Could not number the version.', status: 500 }
  const render = {
    renderer: input.renderer.slice(0, 40), rendererVersion: input.rendererVersion.slice(0, 20), scale: Math.round(expect.scale * 1e6) / 1e6,
    sourceWidth: page.width, sourceHeight: page.height, sourceRotate: page.rotate, longEdge: Math.max(expect.width, expect.height),
  }
  const { error } = await client.from('plot_map_versions').insert({
    id: versionId, org_id: orgId, project_id: doc.project_id, layout_id: doc.layout_id, document_id: documentId,
    version_no: no, page: input.page, rotation: input.rotation, status: 'draft', render_status: 'pending',
    image_path: paths.page(orgId, doc.project_id, versionId), thumb_path: paths.thumb(orgId, doc.project_id, versionId),
    image_width: expect.width, image_height: expect.height, render: render as unknown as Json, created_by: actorId,
  })
  if (error?.code === '23505') return { success: false, error: 'Another version was created at the same moment. Please try again.', status: 409 }
  if (error) return { success: false, error: 'Could not create the version.', status: 500 }
  const [pageTicket, thumbTicket] = await Promise.all([uploadTicket(paths.page(orgId, doc.project_id, versionId)), uploadTicket(paths.thumb(orgId, doc.project_id, versionId))])
  if (!pageTicket || !thumbTicket) {
    await client.from('plot_map_versions').update({ render_status: 'failed', render_error: 'Storage did not accept the upload.' }).eq('org_id', orgId).eq('id', versionId)
    return { success: false, error: 'File storage is not available. Use “Render again”.', status: 503 }
  }
  return { success: true, data: { versionId, versionNo: no, page: pageTicket, thumb: thumbTicket } }
}

/** New upload URLs for a version whose render failed or never arrived (same version, same paths). */
export async function retryVersionUpload(orgId: string, versionId: string): Promise<DalResult<{ page: UploadTicket; thumb: UploadTicket; width: number; height: number; documentId: string; pageNo: number; rotation: number }>> {
  const { data: v } = await db().from('plot_map_versions').select('id, document_id, page, rotation, render_status, image_path, thumb_path, image_width, image_height')
    .eq('org_id', orgId).eq('id', versionId).maybeSingle()
  if (!v) return { success: false, error: 'Version not found.', status: 404 }
  if (v.render_status === 'ready') return { success: false, error: 'This version is already rendered.', status: 409 }
  const [page, thumb] = await Promise.all([uploadTicket(v.image_path, true), uploadTicket(v.thumb_path, true)])
  if (!page || !thumb) return { success: false, error: 'File storage is not available. Please try again.', status: 503 }
  await db().from('plot_map_versions').update({ render_status: 'pending', render_error: null }).eq('org_id', orgId).eq('id', versionId)
  return { success: true, data: { page, thumb, width: v.image_width!, height: v.image_height!, documentId: v.document_id, pageNo: v.page, rotation: v.rotation } }
}

export async function completeVersion(orgId: string, versionId: string): Promise<DalResult<{ status: 'ready' | 'failed'; error: string | null }>> {
  const client = db()
  const { data: v } = await client.from('plot_map_versions').select('id, render_status, image_path, thumb_path, image_width, image_height')
    .eq('org_id', orgId).eq('id', versionId).maybeSingle()
  if (!v) return { success: false, error: 'Version not found.', status: 404 }
  if (v.render_status === 'ready') return { success: true, data: { status: 'ready', error: null } }
  const fail = async (reason: string) => {
    await storage().remove([v.image_path, v.thumb_path])
    await client.from('plot_map_versions').update({ render_status: 'failed', render_error: reason }).eq('org_id', orgId).eq('id', versionId)
    return { success: true as const, data: { status: 'failed' as const, error: reason } }
  }
  const [img, thumb] = await Promise.all([download(v.image_path), download(v.thumb_path)])
  if (!img || !thumb) return fail('The rendered images did not arrive. Use “Render again”.')
  const e1 = checkRender(img, { width: v.image_width!, height: v.image_height! }, 'page')
  if (e1) return fail(e1)
  const e2 = checkRender(thumb, { width: 0, height: 0 }, 'thumb')
  if (e2) return fail(e2)
  const { error } = await client.from('plot_map_versions').update({ render_status: 'ready', render_error: null, rendered_at: new Date().toISOString() }).eq('org_id', orgId).eq('id', versionId)
  if (error) return { success: false, error: 'Could not record the render.', status: 500 }
  return { success: true, data: { status: 'ready', error: null } }
}

// ── Listing (workspace, managers) ────────────────────────────────────────────────────────────────────────────

export interface DocumentSummary {
  id: string; layoutId: string; kind: DocKind; fileName: string; byteSize: number; status: 'uploading' | 'ready' | 'failed'
  error: string | null; pages: PdfPage[]; createdAt: string
}
export interface VersionSummary {
  id: string; layoutId: string; documentId: string; versionNo: number; page: number; rotation: number; status: string
  renderStatus: 'pending' | 'ready' | 'failed'; renderError: string | null; width: number | null; height: number | null
  thumbUrl: string | null; createdAt: string
}

export async function listMapFiles(orgId: string, projectId: string): Promise<{ documents: DocumentSummary[]; versions: VersionSummary[] }> {
  const client = db()
  const [{ data: docs }, { data: vers }] = await Promise.all([
    client.from('plot_map_documents').select('id, layout_id, kind, file_name, byte_size, status, error, pages, created_at')
      .eq('org_id', orgId).eq('project_id', projectId).order('created_at', { ascending: false }).limit(200),
    client.from('plot_map_versions').select('id, layout_id, document_id, version_no, page, rotation, status, render_status, render_error, image_width, image_height, thumb_path, created_at')
      .eq('org_id', orgId).eq('project_id', projectId).order('version_no', { ascending: false }).limit(200),
  ])
  const ready = (vers ?? []).filter((v) => v.render_status === 'ready')
  const signed = ready.length
    ? (await storage().createSignedUrls(ready.map((v) => v.thumb_path), SIGNED_READ_SECONDS)).data ?? []
    : []
  const thumbOf = new Map(signed.filter((s) => s.signedUrl && s.path).map((s) => [s.path as string, s.signedUrl]))
  return {
    documents: (docs ?? []).map((d) => ({
      id: d.id, layoutId: d.layout_id, kind: d.kind as DocKind, fileName: d.file_name, byteSize: Number(d.byte_size),
      status: d.status as DocumentSummary['status'], error: d.error, pages: d.pages as unknown as PdfPage[], createdAt: d.created_at,
    })),
    versions: (vers ?? []).map((v) => ({
      id: v.id, layoutId: v.layout_id, documentId: v.document_id, versionNo: v.version_no, page: v.page, rotation: v.rotation,
      status: v.status, renderStatus: v.render_status as VersionSummary['renderStatus'], renderError: v.render_error,
      width: v.image_width, height: v.image_height, thumbUrl: thumbOf.get(v.thumb_path) ?? null, createdAt: v.created_at,
    })),
  }
}

/** The project a document or version belongs to (organisation-scoped), for the entitlement check. */
export async function projectOf(orgId: string, table: 'plot_map_documents' | 'plot_map_versions', id: string): Promise<string | null> {
  const { data } = await db().from(table).select('project_id').eq('org_id', orgId).eq('id', id).maybeSingle()
  return (data as { project_id: string } | null)?.project_id ?? null
}

export { LIMITS }
