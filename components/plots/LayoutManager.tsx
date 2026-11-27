'use client'
// components/plots/LayoutManager.tsx — managers upload a project's layout drawing (SVG), see which plots matched
// units, then publish it and share a public link. The server parses and checks everything (app/api/plot-layouts).
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy, Link2, RefreshCw, Trash2, Upload } from 'lucide-react'
import { Alert, Badge, Button, Field, Input, Textarea, Select } from '@/components/ui'
import type { LayoutSummary } from '@/lib/dal/plot-layouts'
import type { MatchReport } from '@/lib/plots/match'

interface UploadResult { id: string; report: MatchReport; warnings: string[]; plots: number }

export function LayoutManager({ orgId, projectId, layout }: { orgId: string; projectId: string; layout: LayoutSummary | null }) {
  const router = useRouter()
  const file = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(layout?.name ?? 'Master plan')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<UploadResult | null>(null)
  const [copied, setCopied] = useState(false)
  const [sites, setSites] = useState((layout?.embedDomains ?? []).map((o) => o.replace(/^https:\/\//, '')).join('\n'))
  const link = layout?.shareToken ? `${typeof window === 'undefined' ? '' : window.location.origin}/m/${layout.shareToken}` : ''

  async function upload() {
    const f = file.current?.files?.[0]
    if (!f) { setError('Choose the layout’s SVG file.'); return }
    if (f.size > 3_000_000) { setError('The file is larger than 3 MB. Simplify the drawing and export again.'); return }
    setBusy(true); setError(null); setResult(null)
    try {
      const svg = await f.text()
      const res = await fetch('/api/plot-layouts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orgId, projectId, id: layout?.id, name, svg }) })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) { setError(out.error ?? 'Could not upload the layout.'); return }
      setResult(out)
      if (file.current) file.current.value = ''
      router.push(`?layout=${out.id}`)
      router.refresh()
    } catch { setError('Network error. Please try again.') } finally { setBusy(false) }
  }

  async function patch(body: Record<string, unknown>) {
    if (!layout) return
    setBusy(true); setError(null)
    const res = await fetch(`/api/plot-layouts/${layout.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orgId, ...body }) })
    const out = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) setError(out.error ?? 'Could not save.'); else router.refresh()
  }
  async function remove() {
    if (!layout || !window.confirm(`Delete the layout “${layout.name}”? Its public link stops working. Your inventory is not touched.`)) return
    setBusy(true)
    const res = await fetch(`/api/plot-layouts/${layout.id}?orgId=${orgId}`, { method: 'DELETE' })
    setBusy(false)
    if (res.ok) { router.push('?'); router.refresh() } else setError('Could not delete the layout.')
  }

  return (
    <section aria-labelledby="layout-manage" className="surface-raised space-y-4 rounded-2xl border border-default bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="layout-manage" className="text-[14px] font-semibold text-foreground">{layout ? 'Manage this layout' : 'Add a layout'}</h2>
        {layout && (layout.status === 'published' ? <Badge tone="success">Published</Badge> : <Badge tone="warning">Draft — only managers see it</Badge>)}
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field label="Layout name"><Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label={layout ? 'Replace the drawing (SVG)' : 'Drawing (SVG)'} hint="Each plot shape named with its plot number, e.g. N46.">
          <input ref={file} type="file" accept=".svg,image/svg+xml" className="block w-full text-[13px] file:mr-3 file:rounded-md file:border file:border-default file:bg-surface file:px-3 file:py-2 file:text-[13px] file:font-medium" />
        </Field>
        <Button onClick={upload} loading={busy}><Upload aria-hidden /> {layout ? 'Upload new drawing' : 'Upload'}</Button>
      </div>

      {result && (
        <Alert tone={result.report.unmatchedShapes.length || result.report.ambiguous.length ? 'warning' : 'success'} title={`${result.report.links.length} of ${result.plots} plots linked to units`}>
          <ul className="mt-1 space-y-1 text-[12px]">
            {result.report.unmatchedShapes.length > 0 && <li><strong>No unit with this number:</strong> {result.report.unmatchedShapes.slice(0, 30).join(', ')}{result.report.unmatchedShapes.length > 30 ? ` and ${result.report.unmatchedShapes.length - 30} more` : ''}. Add them to inventory (or fix the names in the drawing) and upload again.</li>}
            {result.report.ambiguous.length > 0 && <li><strong>Two units read the same:</strong> {result.report.ambiguous.join(', ')}. Rename one so each plot number is unique.</li>}
            {result.report.unitsWithoutShape.length > 0 && <li><strong>Units not on this drawing:</strong> {result.report.unitsWithoutShape.slice(0, 30).join(', ')}{result.report.unitsWithoutShape.length > 30 ? '…' : ''} (fine if they belong to another phase).</li>}
            {result.warnings.map((w) => <li key={w}>{w}</li>)}
          </ul>
        </Alert>
      )}
      {error && <Alert tone="danger">{error}</Alert>}

      {layout && (
        <div className="space-y-3 border-t border-default pt-3">
          <div className="flex flex-wrap gap-2">
            {layout.status === 'published'
              ? <Button variant="secondary" onClick={() => patch({ publish: false })} disabled={busy}>Unpublish</Button>
              : <Button onClick={() => patch({ publish: true })} disabled={busy || layout.linked === 0}>Publish to the team</Button>}
            <Button variant="ghost" onClick={remove} disabled={busy}><Trash2 aria-hidden /> Delete layout</Button>
          </div>
          {layout.linked === 0 && <p className="text-[12px] text-muted">Link at least one plot before publishing.</p>}
          {layout.status === 'published' && (
            <div className="space-y-2 rounded-lg bg-surface-muted p-3">
              <label className="flex items-center gap-2 text-[13px] text-foreground">
                <input type="checkbox" className="size-4 accent-[var(--brand)]" checked={layout.shareEnabled} disabled={busy} onChange={(e) => patch({ share: e.target.checked })} />
                Public link for buyers (no login; shows available, reserved and sold only)
              </label>
              <label className="flex items-center gap-2 text-[13px] text-foreground">
                <input type="checkbox" className="size-4 accent-[var(--brand)]" checked={layout.showPrices} disabled={busy} onChange={(e) => patch({ showPrices: e.target.checked })} />
                Show prices on the public link
              </label>
              <label className="flex flex-wrap items-center gap-2 text-[13px] text-foreground">
                Compass — north points
                <Select className="w-auto" aria-label="Which way north points" value={layout.northDeg} disabled={busy}
                  onChange={(e) => patch({ northDeg: Number(e.target.value) })}>
                  {[['Up', 0], ['Up-right', 45], ['Right', 90], ['Down-right', 135], ['Down', 180], ['Down-left', 225], ['Left', 270], ['Up-left', 315]].map(([l, d]) => (
                    <option key={d} value={d}>{l}</option>
                  ))}
                </Select>
                <span className="text-[12px] text-muted">on this drawing</span>
              </label>
              {layout.shareEnabled && link && (
                <div className="flex flex-wrap items-center gap-2">
                  <Input readOnly value={link} aria-label="Public link" className="min-w-0 flex-1" onFocus={(e) => e.currentTarget.select()} />
                  <Button size="sm" variant="secondary" onClick={() => { navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000) }}>
                    {copied ? <Check aria-hidden /> : <Copy aria-hidden />} {copied ? 'Copied' : 'Copy'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => window.confirm('Issue a new link? The old one stops working at once.') && patch({ newLink: true })} disabled={busy}>
                    <RefreshCw aria-hidden /> New link
                  </Button>
                  <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12px] font-medium text-brand hover:underline"><Link2 aria-hidden className="size-3.5" /> Open</a>
                </div>
              )}
              {layout.shareEnabled && link && (
                <div className="space-y-1.5 border-t border-default pt-2">
                  <label htmlFor="embed-sites" className="block text-[13px] font-medium text-foreground">Show it on your website</label>
                  <p className="text-[12px] text-muted">Only the websites listed here can embed the map (one per line, e.g. www.yoursite.com; up to 10). Other sites cannot frame it.</p>
                  <Textarea id="embed-sites" rows={2} value={sites} onChange={(e) => setSites(e.target.value)} disabled={busy} placeholder="www.yoursite.com" />
                  <Button size="sm" variant="secondary" disabled={busy} onClick={() => patch({ embedDomains: sites.split(/[\n,]/).map((x) => x.trim()).filter(Boolean) })}>Save websites</Button>
                  {layout.embedDomains.length > 0 && (
                    <Input readOnly aria-label="Embed code" className="font-mono text-[12px]" onFocus={(e) => e.currentTarget.select()}
                      value={`<iframe src="${link}?embed=1" width="100%" height="640" style="border:0" loading="lazy" title="Plot map"></iframe>`} />
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
