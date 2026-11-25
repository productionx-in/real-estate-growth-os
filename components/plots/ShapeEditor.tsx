'use client'
// components/plots/ShapeEditor.tsx — draw the plot boundaries of a draft map version on its page image and link each
// plot to its inventory unit. Geometry is kept in normalised page coordinates (0–1); the same pure rules the server
// runs (lib/plots/geometry.ts) show errors and warnings live. Suggested links (plot number = unit number) are only
// shown — a link is stored only after a person accepts it. Save draft is explicit, with autosave every 30 s.
//
// Tools: Select (V) · Polygon (P) · Rectangle (R) · Pan (H, or hold Space) · Undo (Ctrl+Z) · Redo (Ctrl+Shift+Z / Ctrl+Y)
// Select: drag a plot to move it, drag a corner to reshape (rectangles stay rectangles), drag a "+" to add a corner,
// Delete removes the selected corner (or the plot). Polygon: click corners, then click the first corner, double-click
// or press Enter; Backspace removes the last corner, Esc cancels. Mouse wheel zooms.
import { useStatusLabels } from '@/components/settings/WorkspacePrefs'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Hand, Hexagon, Link2, Link2Off, Minus, MousePointer2, Plus, Redo2, Save, Search, Square, Trash2, Undo2, Maximize } from 'lucide-react'
import { Alert, Badge, Button, Field, Input } from '@/components/ui'
import { centroid, isSubmittable, labelKey, validateShapes, type Pt } from '@/lib/plots/geometry'
import { normaliseKey } from '@/lib/plots/svg'
import { cn } from '@/lib/utils/cn'

type Tool = 'select' | 'polygon' | 'rect' | 'pan'
interface Unit { id: string; unitNumber: string; status: string }
interface Shape { key: string; id?: string; label: string; kind: 'polygon' | 'rect'; points: Pt[]; unitId: string | null }
interface View { x: number; y: number; w: number; h: number }
type Drag =
  | { type: 'pan'; start: Pt; view: View }
  | { type: 'move'; key: string; start: Pt; orig: Pt[] }
  | { type: 'vertex'; key: string; index: number }
  | { type: 'rect-new'; start: Pt }
  | null

function ToolBtn({ tool, onPick, t, label, icon: Icon, k }: { tool: Tool; onPick: (t: Tool) => void; t: Tool; label: string; icon: typeof Hand; k: string }) {
  return (
    <Button size="sm" variant={tool === t ? 'primary' : 'secondary'} aria-pressed={tool === t} onClick={() => onPick(t)} title={`${label} (${k})`}>
      <Icon aria-hidden /> <span className="hidden lg:inline">{label}</span>
    </Button>
  )
}

let seq = 0
const newKey = () => `s${Date.now().toString(36)}${(seq++).toString(36)}`
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const HISTORY = 100

