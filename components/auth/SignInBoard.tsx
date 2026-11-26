'use client'
// components/auth/SignInBoard.tsx — the sign-in board: the sign-in card beside a live "inside RE" panel with an
// interactive 3D inventory stack (a tower's floors or a plot layout) that drifts on its own and follows the pointer or a
// finger; tapping a unit updates the lead timeline below. Illustration only, fictional data. Transforms only; still
// with reduced motion.
import { useEffect, useRef, useState } from 'react'

type Status = 'open' | 'booked' | 'visit' | 'hold'
const TILE: Record<Status, string> = { open: 'bg-[var(--chart-2)]', booked: 'bg-brand', visit: 'bg-[var(--chart-4)]', hold: 'bg-[var(--chart-3)]' }
const LABEL: Record<Status, string> = { open: 'Open', booked: 'Booked', visit: 'Visit', hold: 'Hold' }
type Unit = { no: string; status: Status; detail: string }

const u = (no: string, status: Status, detail: string): Unit => ({ no, status, detail })
const FLOORS: { label: string; units: Unit[] }[] = [
  { label: 'Floor 08', units: [u('801', 'open', '2 BHK · open for booking'), u('802', 'booked', '2 BHK · booked via partner'), u('803', 'open', '2 BHK · open'), u('804', 'hold', '2 BHK · 24 h token hold'), u('805', 'booked', '2 BHK · booked'), u('806', 'visit', '2 BHK · site visit today 4 PM')] },
  { label: 'Floor 12', units: [u('1201', 'booked', '3 BHK · booked'), u('1202', 'visit', '3 BHK · site visit scheduled'), u('1203', 'open', '3 BHK · open'), u('1204', 'open', '3 BHK east · open'), u('1205', 'hold', '3 BHK · partner hold'), u('1206', 'booked', '3 BHK corner · booked')] },
  { label: 'Floor 14', units: [u('1401', 'booked', '3 BHK · booked'), u('1402', 'open', '3 BHK · 1,850 sq ft · open'), u('1403', 'visit', '3 BHK · visit Sat 11:00'), u('1404', 'open', '3 BHK · open'), u('1405', 'booked', '3 BHK corner · booked'), u('1406', 'hold', '3 BHK · 24 h token hold')] },
]
const PLOTS: Unit[] = [u('101', 'booked', '300 sq yd east corner · booked'), u('102', 'open', '267 sq yd east · open'), u('103', 'visit', '267 sq yd · visit Sat 11 AM'), u('104', 'booked', '300 sq yd north-east · booked'), u('105', 'hold', '240 sq yd west · partner hold'), u('106', 'open', '240 sq yd west · open'), u('107', 'booked', '240 sq yd west · booked'), u('108', 'open', '280 sq yd corner · open')]
const STEPS = [
  { tag: 'Captured', tone: 'bg-brand-light text-brand border-brand/20', time: '10:42:03', text: 'Meta lead form · Rohan Iyer · 3 BHK' },
  { tag: 'Routed', tone: 'bg-info-bg text-info border-info/20', time: '10:42:04', text: 'Assigned to Asha (Towers Desk)' },
  { tag: 'Instant alert', tone: 'bg-warning-bg text-warning border-warning/25', time: '10:42:05', text: 'WhatsApp and call alert delivered' },
]
const SOURCES = ['Meta Ads', '99acres', 'MagicBricks', 'Housing.com', 'WhatsApp']

