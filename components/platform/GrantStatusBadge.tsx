import { Badge } from '@/components/ui'
import { grantState, type SupportGrant } from '@/lib/dal/support-access'

const TONE = { pending: 'warning', approved: 'success', denied: 'neutral', revoked: 'neutral', cancelled: 'neutral', expired: 'neutral' } as const
const LABEL = { pending: 'Waiting for approval', approved: 'Active', denied: 'Denied', revoked: 'Revoked', cancelled: 'Withdrawn', expired: 'Expired' } as const

export function GrantStatusBadge({ grant }: { grant: Pick<SupportGrant, 'status' | 'expires_at' | 'emergency'> }) {
  const s = grantState(grant)
  return (
    <span className="inline-flex gap-1">
      <Badge tone={TONE[s]}>{LABEL[s]}</Badge>
      {grant.emergency && <Badge tone="danger">Emergency</Badge>}
    </span>
  )
}
