'use client'
// components/today/TodayList.tsx
// One section of the "Today" screen: lead cards with a live countdown and one-tap Call (logged as first action).
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronRight, Phone } from 'lucide-react'
import type { MyDayLead } from '@/lib/dal/follow-ups'

const SOURCE: Record<string, string> = {
  website: 'Website', meta_ads: 'Meta', google_ads: 'Google', '99acres': '99acres', housing: 'Housing.com',
  magicbricks: 'MagicBricks', whatsapp: 'WhatsApp', referral: 'Referral', walk_in: 'Walk-in', csv_import: 'Import', other: 'Other',
}

function useNow() {
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    const f = setTimeout(() => setNow(Date.now()), 0)
    const t = setInterval(() => setNow(Date.now()), 15_000)
    return () => { clearTimeout(f); clearInterval(t) }
  }, [])
  return now
}

function ago(ms: number) {
  const m = Math.round(ms / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} h ${m % 60} min`
  return `${Math.floor(h / 24)} d`
}

export function TodayList({ kind, leads, orgSlug, showAssignee }: {
  kind: 'waiting' | 'overdue' | 'today'
  leads: MyDayLead[]
  orgSlug: string
  showAssignee: boolean
}) {
  const now = useNow()
  const router = useRouter()

  function call(l: MyDayLead) {
    fetch(`/api/leads/${l.id}/contact`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel: 'call' }), keepalive: true,
    }).then(() => router.refresh()).catch(() => undefined)
    window.location.assign(`tel:${l.phone}`)
  }

  return (
    <ul className="divide-y divide-[var(--border)]">
      {leads.map((l) => {
        let when = ''
        let urgent = false
        if (now !== null) {
          if (kind === 'waiting') {
            const due = l.sla_due_at ? new Date(l.sla_due_at).getTime() : null
            if (due && due > now) { when = `Call within ${ago(due - now)}`; urgent = due - now < 120_000 }
            else { when = `Waiting ${ago(now - new Date(l.created_at).getTime())}`; urgent = true }
          } else if (l.next_follow_up_at) {
            const t = new Date(l.next_follow_up_at).getTime()
            when = kind === 'overdue' ? `Overdue by ${ago(now - t)}` : new Date(t).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
            urgent = kind === 'overdue'
          }
        }
        return (
          <li key={l.id} className="flex items-center gap-3 py-3">
            <button type="button" onClick={() => call(l)} aria-label={`Call ${l.name}`}
              className="w-11 h-11 flex-shrink-0 rounded-full bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white flex items-center justify-center shadow-sm">
              <Phone className="w-5 h-5" />
            </button>
            <Link href={`/${orgSlug}/leads/${l.id}`} className="flex-1 min-w-0 flex items-center gap-2 group">
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-semibold truncate group-hover:text-[var(--brand)]">{l.name}</p>
                <p className="text-[12px] text-[var(--foreground-muted)] truncate">
                  {[l.project?.name, SOURCE[l.source] ?? l.source, showAssignee ? l.assignee?.full_name : null].filter(Boolean).join(' · ')}
                </p>
                {when && <p className={`text-[12px] font-medium ${urgent ? 'text-danger' : 'text-[var(--foreground-muted)]'}`}>{when}</p>}
              </div>
              <ChevronRight className="w-4 h-4 text-[var(--foreground-subtle)] flex-shrink-0" />
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
