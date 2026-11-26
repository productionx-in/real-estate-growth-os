// components/layout/WorkspaceStateBanner.tsx
// Tells everyone in a workspace when it is not in normal use. The restriction itself is enforced on the
// server (suspension turns every membership read-only); this banner only explains it.
import Link from 'next/link'
import { AlertTriangle, Clock } from 'lucide-react'
import type { OrgLifecycleState } from '@/types/database'

const COPY: Partial<Record<OrgLifecycleState, { title: string; body: string; tone: 'warning' | 'danger' }>> = {
  grace: {
    title: 'Renewal due',
    body: 'This workspace is in its grace period. Everything works as normal; your administrator should renew to avoid interruption.',
    tone: 'warning',
  },
  suspended: {
    title: 'Workspace is read-only',
    body: 'This workspace has been suspended. You can view leads and reports, but changes are paused. New enquiries are still being captured. Your administrator can contact RE support to restore full access.',
    tone: 'danger',
  },
}

const BILLING_HOLD = {
  title: 'Workspace is read-only',
  body: 'The free trial or paid plan has ended. Everything is kept and new enquiries are still captured; choose a plan to continue working.',
  tone: 'danger' as const,
}

export function WorkspaceStateBanner({ state, billingHold, canPay, orgSlug }: {
  state: OrgLifecycleState; billingHold?: boolean; canPay?: boolean; orgSlug?: string
}) {
  const copy = state === 'suspended' && billingHold
    ? { ...BILLING_HOLD, body: canPay ? BILLING_HOLD.body : 'The free trial or paid plan has ended. Everything is kept and new enquiries are still captured; your workspace owner can choose a plan to continue.' }
    : COPY[state]
  if (!copy) return null
  const Icon = copy.tone === 'danger' ? AlertTriangle : Clock
  const palette =
    copy.tone === 'danger'
      ? 'border-danger/30 bg-danger-bg text-danger'
      : 'border-warning/30 bg-warning-bg text-warning'
  return (
    <div role="status" className={`flex items-start gap-3 border-b px-4 py-2.5 text-sm ${palette}`}>
      <Icon aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
      <p>
        <span className="font-semibold">{copy.title}.</span> {copy.body}
        {billingHold && canPay && orgSlug && (
          <> <Link href={`/${orgSlug}/billing`} className="font-semibold underline">Choose a plan</Link></>
        )}
      </p>
    </div>
  )
}
