'use client'
// components/plots/PlotMap.tsx — an interactive plot map: the layout's geometry (lib/plots/svg.ts, numbers only)
// drawn as React elements, each plot coloured by its live inventory status. Search, status filters, zoom and pan,
// and a details card. Used in the workspace (mode "team") and on the public share page (mode "public").
// Accessible: every plot is a focusable button with a spoken label; colour is never the only signal (legend, card).
import { useStatusLabels } from '@/components/settings/WorkspacePrefs'
import { Input } from '@/components/ui'
import { createElement, useMemo, useRef, useState } from 'react'
import { Maximize2, MessageCircle, Minus, Phone, Plus, Search, X, RotateCw } from 'lucide-react'
import type { LayoutGeometry, PlotInfo } from '@/lib/dal/plot-layouts'
import { cn } from '@/lib/utils/cn'
import { PlotEnquiryForm } from '@/components/plots/PlotEnquiryForm'

type Mode = 'team' | 'public'

/** Status → colour token and label. Team sees the inventory's own statuses; buyers see available/reserved/sold. */
const STATUS: Record<string, { label: string; color: string }> = {
  available: { label: 'Available', color: 'var(--success)' },
  on_hold: { label: 'On hold', color: 'var(--warning)' },
  reserved: { label: 'Reserved', color: 'var(--warning)' },
  booked: { label: 'Booked', color: 'var(--info)' },
  sold: { label: 'Sold', color: 'var(--danger)' },
  blocked: { label: 'Blocked', color: 'var(--foreground-subtle)' },
}
const statusOf = (s: string) => STATUS[s] ?? { label: s, color: 'var(--foreground-subtle)' }

const inr = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
const AREA_UNIT: Record<string, string> = { sqft: 'sq ft', sqyd: 'sq yd', sqm: 'sq m', acres: 'acres', 'sq ft': 'sq ft' }

export interface PlotMapProps {
  mode: Mode
  viewBox: string
  geometry: LayoutGeometry
  plots: Record<string, PlotInfo>
  showPrices: boolean
  /** Team mode: where a plot's unit opens. */
  /** Team mode: where "Open in project" goes. A plain string: server pages cannot pass functions to this client component. */
  unitHref?: string
  /** Public mode: who to contact about a plot. */
  contact?: { phone: string | null; projectName: string; orgName: string }
  /** A map drawn on the developer's layout page: the page image behind the plots (same coordinate space as viewBox). */
  image?: { href: string; width: number; height: number }
  /** Public mode: the share link's token — shows the enquiry / site-visit form for an available plot. */
  enquiryToken?: string
  /** Compass: degrees clockwise from up that north points on this drawing (0 = north is up). */
  northDeg?: number
  /** Open in the 3D view (the website tour). */
  initial3d?: boolean
}

