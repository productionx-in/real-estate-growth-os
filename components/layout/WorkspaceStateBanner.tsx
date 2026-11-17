// components/layout/WorkspaceStateBanner.tsx
// Tells everyone in a workspace when it is not in normal use. The restriction itself is enforced on the
// server (suspension turns every membership read-only); this banner only explains it.
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
    body: 'This workspace has been suspended. You can view leads and reports, but changes are paused. New enquiries are still being captured. Your administrator can contact REGrow support to restore full access.',
    tone: 'danger',
  },
}

export function WorkspaceStateBanner({ state }: { state: OrgLifecycleState }) {
  const copy = COPY[state]
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
      </p>
    </div>
  )
}