export function SignInBoard({ children }: { children: React.ReactNode }) {
  const stage = useRef<HTMLDivElement>(null)
  const model = useRef<HTMLDivElement>(null)
  const [kind, setKind] = useState<'tower' | 'plots'>('tower')
  const [floor, setFloor] = useState(2)
  const [picked, setPicked] = useState<{ id: string; detail: string }>({ id: 'A-1403', detail: '3 BHK · visit Sat 11:00' })

  useEffect(() => {
    const st = stage.current, el = model.current
    if (!st || !el) return
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const base = kind === 'tower' ? { x: 56, z: -36 } : { x: 54, z: -32 }
    if (still) { el.style.transform = `rotateX(${base.x}deg) rotateZ(${base.z}deg)`; return }
    let tx = 0, tz = 0, cx = 0, cz = 0, live = false, raf = 0
    const t0 = performance.now()
    const aim = (x: number, y: number) => {
      const r = st.getBoundingClientRect()
      tz = Math.max(-1, Math.min(1, ((x - r.left) / r.width) * 2 - 1)) * 13
      tx = -Math.max(-1, Math.min(1, ((y - r.top) / r.height) * 2 - 1)) * 8
    }
    const move = (e: PointerEvent) => { live = true; aim(e.clientX, e.clientY) }
    const leave = () => { live = false; tx = 0; tz = 0 }
    const touch = (e: TouchEvent) => { if (e.touches[0]) { live = true; aim(e.touches[0].clientX, e.touches[0].clientY) } }
    const tick = (now: number) => {
      const t = (now - t0) / 1000
      cx += (tx + (live ? 0 : Math.sin(t * 0.9) * 2.2) - cx) * 0.09
      cz += (tz + (live ? 0 : Math.cos(t * 0.7) * 4.5) - cz) * 0.09
      el.style.transform = `translateY(${(Math.sin(t * 1.4) * 3).toFixed(2)}px) rotateX(${(base.x + cx).toFixed(2)}deg) rotateZ(${(base.z + cz).toFixed(2)}deg)`
      raf = requestAnimationFrame(tick)
    }
    st.addEventListener('pointermove', move, { passive: true }); st.addEventListener('pointerleave', leave)
    st.addEventListener('touchstart', touch, { passive: true }); st.addEventListener('touchmove', touch, { passive: true }); st.addEventListener('touchend', leave)
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      st.removeEventListener('pointermove', move); st.removeEventListener('pointerleave', leave)
      st.removeEventListener('touchstart', touch); st.removeEventListener('touchmove', touch); st.removeEventListener('touchend', leave)
    }
  }, [kind])

  const tile = (unit: Unit, id: string, floorIdx?: number) => (
    <button key={id} type="button" aria-label={`${id}: ${unit.detail}`}
      onClick={(e) => { e.stopPropagation(); if (floorIdx !== undefined) setFloor(floorIdx); setPicked({ id, detail: unit.detail }) }}
      className={`iso-tile ${TILE[unit.status]} ${picked.id === id ? 'is-active' : ''}`}>{unit.no}</button>
  )

  return (
    <div className="grid w-full grid-cols-1 items-center gap-8 [&>*]:min-w-0 lg:grid-cols-[minmax(0,25rem)_minmax(0,1fr)] lg:gap-10">
      <span aria-hidden="true" className="signin-orb left-[-6rem] top-[-8rem] size-[28rem] bg-[rgb(79_70_229/0.12)]" />
      <span aria-hidden="true" className="signin-orb right-[-6rem] top-1/3 size-[25rem] bg-[rgb(56_189_248/0.11)]" />
      <section className="relative z-10 mx-auto w-full max-w-[420px]">{children}</section>

      <aside aria-label="Inside RE (illustration)" className="relative z-10 rounded-[28px] border border-[rgb(255_255_255/0.8)] bg-[linear-gradient(160deg,rgb(238_242_255/0.9),rgb(240_249_255/0.6))] p-5 shadow-[0_24px_54px_-16px_rgb(30_27_75/0.14)] sm:p-6">
        <h2 className="text-[20px] font-extrabold leading-tight tracking-tight text-foreground sm:text-[22px]">Every lead answered. Every unit accounted for.</h2>
        <p className="mt-1 text-[12px] text-muted">Live lead sync, site visits and 3D tower &amp; plot inventory in one workspace.</p>
        <span className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-[rgb(255_255_255/0.9)] bg-surface px-2.5 py-1 text-[11px] font-semibold text-foreground shadow-sm">
          <span className="size-1.5 animate-pulse rounded-full bg-success" /> Live sync active
        </span>

        <div className="ceramic mt-4 p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-brand">Interactive 3D inventory</p>
              <p className="mt-0.5 text-[14px] font-bold text-foreground">{kind === 'tower' ? 'Tower A · live floor stack' : 'Sunrise Villas · plot layout'}</p>
            </div>
            <div className="inline-flex rounded-full border border-default bg-surface-muted p-0.5 text-[11px] font-semibold" role="group" aria-label="Typology">
              {(['tower', 'plots'] as const).map((k) => (
                <button key={k} type="button" aria-pressed={kind === k} onClick={() => { setKind(k); setPicked(k === 'plots' ? { id: 'P-102', detail: PLOTS[1].detail } : { id: 'A-1403', detail: FLOORS[2].units[2].detail }) }}
                  className={`rounded-full px-2.5 py-1 transition-colors ${kind === k ? 'bg-surface text-foreground shadow-sm' : 'text-muted hover:text-foreground'}`}>{k === 'tower' ? 'Apartments' : 'Villa plots'}</button>
              ))}
            </div>
          </div>
          <div ref={stage} className="iso-stage">
            <div ref={model} className={kind === 'tower' ? 'iso-tower' : 'iso-plots'}>
              {kind === 'tower'
                ? FLOORS.map((f, i) => (
                    <div key={f.label} data-level={i} className={`iso-floor ${floor === i ? 'is-selected' : ''}`} onClick={() => setFloor(i)}>
                      {f.units.map((x) => tile(x, `A-${x.no.padStart(4, '0')}`, i))}
                    </div>
                  ))
                : PLOTS.map((x) => tile(x, `P-${x.no}`))}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            {kind === 'tower' ? (
              <div className="inline-flex gap-1.5" role="group" aria-label="Floor">
                {[2, 1, 0].map((i) => (
                  <button key={i} type="button" aria-pressed={floor === i} onClick={() => setFloor(i)}
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-colors ${floor === i ? 'bg-brand text-brand-foreground shadow-sm' : 'bg-surface-muted text-muted hover:text-foreground'}`}>{FLOORS[i].label}</button>
                ))}
              </div>
            ) : <span className="text-[11px] font-medium text-brand">Sector A · tap any plot</span>}
            <div className="flex gap-2.5 text-[10px] text-muted">
              {(Object.keys(LABEL) as Status[]).map((s) => <span key={s} className="inline-flex items-center gap-1"><span className={`size-2 rounded-full ${TILE[s]}`} />{LABEL[s]}</span>)}
            </div>
          </div>
        </div>

        <div className="ceramic mt-4 p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-brand">Lead sync &amp; site visits</p>
              <p className="mt-0.5 text-[13px] text-muted"><span className="text-[15px] font-extrabold text-foreground">94%</span> contacted within 5 min</p>
            </div>
            <span className="whitespace-nowrap rounded-full border border-success/20 bg-success-bg px-2 py-0.5 text-[11px] font-semibold text-success">2 min 28 s</span>
          </div>
          <div className="mt-2.5 h-1.5 rounded-full" style={{ background: 'linear-gradient(90deg, var(--chart-2), var(--chart-3) 80%, var(--chart-5))' }} />
          <ol className="mt-3 space-y-1.5">
            {[...STEPS, { tag: 'Site visit booked', tone: 'bg-success-bg text-success border-success/20', time: '10:44:31', text: `${picked.id} · ${picked.detail}` }].map((s, i) => (
              <li key={s.tag} className={`flex items-center justify-between gap-3 rounded-xl border p-2 transition-all duration-200 ${i === 3 ? 'border-brand/25 bg-brand-light/50 shadow-sm' : 'border-default bg-surface/70'}`}>
                <span className="flex min-w-0 items-center gap-2">
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${s.tone}`}>{s.tag}</span>
                  <span className="truncate text-[12px] font-medium text-foreground">{s.text}</span>
                </span>
                <span className="shrink-0 font-mono text-[10px] text-subtle">{s.time}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-subtle">Synced sources</span>
          <ul className="flex flex-wrap gap-1.5">{SOURCES.map((s) => <li key={s} className="rounded-full border border-default bg-surface px-2.5 py-1 text-[11px] font-medium text-foreground">{s}</li>)}</ul>
        </div>
        <p className="mt-3 text-[10px] text-subtle">Illustration · names and units are fictional.</p>
      </aside>
    </div>
  )
}
