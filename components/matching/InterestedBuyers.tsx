'use client'
// components/matching/InterestedBuyers.tsx — open leads this unit suits (in the inventory unit drawer).
// The server decides which leads the viewer may see (a sales executive: only their own).
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Users } from 'lucide-react'
import { Badge } from '@/components/ui'

interface Buyer { leadId: string; name: string; status: string; assigneeName: string | null; match: { score: number; reasons: string[]; gaps: string[] } }

export function InterestedBuyers({ unitId, orgId, available }: { unitId: string; orgId: string; available: boolean }) {
  const { orgSlug } = useParams<{ orgSlug: string }>()
  const [buyers, setBuyers] = useState<Buyer[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!available) return
    let live = true
    fetch(`/api/inventory/${unitId}/buyers?orgId=${orgId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((b) => { if (live) setBuyers(b.buyers) })
      .catch(() => { if (live) setFailed(true) })
    return () => { live = false }
  }, [unitId, orgId, available])

  return (
    <div className="space-y-2">
      <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
        <Users aria-hidden className="size-3.5 text-brand" /> Interested buyers
      </h3>
      {!available ? (
        <p className="text-[12px] text-muted">Only available units are matched with buyers.</p>
      ) : failed ? (
        <p className="text-[12px] text-muted">Could not load matching buyers.</p>
      ) : buyers === null ? (
        <p className="text-[12px] text-muted">Finding buyers…</p>
      ) : buyers.length === 0 ? (
        <p className="text-[12px] text-muted">No open lead fits this unit yet.</p>
      ) : (
        <ul className="divide-y divide-[var(--border)] rounded-md border border-default">
          {buyers.map((b) => (
            <li key={b.leadId} className="px-3 py-2">
              <div className="flex items-baseline justify-between gap-2">
                <Link href={`/${orgSlug}/leads/${b.leadId}`} className="text-[13px] font-medium text-foreground hover:text-brand">{b.name}</Link>
                <Badge tone={b.match.score >= 75 ? 'success' : b.match.score >= 50 ? 'warning' : 'neutral'}>{b.match.score}%</Badge>
              </div>
              <p className="text-[11px] text-muted">
                {b.assigneeName ?? 'Unassigned'}
                {b.match.reasons.length > 0 && <> · <span className="text-success">{b.match.reasons.join(', ')}</span></>}
                {b.match.gaps.length > 0 && <> · <span className="text-warning">{b.match.gaps.join(', ')}</span></>}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