export function ShapeEditor({ orgId, versionId, width, height, imageUrl, initialShapes, units, title, drawOnly = false, endpoint }: {
  orgId: string; versionId: string; width: number; height: number; imageUrl: string
  initialShapes: { id: string; label: string; kind: 'polygon' | 'rect'; points: Pt[]; unitId: string | null }[]
  units: Unit[]; title: string
  /** REGrow staff drawing for a customer (option c): boundaries and plot numbers only. No units are shown or sent;
   *  the server keeps the customer's confirmed links by plot id. */
  drawOnly?: boolean
  /** Where shapes are saved and re-read (default: the workspace route). */
  endpoint?: string
}) {
  const statusLabels = useStatusLabels()
  const url = endpoint ?? `/api/plot-maps/versions/${versionId}/shapes`
  const [shapes, setShapes] = useState<Shape[]>(() => initialShapes.map((s) => ({ ...s, key: newKey() })))
  const [past, setPast] = useState<Shape[][]>([])
  const [future, setFuture] = useState<Shape[][]>([])
  const [tool, setTool] = useState<Tool>('select')
  const [selected, setSelected] = useState<string | null>(null)
  const [vertex, setVertex] = useState<number | null>(null)
  const [drawing, setDrawing] = useState<Pt[]>([])
  const [cursor, setCursor] = useState<Pt | null>(null)
  const [rectDraft, setRectDraft] = useState<[Pt, Pt] | null>(null)
  const [view, setView] = useState<View>({ x: 0, y: 0, w: width, h: height })
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [query, setQuery] = useState('')
  const [unitQuery, setUnitQuery] = useState('')
  const [space, setSpace] = useState(false)
  const [clientW, setClientW] = useState(1000)
  const svgRef = useRef<SVGSVGElement>(null)
  const drag = useRef<Drag>(null)
  const gestureStart = useRef<Shape[] | null>(null)
  const labelRef = useRef<HTMLInputElement>(null)

  const unitById = useMemo(() => new Map(units.map((u) => [u.id, u])), [units])
  const unitByKey = useMemo(() => {
    const m = new Map<string, Unit[]>()
    for (const u of units) { const k = normaliseKey(u.unitNumber); m.set(k, [...(m.get(k) ?? []), u]) }
    return m
  }, [units])
  const validation = useMemo(() => validateShapes(
    shapes.map((s) => ({ id: s.id, label: s.label, kind: s.kind, points: s.points, unitId: s.unitId })),
    units.map((u) => ({ id: u.id, unit_number: u.unitNumber })),
  ), [shapes, units])
  const usedUnits = useMemo(() => new Set(shapes.map((s) => s.unitId).filter(Boolean) as string[]), [shapes])
  const overlapLabels = useMemo(() => new Set(validation.overlaps.flat().map(labelKey)), [validation])
  const dupLabels = useMemo(() => new Set(validation.duplicateLabels.map(labelKey)), [validation])
  /** A suggestion only when exactly one unused unit has this plot's number. */
  const suggestion = useCallback((s: Shape): Unit | null => {
    if (s.unitId) return null
    const found = unitByKey.get(normaliseKey(s.label)) ?? []
    return found.length === 1 && !usedUnits.has(found[0].id) ? found[0] : null
  }, [unitByKey, usedUnits])
  const suggestions = useMemo(() => shapes.map((s) => [s, suggestion(s)] as const).filter(([, u]) => u), [shapes, suggestion])
  const sel = shapes.find((s) => s.key === selected) ?? null

  // ── history ──
  const commit = useCallback((next: Shape[], before: Shape[] = shapes) => {
    setPast((p) => [...p.slice(-(HISTORY - 1)), before]); setFuture([]); setShapes(next); setDirty(true)
  }, [shapes])
  const undo = useCallback(() => {
    if (!past.length) return
    setFuture([shapes, ...future].slice(0, HISTORY)); setShapes(past[past.length - 1]); setPast(past.slice(0, -1)); setDirty(true)
  }, [past, future, shapes])
  const redo = useCallback(() => {
    if (!future.length) return
    setPast([...past, shapes].slice(-HISTORY)); setShapes(future[0]); setFuture(future.slice(1)); setDirty(true)
  }, [past, future, shapes])
  const update = (key: string, patch: Partial<Shape>) => commit(shapes.map((s) => (s.key === key ? { ...s, ...patch } : s)))

  // ── coordinates ──
  const toPage = (e: { clientX: number; clientY: number }): Pt => {
    const svg = svgRef.current!
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse())
    return [clamp01(p.x / width), clamp01(p.y / height)]
  }
  // Page pixels per screen pixel, from the canvas width (kept in state: refs are not read during render).
  const scale = view.w / (clientW || 1000)
  const handleR = () => scale * 6

  const nextLabel = () => {
    const nums = shapes.map((s) => Number(s.label)).filter((n) => Number.isInteger(n))
    let n = nums.length ? Math.max(...nums) + 1 : shapes.length + 1
    while (shapes.some((s) => labelKey(s.label) === String(n))) n++
    return String(n)
  }
  const finishPolygon = (pts: Pt[]) => {
    if (pts.length >= 3) {
      const s: Shape = { key: newKey(), label: nextLabel(), kind: 'polygon', points: pts, unitId: null }
      commit([...shapes, s]); setSelected(s.key); setTool('select'); setTimeout(() => labelRef.current?.select(), 0)
    }
    setDrawing([]); setCursor(null)
  }

  // ── pointer ──
  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    const p = toPage(e)
    const target = e.target as Element
    const role = target.getAttribute('data-role'), key = target.getAttribute('data-key'), idx = Number(target.getAttribute('data-index'))
    if (tool === 'pan' || space || e.button === 1) {
      drag.current = { type: 'pan', start: [e.clientX, e.clientY], view }; (e.currentTarget as Element).setPointerCapture(e.pointerId); return
    }
    if (tool === 'polygon') {
      if (drawing.length >= 3) {
        const [fx, fy] = drawing[0]
        if (Math.hypot((fx - p[0]) * width, (fy - p[1]) * height) < handleR() * 2) { finishPolygon(drawing); return }
      }
      setDrawing([...drawing, p]); return
    }
    if (tool === 'rect') {
      drag.current = { type: 'rect-new', start: p }; setRectDraft([p, p]); (e.currentTarget as Element).setPointerCapture(e.pointerId); return
    }
    // select tool
    gestureStart.current = shapes
    if (role === 'vertex' && key) { setSelected(key); setVertex(idx); drag.current = { type: 'vertex', key, index: idx } }
    else if (role === 'mid' && key) {
      const s = shapes.find((x) => x.key === key)!
      if (s.kind === 'polygon' && s.points.length < 200) {
        const pts = [...s.points]; pts.splice(idx + 1, 0, p)
        setShapes(shapes.map((x) => (x.key === key ? { ...x, points: pts } : x)))
        setVertex(idx + 1); drag.current = { type: 'vertex', key, index: idx + 1 }
      }
    } else if (role === 'shape' && key) {
      setSelected(key); setVertex(null)
      drag.current = { type: 'move', key, start: p, orig: shapes.find((x) => x.key === key)!.points }
    } else {
      setSelected(null); setVertex(null)
      drag.current = { type: 'pan', start: [e.clientX, e.clientY], view }
    }
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const d = drag.current
    if (tool === 'polygon' && drawing.length) setCursor(toPage(e))
    if (!d) return
    if (d.type === 'pan') {
      const s = scale
      setView({ ...d.view, x: d.view.x - (e.clientX - d.start[0]) * s, y: d.view.y - (e.clientY - d.start[1]) * s }); return
    }
    const p = toPage(e)
    if (d.type === 'rect-new') { setRectDraft([d.start, p]); return }
    if (d.type === 'move') {
      let dx = p[0] - d.start[0], dy = p[1] - d.start[1]
      const xs = d.orig.map((q) => q[0]), ys = d.orig.map((q) => q[1])
      dx = Math.min(1 - Math.max(...xs), Math.max(-Math.min(...xs), dx)); dy = Math.min(1 - Math.max(...ys), Math.max(-Math.min(...ys), dy))
      setShapes((all) => all.map((s) => (s.key === d.key ? { ...s, points: d.orig.map(([x, y]) => [x + dx, y + dy] as Pt) } : s))); return
    }
    if (d.type === 'vertex') {
      setShapes((all) => all.map((s) => {
        if (s.key !== d.key) return s
        if (s.kind === 'rect') {
          const o = s.points[(d.index + 2) % 4]
          const x0 = Math.min(o[0], p[0]), x1 = Math.max(o[0], p[0]), y0 = Math.min(o[1], p[1]), y1 = Math.max(o[1], p[1])
          return { ...s, points: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] }
        }
        const pts = [...s.points]; pts[d.index] = p; return { ...s, points: pts }
      }))
    }
  }

  function onPointerUp() {
    const d = drag.current
    drag.current = null
    if (!d) return
    if (d.type === 'rect-new' && rectDraft) {
      const [[ax, ay], [bx, by]] = rectDraft
      setRectDraft(null)
      if (Math.abs(ax - bx) * width > 4 && Math.abs(ay - by) * height > 4) {
        const x0 = Math.min(ax, bx), x1 = Math.max(ax, bx), y0 = Math.min(ay, by), y1 = Math.max(ay, by)
        const s: Shape = { key: newKey(), label: nextLabel(), kind: 'rect', points: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], unitId: null }
        commit([...shapes, s]); setSelected(s.key); setTool('select'); setTimeout(() => labelRef.current?.select(), 0)
      }
      return
    }
    const before = gestureStart.current
    gestureStart.current = null
    if ((d.type === 'move' || d.type === 'vertex') && before && before !== shapes) {
      setPast((p) => [...p.slice(-(HISTORY - 1)), before]); setFuture([]); setDirty(true)
    }
  }

  function onWheel(e: React.WheelEvent<SVGSVGElement>) {
    const [px, py] = toPage(e).map((v, i) => v * (i ? height : width))
    const f = e.deltaY > 0 ? 1.15 : 1 / 1.15
    setView((v) => {
      const w = Math.min(width * 4, Math.max(width / 40, v.w * f)), k = w / v.w
      return { x: px - (px - v.x) * k, y: py - (py - v.y) * k, w, h: v.h * k }
    })
  }
  const zoom = (f: number) => setView((v) => {
    const w = Math.min(width * 4, Math.max(width / 40, v.w * f)), k = w / v.w
    return { x: v.x + (v.w - w) / 2, y: v.y + (v.h - v.h * k) / 2, w, h: v.h * k }
  })
  const fit = () => setView({ x: 0, y: 0, w: width, h: height })
  const focus = (s: Shape) => {
    setSelected(s.key); setVertex(null); setTool('select')
    const [cx, cy] = centroid(s.points)
    setView((v) => ({ ...v, x: cx * width - v.w / 2, y: cy * height - v.h / 2 }))
  }

  const removeSelected = useCallback(() => {
    if (!sel) return
    if (vertex !== null && sel.kind === 'polygon' && sel.points.length > 3) {
      commit(shapes.map((s) => (s.key === sel.key ? { ...s, points: s.points.filter((_, i) => i !== vertex) } : s))); setVertex(null); return
    }
    commit(shapes.filter((s) => s.key !== sel.key)); setSelected(null); setVertex(null)
  }, [sel, vertex, shapes, commit])

  // ── save ──
  const save = useCallback(async (auto = false) => {
    if (saving) return
    setSaving(true); if (!auto) setSaveError(null)
    try {
      const res = await fetch(url, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, shapes: shapes.map((s) => ({ ...(s.id ? { id: s.id } : {}), label: s.label, kind: s.kind, points: s.points, ...(drawOnly ? {} : { unitId: s.unitId }) })) }),
      })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) { setSaveError(out.error ?? 'Could not save.'); return }
      // Refresh ids for new shapes so later saves update rather than re-create them.
      const fresh = await fetch(`${url}?orgId=${orgId}`, { cache: 'no-store' }).then((r) => r.json()).catch(() => null)
      if (fresh?.shapes) {
        const byLabel = new Map((fresh.shapes as { id: string; label: string }[]).map((s) => [labelKey(s.label), s.id]))
        setShapes((all) => all.map((s) => ({ ...s, id: byLabel.get(labelKey(s.label)) ?? s.id })))
      }
      setDirty(false); setSaveError(null); setSavedAt(new Date())
    } catch { setSaveError('Network error. Your changes are still here; try again.') } finally { setSaving(false) }
  }, [saving, url, orgId, shapes, drawOnly])

  useEffect(() => {
    if (!dirty) return
    const t = setTimeout(() => { if (!drag.current && !drawing.length) save(true) }, 30_000)
    return () => clearTimeout(t)
  }, [dirty, shapes, drawing.length, save])
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setClientW(el.clientWidth || 1000))
    ro.observe(el); setClientW(el.clientWidth || 1000)
    return () => ro.disconnect()
  }, [])

  // ── keyboard ──
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const typing = (e.target as HTMLElement)?.closest('input, textarea, select')
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); return }
      if (typing) return
      if (e.key === ' ') { setSpace(true); e.preventDefault(); return }
      if (e.key === 'Escape') { setDrawing([]); setCursor(null); setRectDraft(null); setSelected(null); setVertex(null); return }
      if (e.key === 'Enter' && tool === 'polygon') { finishPolygon(drawing); return }
      if (e.key === 'Backspace' && tool === 'polygon' && drawing.length) { setDrawing(drawing.slice(0, -1)); return }
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); removeSelected(); return }
      const k = e.key.toLowerCase()
      if (k === 'v') setTool('select'); else if (k === 'p') setTool('polygon'); else if (k === 'r') setTool('rect'); else if (k === 'h') setTool('pan')
    }
    const onUp = (e: KeyboardEvent) => { if (e.key === ' ') setSpace(false) }
    window.addEventListener('keydown', onKey); window.addEventListener('keyup', onUp)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onUp) }
  })

  const filteredShapes = shapes.filter((s) => !query || labelKey(s.label).includes(query.trim().toLowerCase()))
  const unitChoices = units.filter((u) => !usedUnits.has(u.id) && (!unitQuery || u.unitNumber.toLowerCase().includes(unitQuery.trim().toLowerCase()))).slice(0, 50)
  const r = handleR()
  const blocking = validation.errors.length + validation.overlaps.length + validation.duplicateLabels.length + validation.duplicateUnits.length
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-default bg-surface p-2">
        <span className="mr-2 text-[13px] font-medium text-foreground">{title}</span>
        <ToolBtn tool={tool} onPick={(t) => { setTool(t); setDrawing([]); setCursor(null) }} t="select" label="Select" icon={MousePointer2} k="V" />
        <ToolBtn tool={tool} onPick={(t) => { setTool(t); setDrawing([]); setCursor(null) }} t="polygon" label="Polygon" icon={Hexagon} k="P" />
        <ToolBtn tool={tool} onPick={(t) => { setTool(t); setDrawing([]); setCursor(null) }} t="rect" label="Rectangle" icon={Square} k="R" />
        <ToolBtn tool={tool} onPick={(t) => { setTool(t); setDrawing([]); setCursor(null) }} t="pan" label="Pan" icon={Hand} k="H" />
        <span className="mx-1 h-6 w-px bg-[var(--border)]" aria-hidden />
        <Button size="sm" variant="secondary" onClick={undo} disabled={!past.length} aria-label="Undo" title="Undo (Ctrl+Z)"><Undo2 aria-hidden /></Button>
        <Button size="sm" variant="secondary" onClick={redo} disabled={!future.length} aria-label="Redo" title="Redo (Ctrl+Shift+Z)"><Redo2 aria-hidden /></Button>
        <Button size="sm" variant="secondary" onClick={() => zoom(1 / 1.4)} aria-label="Zoom in"><Plus aria-hidden /></Button>
        <Button size="sm" variant="secondary" onClick={() => zoom(1.4)} aria-label="Zoom out"><Minus aria-hidden /></Button>
        <Button size="sm" variant="secondary" onClick={fit} aria-label="Fit page"><Maximize aria-hidden /></Button>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[12px] text-muted" aria-live="polite">{saving ? 'Saving…' : dirty ? 'Unsaved changes' : savedAt ? `Saved ${savedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : 'All changes saved'}</span>
          <Button size="sm" onClick={() => save()} loading={saving} disabled={!dirty}><Save aria-hidden /> Save draft</Button>
        </div>
      </div>
      {saveError && <Alert tone="danger">{saveError}</Alert>}
      {tool === 'polygon' && <p className="text-[12px] text-muted">Click each corner of the plot. Finish by clicking the first corner, double-clicking or pressing Enter. Backspace removes the last corner; Esc cancels.</p>}
      <p className="text-[12px] text-muted md:hidden">Drawing works best on a computer or tablet.</p>

      <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
        <div className="relative h-[70vh] min-h-[420px] overflow-hidden rounded-lg border border-default bg-surface-muted">
          <svg ref={svgRef} role="application" aria-label="Plot map editor" className={cn('h-full w-full touch-none select-none', tool === 'pan' || space ? 'cursor-grab' : tool === 'select' ? 'cursor-default' : 'cursor-crosshair')}
            viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} preserveAspectRatio="xMidYMid meet"
            onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onWheel={onWheel}
            onDoubleClick={() => { if (tool === 'polygon') finishPolygon(drawing) }}>
            <image href={imageUrl} x={0} y={0} width={width} height={height} preserveAspectRatio="none" />
            {shapes.map((s) => {
              const pts = s.points.map(([x, y]) => `${x * width},${y * height}`).join(' ')
              const bad = overlapLabels.has(labelKey(s.label)) || dupLabels.has(labelKey(s.label))
              const color = bad ? 'var(--danger)' : s.unitId ? 'var(--success)' : 'var(--warning)'
              const [cx, cy] = centroid(s.points)
              return (
                <g key={s.key}>
                  <polygon data-role="shape" data-key={s.key} points={pts} fill={color} fillOpacity={s.key === selected ? 0.35 : 0.18}
                    stroke={s.key === selected ? 'var(--brand)' : color} strokeWidth={scale * (s.key === selected ? 2.5 : 1.5)} />
                  <text x={cx * width} y={cy * height} textAnchor="middle" dominantBaseline="central" pointerEvents="none"
                    fontSize={Math.max(scale * 11, 8)} fontWeight={600} fill="var(--foreground)" stroke="var(--surface)" strokeWidth={scale * 3} paintOrder="stroke">{s.label}</text>
                </g>
              )
            })}
            {sel && tool === 'select' && (
              <g>
                {sel.kind === 'polygon' && sel.points.map((p, i) => {
                  const q = sel.points[(i + 1) % sel.points.length]
                  return <circle key={`m${i}`} data-role="mid" data-key={sel.key} data-index={i} cx={((p[0] + q[0]) / 2) * width} cy={((p[1] + q[1]) / 2) * height} r={r * 0.7}
                    fill="var(--surface)" stroke="var(--brand)" strokeWidth={scale} strokeDasharray={`${scale * 2}`} className="cursor-copy" />
                })}
                {sel.points.map((p, i) => (
                  <circle key={`v${i}`} data-role="vertex" data-key={sel.key} data-index={i} cx={p[0] * width} cy={p[1] * height} r={r}
                    fill={vertex === i ? 'var(--brand)' : 'var(--surface)'} stroke="var(--brand)" strokeWidth={scale * 1.5} className="cursor-move" />
                ))}
              </g>
            )}
            {drawing.length > 0 && (
              <g pointerEvents="none">
                <polyline points={[...drawing, ...(cursor ? [cursor] : [])].map(([x, y]) => `${x * width},${y * height}`).join(' ')} fill="none" stroke="var(--brand)" strokeWidth={scale * 2} />
                {drawing.map((p, i) => <circle key={i} cx={p[0] * width} cy={p[1] * height} r={r * (i === 0 ? 1.3 : 0.8)} fill={i === 0 ? 'var(--brand)' : 'var(--surface)'} stroke="var(--brand)" strokeWidth={scale} />)}
              </g>
            )}
            {rectDraft && (
              <rect pointerEvents="none" x={Math.min(rectDraft[0][0], rectDraft[1][0]) * width} y={Math.min(rectDraft[0][1], rectDraft[1][1]) * height}
                width={Math.abs(rectDraft[0][0] - rectDraft[1][0]) * width} height={Math.abs(rectDraft[0][1] - rectDraft[1][1]) * height}
                fill="var(--brand)" fillOpacity={0.15} stroke="var(--brand)" strokeWidth={scale * 2} />
            )}
          </svg>
          <div className="pointer-events-none absolute bottom-2 left-2 flex gap-3 rounded-md bg-surface/90 px-2 py-1 text-[11px] text-muted">
            <span><span aria-hidden className="mr-1 inline-block size-2 rounded-full bg-success" />linked</span>
            <span><span aria-hidden className="mr-1 inline-block size-2 rounded-full bg-warning" />not linked</span>
            <span><span aria-hidden className="mr-1 inline-block size-2 rounded-full bg-danger" />overlap or duplicate</span>
          </div>
        </div>

        <aside className="space-y-3" aria-label="Plot details and checks">
          {sel ? (
            <section className="space-y-3 rounded-lg border border-default bg-surface p-3">
              <Field label="Plot number">
                <Input ref={labelRef} value={sel.label} maxLength={40} onChange={(e) => update(sel.key, { label: e.target.value })} />
              </Field>
              {drawOnly ? (
                <p className="text-[12px] text-muted">{sel.unitId ? 'The customer has linked this plot to a unit.' : 'Not linked yet — the customer links plots to their inventory.'}</p>
              ) : <div className="space-y-2">
                <p className="text-[13px] font-medium text-foreground">Inventory unit</p>
                {sel.unitId ? (
                  <div className="flex items-center justify-between gap-2 rounded-md border border-default px-2 py-1.5 text-[13px]">
                    <span><Link2 aria-hidden className="mr-1 inline size-3.5 text-success" />{unitById.get(sel.unitId)?.unitNumber ?? 'Unknown unit'} <span className="text-muted">· {statusLabels[unitById.get(sel.unitId)?.status as keyof typeof statusLabels] ?? unitById.get(sel.unitId)?.status.replace('_', ' ')}</span></span>
                    <Button size="sm" variant="ghost" onClick={() => update(sel.key, { unitId: null })}><Link2Off aria-hidden /> Unlink</Button>
                  </div>
                ) : (
                  <>
                    {suggestion(sel) && (
                      <Button size="sm" variant="secondary" className="w-full" onClick={() => update(sel.key, { unitId: suggestion(sel)!.id })}>
                        <Link2 aria-hidden /> Link to unit {suggestion(sel)!.unitNumber} (matches the plot number)
                      </Button>
                    )}
                    <Input placeholder="Find a unit to link…" value={unitQuery} onChange={(e) => setUnitQuery(e.target.value)} aria-label="Find a unit" />
                    <ul className="max-h-40 overflow-y-auto rounded-md border border-default text-[13px]">
                      {unitChoices.length === 0 ? <li className="px-2 py-1.5 text-muted">No unlinked unit matches.</li> : unitChoices.map((u) => (
                        <li key={u.id}><button type="button" className="w-full px-2 py-1.5 text-left hover:bg-surface-hover" onClick={() => { update(sel.key, { unitId: u.id }); setUnitQuery('') }}>{u.unitNumber} <span className="text-muted">· {statusLabels[u.status as keyof typeof statusLabels] ?? u.status.replace('_', ' ')}</span></button></li>
                      ))}
                    </ul>
                  </>
                )}
              </div>}
              <Button size="sm" variant="secondary" onClick={removeSelected}><Trash2 aria-hidden /> {vertex !== null && sel.kind === 'polygon' && sel.points.length > 3 ? 'Delete corner' : 'Delete plot'}</Button>
            </section>
          ) : (
            <p className="rounded-lg border border-dashed border-default p-3 text-[13px] text-muted">Select a plot to change its number or link it to a unit, or draw a new one with the Polygon or Rectangle tool.</p>
          )}

          <section className="space-y-2 rounded-lg border border-default bg-surface p-3" aria-labelledby="checks">
            <div className="flex items-center justify-between">
              <h3 id="checks" className="text-[13px] font-semibold text-foreground">Checks</h3>
              {isSubmittable(validation) ? <Badge tone="success">No blocking issues</Badge> : <Badge tone="danger">{blocking} to fix</Badge>}
            </div>
            <ul className="space-y-1 text-[12px]">
              {validation.errors.slice(0, 5).map((e) => <li key={e} className="text-danger">{e}</li>)}
              {validation.duplicateLabels.length > 0 && <li className="text-danger">Plot number used twice: {validation.duplicateLabels.slice(0, 8).join(', ')}</li>}
              {validation.duplicateUnits.length > 0 && <li className="text-danger">Unit linked twice: {validation.duplicateUnits.slice(0, 8).join(', ')}</li>}
              {validation.overlaps.length > 0 && <li className="text-danger">Overlapping plots: {validation.overlaps.slice(0, 6).map(([a, b]) => `${a} & ${b}`).join(', ')}{validation.overlaps.length > 6 ? '…' : ''}</li>}
              <li className={validation.unlinked.length ? 'text-warning' : 'text-muted'}>{validation.unlinked.length} plot{validation.unlinked.length === 1 ? '' : 's'} not linked to a unit</li>
              {!drawOnly && <li className={validation.unmappedUnits.length ? 'text-warning' : 'text-muted'} title={validation.unmappedUnits.slice(0, 40).join(', ')}>{validation.unmappedUnits.length} unit{validation.unmappedUnits.length === 1 ? '' : 's'} of this project not on the map</li>}
            </ul>
            {!drawOnly && suggestions.length > 0 && (
              <div className="space-y-1 border-t border-default pt-2">
                <p className="text-[12px] text-muted">{suggestions.length} plot{suggestions.length === 1 ? '' : 's'} match a unit by number. Review and confirm:</p>
                <Button size="sm" variant="secondary" className="w-full" onClick={() => commit(shapes.map((s) => { const u = suggestion(s); return u ? { ...s, unitId: u.id } : s }))}>
                  <Link2 aria-hidden /> Link {suggestions.length} matching plot{suggestions.length === 1 ? '' : 's'}
                </Button>
              </div>
            )}
          </section>

          <section className="space-y-2 rounded-lg border border-default bg-surface p-3" aria-labelledby="plots">
            <h3 id="plots" className="text-[13px] font-semibold text-foreground">Plots ({shapes.length})</h3>
            <div className="relative">
              <Search aria-hidden className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
              <Input className="pl-7" placeholder="Find a plot" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Find a plot" />
            </div>
            <ul className="max-h-64 overflow-y-auto text-[13px]">
              {filteredShapes.slice(0, 300).map((s) => (
                <li key={s.key}>
                  <button type="button" onClick={() => focus(s)} className={cn('flex w-full items-center justify-between px-2 py-1 text-left hover:bg-surface-hover', s.key === selected && 'bg-brand-light')}>
                    <span>{s.label || '(no number)'}</span>
                    <span className={s.unitId ? 'text-success' : 'text-warning'}>{s.unitId ? (drawOnly ? 'linked' : unitById.get(s.unitId)?.unitNumber) : 'not linked'}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  )
}