export function PlotMap({ mode, viewBox, geometry, plots, showPrices, unitHref, contact, image, enquiryToken, northDeg = 0, initial3d = false }: PlotMapProps) {
  const statusLabels = useStatusLabels()
  const labelOf = (st: string) => statusLabels[st as keyof typeof statusLabels] ?? statusOf(st).label
  const base = useMemo(() => viewBox.split(' ').map(Number) as [number, number, number, number], [viewBox])
  const [view, setView] = useState(base)
  const [selected, setSelected] = useState<string | null>(null)
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  // 3D view: the layout tilted, each plot a raised block (selected ones lift further); drag turns it.
  const [is3d, setIs3d] = useState(initial3d)
  const [spin, setSpin] = useState(-25)
  const svgRef = useRef<SVGSVGElement>(null)
  const drag = useRef<{ x: number; y: number; view: typeof base; moved: boolean } | null>(null)

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const p of Object.values(plots)) c[p.status] = (c[p.status] ?? 0) + 1
    return c
  }, [plots])
  const statuses = Object.keys(counts).sort((a, b) => Object.keys(STATUS).indexOf(a) - Object.keys(STATUS).indexOf(b))
  const matches = query.trim()
    ? Object.keys(plots).filter((k) => k.toLowerCase().replace(/[\s-]/g, '').includes(query.toLowerCase().replace(/[\s-]/g, ''))).slice(0, 8)
    : []
  const sel = selected ? plots[selected] : null
  const depth = Math.max(base[2], base[3]) * 0.022

  function zoom(factor: number, cx?: number, cy?: number) {
    setView(([x, y, w, h]) => {
      const nw = Math.min(base[2] * 1.5, Math.max(base[2] / 20, w * factor))
      const nh = nw * (h / w)
      const px = cx ?? x + w / 2, py = cy ?? y + h / 2
      return [px - (px - x) * (nw / w), py - (py - y) * (nh / h), nw, nh]
    })
  }
  function toSvg(clientX: number, clientY: number) {
    const r = svgRef.current!.getBoundingClientRect()
    return [view[0] + ((clientX - r.left) / r.width) * view[2], view[1] + ((clientY - r.top) / r.height) * view[3]]
  }
  function onWheel(e: React.WheelEvent) {
    if (!e.ctrlKey && !e.metaKey && Math.abs(e.deltaY) < 40) return
    const [cx, cy] = toSvg(e.clientX, e.clientY)
    zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15, cx, cy)
  }
  function onPointerDown(e: React.PointerEvent) {
    drag.current = Object.assign({ x: e.clientX, y: e.clientY, view, moved: false }, { spin0: spin })
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current
    if (!d || !svgRef.current) return
    const r = svgRef.current.getBoundingClientRect()
    const dx = ((e.clientX - d.x) / r.width) * d.view[2], dy = ((e.clientY - d.y) / r.height) * d.view[3]
    if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 4) { d.moved = true; svgRef.current.setPointerCapture?.(e.pointerId) }
    if (d.moved) {
      if (is3d) setSpin((d as typeof d & { spin0?: number }).spin0! + (e.clientX - d.x) * 0.4)
      else setView([d.view[0] - dx, d.view[1] - dy, d.view[2], d.view[3]])
    }
  }
  function onPointerUp() { setTimeout(() => { drag.current = null }, 0) }
  // One click handler for the whole map (event delegation): a drag that moved the map is not a click on a plot.
  function onMapClick(e: React.MouseEvent) {
    const key = (e.target as Element).getAttribute?.('data-plot')
    if (key && !drag.current?.moved) setSelected(key)
  }

  function describe(key: string, p?: PlotInfo) {
    if (!p) return `Plot ${key}, not linked to a unit`
    const area = p.area ? `, ${p.area} ${AREA_UNIT[p.areaUnit ?? ''] ?? p.areaUnit ?? ''}` : ''
    return `Plot ${p.unitNumber}, ${labelOf(p.status)}${area}${p.facing ? `, ${p.facing} facing` : ''}`
  }

  const enquire = sel && contact?.phone
    ? `https://wa.me/${contact.phone.replace(/\D/g, '')}?text=${encodeURIComponent(`Hi, I’m interested in plot ${sel.unitNumber} at ${contact.projectName}. Please share the details.`)}`
    : null

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-48 flex-1 sm:max-w-xs">
            <span className="sr-only">Find a plot</span>
            <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-subtle" />
            <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a plot, e.g. N46"
              className="pl-8 pr-2 focus-visible:ring-[var(--brand)]" />
            {matches.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full rounded-md border border-default bg-surface py-1 shadow-md">
                {matches.map((k) => (
                  <li key={k}><button type="button" onClick={() => { setSelected(k); setQuery('') }} className="block w-full px-3 py-2 text-left text-[13px] hover:bg-surface-hover">
                    {plots[k].unitNumber} · <span className="text-muted">{labelOf(plots[k].status)}</span>
                  </button></li>
                ))}
              </ul>
            )}
          </label>
          <div role="group" aria-label="Show plots by status" className="flex flex-wrap gap-1.5">
            {statuses.map((s) => {
              const on = !hidden.has(s)
              return (
                <button key={s} type="button" aria-pressed={on} onClick={() => setHidden((h) => { const n = new Set(h); if (on) n.add(s); else n.delete(s); return n })}
                  className={cn('inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium', on ? 'border-default bg-surface text-foreground' : 'border-dashed border-default text-subtle line-through')}>
                  <span aria-hidden className="size-2.5 rounded-full" style={{ background: statusOf(s).color }} />
                  {labelOf(s)} <span className="text-muted">{counts[s]}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="relative overflow-hidden rounded-xl border border-default bg-surface-muted">
          <div style={is3d ? { perspective: '1400px' } : undefined} className={is3d ? 'py-6' : undefined}>
          <svg ref={svgRef} viewBox={view.join(' ')} role="group" aria-label="Plot layout"
            style={{ aspectRatio: `${base[2]} / ${base[3]}`, ...(is3d ? { transform: `rotateX(52deg) rotateZ(${spin}deg) scale(0.86)`, transformStyle: 'preserve-3d' as const } : {}) }}
            className="block max-h-[70dvh] w-full touch-none select-none motion-safe:transition-transform motion-safe:duration-300"
            onClick={onMapClick} onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp}>
            {image?.href && <image href={image.href} x={0} y={0} width={image.width} height={image.height} preserveAspectRatio="none" aria-hidden />}
            {is3d && geometry.shapes.map((s, i) => {
              // The block's sides: the same outline, darker, a little lower — drawn first so every top sits on its sides.
              if (!s.key) return null
              const plot = plots[s.key]
              const st = plot ? statusOf(plot.status) : null
              if (!st || (plot && hidden.has(plot.status))) return null
              return createElement(s.kind, { key: `side${i}`, ...s.attrs, transform: `${s.transform ?? ''} translate(0 ${depth})`, fill: st.color, fillOpacity: 1, style: { filter: 'brightness(0.62)' }, 'aria-hidden': true, className: 'pointer-events-none' })
            })}
            {geometry.shapes.map((s, i) => {
              const plot = s.key ? plots[s.key] : undefined
              const common = { ...s.attrs, transform: s.transform, vectorEffect: 'non-scaling-stroke' as const }
              if (!s.key) return createElement(s.kind, { key: i, ...common, fill: s.fill ?? 'none', stroke: 'var(--border-strong)', strokeWidth: 1, 'aria-hidden': true })
              const st = plot ? statusOf(plot.status) : null
              const dim = plot && hidden.has(plot.status)
              const isSel = selected === s.key
              return createElement(s.kind, {
                key: i, ...common, role: 'button', tabIndex: dim ? -1 : 0, 'aria-label': describe(s.key, plot), 'aria-pressed': isSel,
                fill: st ? st.color : 'var(--surface)', fillOpacity: dim ? 0.08 : is3d ? 1 : isSel ? 0.95 : image ? 0.45 : 0.7,
                ...(is3d ? { transform: `${s.transform ?? ''} translate(0 ${isSel ? -depth * 1.8 : -depth * 0.35})` } : {}),
                stroke: isSel ? 'var(--foreground)' : plot ? 'var(--surface)' : 'var(--border-strong)', strokeWidth: isSel ? 3 : 1,
                strokeDasharray: plot ? undefined : '4 3',
                className: 'cursor-pointer outline-none transition-[fill-opacity] hover:[fill-opacity:0.95] focus-visible:[stroke:var(--brand)] focus-visible:[stroke-width:3]',
                'data-plot': s.key, onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(s.key!) } },
              })
            })}
            {geometry.labels.map((l, i) => (
              <text key={`t${i}`} x={l.x} y={l.y} transform={l.transform} fontSize={l.size ?? 12} textAnchor={image ? 'middle' : undefined} aria-hidden
                className="pointer-events-none fill-[var(--foreground)] font-semibold" stroke={image ? 'var(--surface)' : undefined} strokeWidth={image ? (l.size ?? 12) / 5 : undefined} paintOrder="stroke">{l.text}</text>
            ))}
          </svg>
          </div>
          <div className="pointer-events-none absolute left-3 top-3 grid size-12 place-items-center rounded-full border border-default bg-surface/90 shadow-sm" role="img" aria-label={`Compass: north points ${northDeg ? `${northDeg}° clockwise from up` : 'up'}`}>
            <svg viewBox="-20 -20 40 40" className="size-10" style={{ transform: `rotate(${northDeg + (is3d ? spin : 0)}deg)` }} aria-hidden="true">
              <text x="0" y="-9" textAnchor="middle" fontSize="9" fontWeight="700" className="fill-[var(--danger)]">N</text>
              <polygon points="0,-6 4,4 0,2 -4,4" fill="var(--danger)" />
              <polygon points="0,15 4,4 0,6 -4,4" fill="var(--foreground-muted)" />
            </svg>
          </div>
          <div className="absolute bottom-3 right-3 flex flex-col overflow-hidden rounded-lg border border-default bg-surface shadow-sm">
            <button type="button" aria-label="Zoom in" onClick={() => zoom(1 / 1.4)} className="grid size-10 place-items-center hover:bg-surface-hover"><Plus aria-hidden className="size-4" /></button>
            <button type="button" aria-label="Zoom out" onClick={() => zoom(1.4)} className="grid size-10 place-items-center border-t border-default hover:bg-surface-hover"><Minus aria-hidden className="size-4" /></button>
            <button type="button" aria-label="Show the whole layout" onClick={() => setView(base)} className="grid size-10 place-items-center border-t border-default hover:bg-surface-hover"><Maximize2 aria-hidden className="size-4" /></button>
            <button type="button" aria-pressed={is3d} aria-label={is3d ? 'Flat view' : '3D view'} onClick={() => setIs3d((v) => !v)}
              className={cn('grid size-10 place-items-center border-t border-default text-[12px] font-bold hover:bg-surface-hover', is3d && 'bg-[var(--brand)] text-[#fff] hover:bg-[var(--brand)]')}>3D</button>
            {is3d && <button type="button" aria-label="Turn the layout" onClick={() => setSpin((v) => v + 45)} className="grid size-10 place-items-center border-t border-default hover:bg-surface-hover"><RotateCw aria-hidden className="size-4" /></button>}
          </div>
        </div>
        <p className="text-[12px] text-muted">{is3d ? 'Drag to turn the layout. Tap a plot to lift it and see its details.' : 'Drag to move, pinch or Ctrl + scroll to zoom. Tap a plot for its details. Try 3D.'}</p>
      </div>

      {/* Phones: the details slide up as a bottom sheet over the map; larger screens: a panel beside it. */}
      <aside aria-live="polite" className={cn(
        'h-fit border-default bg-surface p-4 lg:sticky lg:top-4 lg:block lg:rounded-xl lg:border lg:shadow-2xs',
        selected ? 'fixed inset-x-0 bottom-0 z-30 max-h-[70dvh] overflow-y-auto rounded-t-2xl border-t pb-[max(1rem,env(safe-area-inset-bottom))] shadow-lg lg:static lg:max-h-none' : 'hidden',
      )}>
        {!selected ? (
          <p className="text-[13px] text-muted">Select a plot on the map, or find one by its number.</p>
        ) : !sel ? (
          <div className="space-y-2">
            <p className="text-[15px] font-semibold text-foreground">Plot {selected}</p>
            <p className="text-[13px] text-muted">{mode === 'public' ? 'Details for this plot are not available yet.' : 'This plot isn’t linked to a unit in the published map yet.'}</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">{contact?.projectName ?? 'Plot'}</p>
                <p className="text-[18px] font-semibold text-foreground">Plot {sel.unitNumber}</p>
              </div>
              <button type="button" aria-label="Close" onClick={() => setSelected(null)} className="grid size-8 place-items-center rounded text-subtle hover:bg-surface-hover"><X aria-hidden className="size-4" /></button>
            </div>
            <p className="inline-flex items-center gap-1.5 rounded-full bg-surface-hover px-2.5 py-1 text-[12px] font-medium text-foreground">
              <span aria-hidden className="size-2.5 rounded-full" style={{ background: statusOf(sel.status).color }} /> {labelOf(sel.status)}
            </p>
            <dl className="grid grid-cols-2 gap-2 text-[13px]">
              {sel.area != null && <div><dt className="text-[11px] text-muted">Area</dt><dd className="font-medium">{sel.area} {AREA_UNIT[sel.areaUnit ?? ''] ?? sel.areaUnit}</dd></div>}
              {sel.dimensions && <div><dt className="text-[11px] text-muted">Dimensions</dt><dd className="font-medium">{sel.dimensions}</dd></div>}
              {sel.facing && <div><dt className="text-[11px] text-muted">Facing</dt><dd className="font-medium">{sel.facing}</dd></div>}
              {sel.roadWidthFt != null && <div><dt className="text-[11px] text-muted">Road</dt><dd className="font-medium">{sel.roadWidthFt} ft</dd></div>}
              {sel.corner && <div><dt className="text-[11px] text-muted">Position</dt><dd className="font-medium">Corner plot</dd></div>}
              {showPrices && sel.price != null && <div className="col-span-2"><dt className="text-[11px] text-muted">Price</dt><dd className="text-[15px] font-semibold">{inr(sel.price)}</dd></div>}
              {showPrices && sel.rate != null && <div className="col-span-2"><dt className="text-[11px] text-muted">Rate</dt><dd className="font-medium">{inr(sel.rate)} / {AREA_UNIT[sel.areaUnit ?? ''] ?? sel.areaUnit ?? 'sq ft'}</dd></div>}
            </dl>
            {mode === 'team' && unitHref && (
              <a href={unitHref} className="btn-primary inline-flex min-h-10 w-full items-center justify-center rounded-lg bg-brand px-4 text-[13px] font-medium text-brand-foreground hover:bg-brand-hover">Open in project</a>
            )}
            {mode === 'public' && sel.status === 'available' && enquiryToken && <PlotEnquiryForm key={sel.unitNumber} token={enquiryToken} plot={sel.unitNumber} />}
            {mode === 'public' && sel.status === 'available' && contact?.phone && (
              <div className="grid gap-2">
                {enquire && <a href={enquire} target="_blank" rel="noopener noreferrer" className="btn-primary inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand px-4 text-[14px] font-medium text-brand-foreground hover:bg-brand-hover"><MessageCircle aria-hidden className="size-4" /> Enquire on WhatsApp</a>}
                <a href={`tel:${contact.phone.replace(/[^\d+]/g, '')}`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-default px-4 text-[14px] font-medium text-foreground hover:bg-surface-hover"><Phone aria-hidden className="size-4" /> Call {contact.orgName}</a>
              </div>
            )}
          </div>
        )}
      </aside>
    </div>
  )
}
