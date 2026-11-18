// components/billing/BillingBanner.tsx — one line under the header for owners and admins when the trial is
// ending, a payment is due or the plan has lapsed. Nothing for anyone else, and nothing when all is well.
import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'
import { billingNotice, type SubscriptionStatus } from '@/lib/billing/plans'
import { cn } from '@/lib/utils/cn'

export async function BillingBanner({ orgId, orgSlug }: { orgId: string; orgSlug: string }) {
  const { data: sub } = await createServiceClient().from('org_subscriptions').select('status, current_period_end').eq('org_id', orgId).maybeSingle()
  const notice = sub ? billingNotice(sub.status as SubscriptionStatus, sub.current_period_end) : null
  if (!notice) return null
  return (
    <div role={notice.tone === 'danger' ? 'alert' : 'status'} className={cn(
      'flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b px-4 py-2 text-center text-[13px]',
      notice.tone === 'danger' ? 'border-danger/30 bg-danger-bg text-danger' : notice.tone === 'warning' ? 'border-warning/30 bg-warning-bg text-warning' : 'border-default bg-info-bg text-info'
    )}>
      <span>{notice.text}</span>
      <Link href={`/${orgSlug}/billing`} className="font-semibold underline underline-offset-2">Plan &amp; billing</Link>
    </div>
  )
}
