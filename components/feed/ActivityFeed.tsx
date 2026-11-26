'use client'
// components/feed/ActivityFeed.tsx — the activity feed list. Refreshes itself every 30 seconds while the page is open
// and visible (new items slide in), and lets people react where the workspace allows. Reactions are optimistic and are
// put right from the server's answer.
import { useEffect, useState } from 'react'
import { Activity, Award, Crown, Flag, Flame, Gift, Handshake, Heart, ThumbsUp, Trophy } from 'lucide-react'
import { EmptyState } from '@/components/ui'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils/cn'
import { REACTIONS, type FeedItem, type FeedKind, type ReactionKind } from '@/lib/feed/items'

const ICON: Record<FeedKind, { icon: React.ComponentType<{ className?: string }>; tone: string }> = {
  deal: { icon: Handshake, tone: 'bg-success-bg text-success' },
  target: { icon: Flag, tone: 'bg-brand-light text-brand' },
  unlock: { icon: Award, tone: 'bg-warning-bg text-warning' },
  trophy: { icon: Trophy, tone: 'bg-warning-bg text-warning' },
  reward: { icon: Gift, tone: 'bg-brand-light text-brand' },
  lead: { icon: Crown, tone: 'bg-warning-bg text-warning' },
}
const RX_ICON: Record<ReactionKind, React.ComponentType<{ className?: string }>> = { clap: ThumbsUp, fire: Flame, heart: Heart, trophy: Trophy }
const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(new Date(iso))
}
const inr = (n: number) => (n >= 1e7 ? `₹${+(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${+(n / 1e5).toFixed(1)} L` : `₹${Math.round(n).toLocaleString('en-IN')}`)

export function ActivityFeed({ orgId, initial, reactions }: { orgId: string; initial: FeedItem[]; reactions: boolean }) {
  const [items, setItems] = useState(initial)
  const [fresh, setFresh] = useState<Set<string>>(new Set())

  useEffect(() => {
    let live = true
    const tick = () => {
      if (document.visibilityState !== 'visible') return
      fetch(`/api/feed?orgId=${orgId}`).then((r) => (r.ok ? r.json() : null)).then((out: { items: FeedItem[] } | null) => {
        if (!live || !out) return
        setItems((prev) => {
          const known = new Set(prev.map((i) => i.key))
          setFresh(new Set(out.items.filter((i) => !known.has(i.key)).map((i) => i.key)))
          return out.items
        })
      }).catch(() => {})
    }
    const t = setInterval(tick, 30_000)
    return () => { live = false; clearInterval(t) }
  }, [orgId])

  async function react(item: FeedItem, kind: ReactionKind) {
    const had = item.mine.includes(kind)
    const patch = (i: FeedItem, on: boolean): FeedItem => ({ ...i, mine: on ? [...i.mine, kind] : i.mine.filter((k) => k !== kind), reactions: { ...i.reactions, [kind]: Math.max(0, (i.reactions[kind] ?? 0) + (on ? 1 : -1)) } })
    setItems((p) => p.map((i) => (i.key === item.key ? patch(i, !had) : i)))
    try {
      const res = await fetch('/api/feed/react', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orgId, itemKey: item.key, kind }) })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Could not react.')
    } catch (e) {
      setItems((p) => p.map((i) => (i.key === item.key ? patch(i, had) : i)))
      toast.error(e instanceof Error ? e.message : 'Could not react.')
    }
  }

  if (items.length === 0) {
    return <div className="surface-raised rounded-2xl border border-default bg-surface"><EmptyState icon={Activity} title="Nothing yet this month" description="Bookings, targets reached, achievements and trophies appear here as they happen." /></div>
  }
  return (
    <ol className="stagger surface-raised divide-y divide-[var(--border)] rounded-2xl border border-default bg-surface" aria-live="polite">
      {items.map((i) => {
        const { icon: Icon, tone } = ICON[i.kind]
        return (
          <li key={i.key} className={cn('flex gap-3 px-4 py-3.5', fresh.has(i.key) && 'anim-side')}>
            <span className={cn('grid size-9 shrink-0 place-items-center rounded-full', tone)}><Icon className="size-4" aria-hidden /></span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] text-foreground"><span className="font-semibold">{i.who}</span> {i.text}{i.detail ? <span className="text-muted"> · {i.detail}</span> : null}{i.amount ? <span className="font-medium"> · {inr(i.amount)}</span> : null}</p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-subtle">{ago(i.at)}</span>
                {reactions && (Object.keys(REACTIONS) as ReactionKind[]).map((k) => {
                  const n = i.reactions[k] ?? 0, mine = i.mine.includes(k), R = RX_ICON[k]
                  return (
                    <button key={k} type="button" onClick={() => void react(i, k)} aria-pressed={mine} aria-label={`${REACTIONS[k]}${n ? ` (${n})` : ''}`}
                      className={cn('inline-flex min-h-7 items-center gap-1 rounded-full border px-2 text-[12px] transition-transform active:scale-95', mine ? 'border-brand bg-brand-light text-brand' : n ? 'border-default text-muted' : 'border-transparent text-subtle opacity-60 hover:opacity-100')}>
                      <R className="size-3.5" aria-hidden />{n > 0 && <span className="tabular-nums">{n}</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
