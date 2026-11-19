// lib/jobs/payments.ts — scheduled payment maintenance (enqueued by pg_cron, migration 20260060):
//   payments.poll_pending  every 10 min: open checkouts and submitted refunds checked with their provider (closed tabs,
//                          lost webhooks); failed webhook events re-processed (idempotent, up to 5 attempts)
//   payments.health_check  every 5 min: an authenticated call to each operable provider, then payment alerts
//                          (lib/payments/monitoring.ts) raised, resolved and emailed to the Platform Owner and finance
//   payments.reconcile     daily 03:00 IST: provider settlements matched to recorded payments (last 3 days)
//   payments.mandate_cycle hourly: renewal invoices, pre-debit notices and debits on active mandates (no-op while
//                          recurring payments are disabled)
import { envResolver, operableAdapters, type Db } from '@/lib/payments/registry'
import { checkHealth, pollOpenAttempts, pollSubmittedRefunds, reconcile, reprocessFailedWebhooks } from '@/lib/payments/service'
import { runAlerts } from '@/lib/payments/monitoring'
import { runMandateCycle } from '@/lib/payments/mandates'
import type { JobHandler } from './handlers'

export const paymentsPollPending: JobHandler = async (_job, db) => {
  const resolver = envResolver()
  await pollOpenAttempts(db as Db, resolver)
  await pollSubmittedRefunds(db as Db, resolver)
  await reprocessFailedWebhooks(db as Db, resolver)
}
export const paymentsHealthCheck: JobHandler = async (_job, db) => {
  await checkHealth(db as Db, envResolver())
  await runAlerts(db as Db)
}
export const paymentsReconcile: JobHandler = async (_job, db) => {
  const to = new Date(), from = new Date(to.getTime() - 3 * 86_400_000)
  const failures: string[] = []
  for (const adapter of await operableAdapters(db as Db, envResolver())) {
    const r = await reconcile(db as Db, adapter, from, to)
    if (!r.success) failures.push(`${adapter.code}: ${r.error}`)
  }
  if (failures.length) throw new Error(failures.join('; '))
}

export const paymentsMandateCycle: JobHandler = async (_job, db) => {
  const r = await runMandateCycle(db as Db, envResolver())
  if (r.errors.length) console.error('[payments] mandate cycle:', r.errors.join('; '))
}
