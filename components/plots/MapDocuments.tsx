'use client'
// components/plots/MapDocuments.tsx — upload a layout (PDF, PNG or JPG), choose the page and rotation, and prepare a
// map version from it. The file goes straight to private storage through a one-time URL; the server checks the real
// bytes before it is accepted, and checks the rendered page image too. Failures stay visible with their reason and
// can be retried. Owners, admins and managers (the routes re-check everything).
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileUp, PencilRuler, RotateCcw, RotateCw, RefreshCw } from 'lucide-react'
import { Alert, Badge, Button, Field, Input, Select } from '@/components/ui'
import { Dialog, DialogClose, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { createClient } from '@/lib/supabase/client'
import { LIMITS, PLOT_MAP_BUCKET } from '@/lib/plots/files'
import { openPdf, plannedSize, previewPage, renderForUpload, RENDERER, rendererVersion } from '@/lib/plots/browser-render'
import { VersionReview, type ReviewItem } from '@/components/plots/VersionReview'
import { groupVersions, nextStep, qaPassedSinceSubmit, WAITING_LABEL } from '@/lib/plots/version-groups'
import { cn } from '@/lib/utils/cn'

type Rotation = 0 | 90 | 180 | 270
interface Page { page: number; width: number; height: number; rotate: number }
export interface DocRow { id: string; layoutId: string; kind: 'pdf' | 'png' | 'jpeg'; fileName: string; byteSize: number; status: 'uploading' | 'ready' | 'failed'; error: string | null; pages: Page[]; createdAt: string }
export interface VersionRow { id: string; layoutId: string; documentId: string; versionNo: number; page: number; rotation: number; status: string; renderStatus: 'pending' | 'ready' | 'failed'; renderError: string | null; width: number | null; height: number | null; thumbUrl: string | null; createdAt: string }
type Ticket = { path: string; token: string }

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`
const ACCEPT = '.pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg'

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const out = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(out.error ?? 'Something went wrong. Please try again.')
  return out as T
}
async function put(ticket: Ticket, body: Blob, contentType: string, upsert = false) {
  const { error } = await createClient().storage.from(PLOT_MAP_BUCKET).uploadToSignedUrl(ticket.path, ticket.token, body, { contentType, upsert })
  if (error) throw new Error('The upload did not reach storage. Check your connection and try again.')
}

export function MapDocuments({ orgId, orgSlug, projectId, layouts, documents, versions, canApprove = false, reviews = {} }: {
  /** Owners and admins: approve, send back and publish. */
  canApprove?: boolean
  /** Review history per version id, newest first. */
  reviews?: Record<string, ReviewItem[]>
  orgId: string; orgSlug: string; projectId: string; layouts: { id: string; name: string }[]; documents: DocRow[]; versions: VersionRow[]
}) {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [target, setTarget] = useState<string>(layouts[0]?.id ?? 'new')
  const [newName, setNewName] = useState(layouts.length ? '' : 'Phase 1')
  const [step, setStep] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [choose, setChoose] = useState<{ doc: DocRow; retry?: VersionRow } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function upload() {
    if (!file) { setError('Choose a file first.'); return }
    setError(null)
    try {
      setStep('Uploading…')
      const start = await post<{ documentId: string; layoutId: string; upload: Ticket; mime: string }>('/api/plot-maps/documents', {
        orgId, projectId, fileName: file.name, mime: file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : ''), size: file.size,
        ...(target === 'new' ? { layoutName: newName.trim() } : { layoutId: target }),
      })
      await put(start.upload, file, start.mime)
      setStep('Checking the file…')
      const done = await post<{ status: 'ready' | 'failed'; error: string | null; pages: Page[] }>(`/api/plot-maps/documents/${start.documentId}`, { orgId })
      setFile(null); if (inputRef.current) inputRef.current.value = ''
      router.refresh()
      if (done.status === 'failed') { setError(done.error ?? 'The file was not accepted.'); return }
      setChoose({ doc: { id: start.documentId, layoutId: start.layoutId, kind: start.mime === 'application/pdf' ? 'pdf' : start.mime === 'image/png' ? 'png' : 'jpeg', fileName: file.name, byteSize: file.size, status: 'ready', error: null, pages: done.pages, createdAt: new Date().toISOString() } })
    } catch (e) { setError(e instanceof Error ? e.message : 'Upload failed.') } finally { setStep(null) }
  }

  const layoutName = (id: string) => layouts.find((l) => l.id === id)?.name ?? 'Map'
  const maxFor = (f: File | null) => (f && /\.pdf$/i.test(f.name) ? LIMITS.pdfBytes : LIMITS.imageBytes)

  const groups = groupVersions(layouts.map((l) => l.id), versions)
  const docOf = (v: VersionRow) => documents.find((d) => d.id === v.documentId)
  const card = (v: VersionRow, role: 'live' | 'progress') => (
    <VersionCard key={v.id} v={v} role={role} orgId={orgId} orgSlug={orgSlug} projectId={projectId} canApprove={canApprove} history={reviews[v.id] ?? []}
      onRetry={docOf(v)?.status === 'ready' ? () => setChoose({ doc: docOf(v)!, retry: v }) : undefined} />
  )

  return (
    <section aria-labelledby="map-files" className="space-y-4 rounded-xl border border-default bg-surface p-5 shadow-2xs">
      <div>
        <h2 id="map-files" className="text-[15px] font-semibold text-foreground">Map versions</h2>
        <p className="text-[13px] text-muted">The live version is what your team and buyers see. A new version goes live only when the owner or an admin publishes it.</p>
      </div>

      {groups.length === 0 && <p className="rounded-lg border border-dashed border-default p-4 text-[13px] text-muted">No versions yet. Upload the approved layout below and prepare its page.</p>}

      {groups.map((g) => (
        <div key={g.layoutId} className="space-y-3">
          {groups.length > 1 && <h3 className="text-[14px] font-semibold text-foreground">{layoutName(g.layoutId)}</h3>}
          <div className="grid gap-3 md:grid-cols-2">
            {g.live ? card(g.live, 'live') : <EmptySlot title="Live" text="Nothing published yet. Buyers and your team see the map once a version is published." />}
            {g.inProgress ? card(g.inProgress, 'progress') : <EmptySlot title="In progress" text="No changes in progress. Upload a revised layout to start a new version." />}
          </div>
          {g.earlier.length > 0 && (
            <details className="rounded-lg border border-default">
              <summary className="cursor-pointer px-3 py-2 text-[13px] text-muted">Earlier versions ({g.earlier.length})</summary>
              <ul className="divide-y divide-[var(--border)] border-t border-default">
                {g.earlier.map((v) => (
                  <li key={v.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-[13px]">
                    <span className="font-medium text-foreground">Version {v.versionNo}</span>
                    <span className="text-[12px] text-muted">Page {v.page} · {day(v.createdAt)}</span>
                    <span className="ml-auto"><StatusBadge v={v} /></span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      ))}

      <details className="group rounded-lg border border-default" open={versions.length === 0}>
        <summary className="flex cursor-pointer items-center gap-2 px-3 py-2.5 text-[13px] font-medium text-foreground"><FileUp aria-hidden className="size-4 text-muted" /> Upload a layout file{documents.length > 0 && <span className="font-normal text-muted">· {documents.length} uploaded</span>}</summary>
        <div className="space-y-4 border-t border-default p-3">
          <p className="text-[13px] text-muted">Upload the approved layout as a PDF (including scanned PDFs), PNG or JPG. The original is kept unchanged and private; each page you prepare becomes a new draft version. Uploading again never changes a version you already have.</p>
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <Field label="Map (phase)">
              <Select value={target} onChange={(e) => setTarget(e.target.value)}>
                {layouts.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                <option value="new">+ New map…</option>
              </Select>
            </Field>
            {target === 'new'
              ? <Field label="New map name"><Input value={newName} maxLength={80} onChange={(e) => setNewName(e.target.value)} placeholder="Phase 1" /></Field>
              : <div className="hidden sm:block" />}
            <div />
            <Field label="Layout file" hint={`PDF up to ${mb(LIMITS.pdfBytes)} and ${LIMITS.pdfPages} pages; PNG or JPG up to ${mb(LIMITS.imageBytes)}.`}>
              <input ref={inputRef} type="file" accept={ACCEPT} onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(null) }}
                className="block w-full text-[13px] text-foreground file:mr-3 file:rounded-md file:border file:border-default file:bg-surface file:px-3 file:py-1.5 file:text-[13px]" />
            </Field>
            <div className="sm:col-span-2 flex items-end">
              <Button onClick={upload} loading={!!step} disabled={!file || (target === 'new' && !newName.trim()) || (file ? file.size > maxFor(file) : false)}>
                <FileUp aria-hidden /> {step ?? 'Upload and check'}
              </Button>
            </div>
          </div>
          {file && file.size > maxFor(file) && <Alert tone="danger">This file is larger than {mb(maxFor(file))}.</Alert>}
          {error && <Alert tone="danger">{error}</Alert>}

          {documents.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-[12px] font-semibold uppercase tracking-wide text-subtle">Uploaded files</h3>
              <ul className="divide-y divide-[var(--border)] rounded-lg border border-default">
                {documents.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-[13px]">
                    <span className="min-w-0 flex-1 truncate font-medium text-foreground" title={d.fileName}>{d.fileName}</span>
                    <span className="text-[12px] text-muted">{layoutName(d.layoutId)} · {d.kind.toUpperCase()} · {mb(d.byteSize)}{d.status === 'ready' ? ` · ${d.pages.length} page${d.pages.length === 1 ? '' : 's'}` : ''}</span>
                    <Badge tone={d.status === 'ready' ? 'success' : d.status === 'failed' ? 'danger' : 'warning'}>{d.status === 'ready' ? 'Checked' : d.status === 'failed' ? 'Not accepted' : 'Upload not finished'}</Badge>
                    {d.status === 'ready' && <Button size="sm" variant="secondary" onClick={() => setChoose({ doc: d })}>Prepare a page</Button>}
                    {d.status !== 'ready' && <span className="w-full text-[12px] text-danger">{d.error ?? 'The upload did not finish. Upload the file again.'}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </details>

      {choose && <PageChooser orgId={orgId} doc={choose.doc} retry={choose.retry} onClose={(changed) => { setChoose(null); if (changed) router.refresh() }} />}
    </section>
  )
}

const STATUS_LABEL: Record<string, string> = { draft: 'Draft', in_review: 'In review', approved: 'Approved', published: 'Published', superseded: 'Replaced', rejected: 'Sent back' }
const day = (iso: string) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(new Date(iso))

function StatusBadge({ v }: { v: VersionRow }) {
  if (v.renderStatus !== 'ready') return <Badge tone={v.renderStatus === 'failed' ? 'danger' : 'warning'}>{v.renderStatus === 'failed' ? 'Render failed' : 'Preparing'}</Badge>
  return <Badge tone={v.status === 'published' ? 'success' : v.status === 'rejected' ? 'danger' : v.status === 'approved' ? 'info' : 'neutral'}>{STATUS_LABEL[v.status] ?? v.status}</Badge>
}

function EmptySlot({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex flex-col justify-center rounded-lg border border-dashed border-default p-4">
      <p className="text-[12px] font-semibold uppercase tracking-wide text-subtle">{title}</p>
      <p className="mt-1 text-[13px] text-muted">{text}</p>
    </div>
  )
}

function VersionCard({ v, role, orgId, orgSlug, projectId, canApprove, history, onRetry }: {
  v: VersionRow; role: 'live' | 'progress'; orgId: string; orgSlug: string; projectId: string; canApprove: boolean; history: ReviewItem[]; onRetry?: () => void
}) {
  const next = role === 'progress' ? nextStep(v, canApprove, qaPassedSinceSubmit(history)) : null
  return (
    <article aria-label={`${role === 'live' ? 'Live' : 'In progress'}: version ${v.versionNo}`}
      className={cn('flex flex-col overflow-hidden rounded-lg border', role === 'live' ? 'border-success' : next?.waitingOn === 'you' ? 'border-brand' : 'border-default')}>
      <div className="flex items-center justify-between gap-2 border-b border-default px-3 py-2">
        <span className="text-[12px] font-semibold uppercase tracking-wide text-subtle">{role === 'live' ? 'Live' : 'In progress'}</span>
        {next ? <Badge tone={next.waitingOn === 'you' ? 'brand' : 'neutral'}>{WAITING_LABEL[next.waitingOn]}</Badge> : <StatusBadge v={v} />}
      </div>
      <div className="grid aspect-[16/9] place-items-center bg-surface-muted">
        {v.thumbUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={v.thumbUrl} alt={`Version ${v.versionNo} preview`} className="max-h-full max-w-full object-contain" loading="lazy" />
          : <span className="text-[12px] text-muted">{v.renderStatus === 'failed' ? 'Render failed' : 'Not rendered yet'}</span>}
      </div>
      <div className="flex-1 space-y-2 p-3 text-[13px]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-medium text-foreground">Version {v.versionNo}</span>
          {next && <StatusBadge v={v} />}
        </div>
        <p className="text-[12px] text-muted">Page {v.page}{v.rotation ? ` · rotated ${v.rotation}°` : ''}{v.width ? ` · ${v.width} × ${v.height} px` : ''} · {day(v.createdAt)}</p>
        {next && <p className="rounded-md bg-surface-muted px-2.5 py-2 text-[13px] text-foreground">{next.label}</p>}
        {v.renderError && <p className="text-[12px] text-danger">{v.renderError}</p>}
        {v.renderStatus === 'ready' && (v.status === 'draft' || v.status === 'rejected') && (
          <Button asChild size="sm" variant="secondary"><a href={`/${orgSlug}/projects/${projectId}/map/versions/${v.id}`}><PencilRuler aria-hidden /> Draw plots</a></Button>
        )}
        {v.renderStatus === 'ready' && <VersionReview orgId={orgId} versionId={v.id} status={v.status} canApprove={canApprove} history={history} />}
        {v.renderStatus !== 'ready' && onRetry && <Button size="sm" variant="secondary" onClick={onRetry}><RefreshCw aria-hidden /> Render again</Button>}
      </div>
    </article>
  )
}

function PageChooser({ orgId, doc, retry, onClose }: { orgId: string; doc: DocRow; retry?: VersionRow; onClose: (changed: boolean) => void }) {
  const [source, setSource] = useState<{ kind: 'pdf'; doc: Awaited<ReturnType<typeof openPdf>> } | { kind: 'image'; url: string } | null>(null)
  const [thumbs, setThumbs] = useState<Record<number, string>>({})
  const [page, setPage] = useState(retry?.page ?? 1)
  const [rotation, setRotation] = useState<Rotation>((retry?.rotation ?? 0) as Rotation)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const res = await fetch(`/api/plot-maps/documents/${doc.id}?orgId=${orgId}`, { cache: 'no-store' })
        const out = await res.json()
        if (!res.ok) throw new Error(out.error ?? 'Could not open the document.')
        const s = doc.kind === 'pdf' ? { kind: 'pdf' as const, doc: await openPdf(out.url) } : { kind: 'image' as const, url: out.url }
        if (!alive) return
        setSource(s)
        if (s.kind === 'pdf' && !retry) {
          for (const p of doc.pages) {
            const t = await previewPage(s, p.page, 0, 160)
            if (!alive) return
            setThumbs((m) => ({ ...m, [p.page]: t }))
          }
        }
      } catch (e) { if (alive) setError(e instanceof Error ? e.message : 'Could not open the document.') }
    })()
    return () => { alive = false }
  }, [doc, orgId, retry])

  useEffect(() => {
    if (!source) return
    let alive = true
    previewPage(source, page, rotation, 640).then((u) => { if (alive) setPreview(u) }).catch(() => { if (alive) setError('Could not draw this page.') })
    return () => { alive = false }
  }, [source, page, rotation])

  const pageInfo = doc.pages.find((p) => p.page === page) ?? doc.pages[0]
  const size = useMemo(() => plannedSize(pageInfo, rotation, doc.kind), [pageInfo, rotation, doc.kind])

  async function prepare() {
    if (!source) return
    setError(null)
    try {
      let versionId: string, pageT: Ticket, thumbT: Ticket, upsert = false
      if (retry) {
        setBusy('Preparing…')
        const r = await post<{ page: Ticket; thumb: Ticket }>(`/api/plot-maps/versions/${retry.id}`, { orgId, action: 'retry' })
        versionId = retry.id; pageT = r.page; thumbT = r.thumb; upsert = true
      } else {
        setBusy('Preparing…')
        const r = await post<{ versionId: string; page: Ticket; thumb: Ticket }>('/api/plot-maps/versions', {
          orgId, documentId: doc.id, page, rotation, width: size.width, height: size.height, renderer: RENDERER, rendererVersion: rendererVersion(),
        })
        versionId = r.versionId; pageT = r.page; thumbT = r.thumb
      }
      setBusy('Rendering the page…')
      const out = await renderForUpload(source, page, rotation, size)
      setBusy('Uploading the image…')
      await put(pageT, out.page, 'image/png', upsert)
      await put(thumbT, out.thumb, 'image/png', upsert)
      setBusy('Checking…')
      const done = await post<{ status: 'ready' | 'failed'; error: string | null }>(`/api/plot-maps/versions/${versionId}`, { orgId, action: 'complete' })
      if (done.status === 'failed') { setError(done.error ?? 'The rendered page was not accepted. Try “Render again”.'); return }
      onClose(true)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not prepare the page.') } finally { setBusy(null) }
  }

  const rotate = (d: 90 | -90) => setRotation((((rotation + d) % 360 + 360) % 360) as Rotation)
  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose(false) }}>
      <DialogContent title={retry ? `Render version ${retry.versionNo} again` : 'Choose the layout page'} description={`${doc.fileName} — pick the page with the plot layout and turn it upright. It is rendered at ${size.width} × ${size.height} pixels.`} className="max-w-3xl">
        <div className="space-y-4">
          {doc.kind === 'pdf' && doc.pages.length > 1 && !retry && (
            <div role="listbox" aria-label="Pages" className="flex gap-2 overflow-x-auto pb-1">
              {doc.pages.map((p) => (
                <button key={p.page} type="button" role="option" aria-selected={page === p.page} onClick={() => setPage(p.page)}
                  className={`shrink-0 rounded-md border p-1 text-[11px] ${page === p.page ? 'border-brand ring-2 ring-[var(--brand-light)]' : 'border-default hover:bg-surface-hover'}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {thumbs[p.page] ? <img src={thumbs[p.page]} alt="" className="h-24 w-auto" /> : <span className="grid h-24 w-20 place-items-center text-muted">…</span>}
                  <span className="mt-1 block text-center text-muted">Page {p.page}</span>
                </button>
              ))}
            </div>
          )}
          <div className="grid min-h-64 place-items-center rounded-lg border border-default bg-surface-muted p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {preview ? <img src={preview} alt={`Page ${page} preview`} className="max-h-[50vh] max-w-full object-contain" /> : <span className="text-[13px] text-muted">{error ? '' : 'Opening…'}</span>}
          </div>
          {!retry && (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" onClick={() => rotate(-90)} aria-label="Rotate left"><RotateCcw aria-hidden /> Left</Button>
              <Button size="sm" variant="secondary" onClick={() => rotate(90)} aria-label="Rotate right"><RotateCw aria-hidden /> Right</Button>
              <span className="text-[12px] text-muted">{rotation ? `Rotated ${rotation}°` : 'As uploaded'}</span>
            </div>
          )}
          {error && <Alert tone="danger">{error}</Alert>}
          <DialogFooter>
            <DialogClose asChild><Button variant="secondary" disabled={!!busy}>Cancel</Button></DialogClose>
            <Button onClick={prepare} loading={!!busy} disabled={!source}>{busy ?? (retry ? 'Render again' : 'Prepare this page')}</Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
