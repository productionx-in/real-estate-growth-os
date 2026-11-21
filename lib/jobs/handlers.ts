// lib/jobs/handlers.ts
// Job handlers keyed by scheduled_jobs.kind. A handler throws to request a retry (with backoff);
// returning normally marks the job done.
import type { SupabaseClient } from '@supabase/supabase-js'
import { getChannelAdapters, type NotificationRecord } from '@/lib/notifications/channels'
import { siteVisitNotify } from '@/lib/jobs/site-visit-notify'
import { customerLifecycleEmails } from '@/lib/jobs/customer-emails'
import { paymentsHealthCheck, paymentsMandateCycle, paymentsPollPending, paymentsReconcile } from '@/lib/jobs/payments'

export interface JobRow {
  id: string
  kind: string
  payload: Record<string, unknown>
  attempts: number
  org_id: string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, 'public', any>
export type JobHandler = (job: JobRow, db: Db) => Promise<void>

/** notification.dispatch: deliver one notification to every configured external channel, once per channel. */
async function dispatchNotification(job: JobRow, db: Db): Promise<void> {
  const notificationId = job.payload.notification_id
  if (typeof notificationId !== 'string') throw new Error('notification.dispatch: missing notification_id')

  const { data: notification, error } = await db
    .from('notifications')
    .select('id, org_id, recipient_profile_id, type, title, body, lead_id, data')
    .eq('id', notificationId)
    .maybeSingle()
  if (error) throw new Error(`notification.dispatch: load failed: ${error.message}`)
  if (!notification) return // notification (or its lead) was deleted: nothing to deliver

  const { data: done } = await db.from('notification_deliveries').select('channel').eq('notification_id', notificationId)
  const alreadyDelivered = new Set((done ?? []).map((d: { channel: string }) => d.channel))

  const failures: string[] = []
  for (const adapter of getChannelAdapters()) {
    if (alreadyDelivered.has(adapter.channel) || !adapter.isConfigured()) continue
    try {
      const outcome = await adapter.deliver(notification as NotificationRecord)
      const row = {
        notification_id: notificationId,
        channel: adapter.channel,
        status: outcome.status,
        provider_message_id: outcome.status === 'sent' ? outcome.providerMessageId ?? null : null,
        detail: outcome.status === 'skipped' ? outcome.detail : null,
      }
      const { error: insertError } = await db.from('notification_deliveries').upsert(row, { onConflict: 'notification_id,channel', ignoreDuplicates: true })
      if (insertError) throw new Error(insertError.message)
    } catch (err) {
      failures.push(`${adapter.channel}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  // Channels that succeeded are recorded and will not be re-sent; only failed channels are retried.
  if (failures.length > 0) throw new Error(`notification.dispatch: ${failures.join('; ')}`)
}

export const JOB_HANDLERS: Record<string, JobHandler> = {
  'notification.dispatch': dispatchNotification,
  'site_visit.notify': siteVisitNotify,
  'email.customer_lifecycle': customerLifecycleEmails,
  'payments.poll_pending': paymentsPollPending,
  'payments.health_check': paymentsHealthCheck,
  'payments.reconcile': paymentsReconcile,
  'payments.mandate_cycle': paymentsMandateCycle,
}
