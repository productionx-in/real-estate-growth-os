// lib/jobs/runner.ts
// Claims due jobs (FOR UPDATE SKIP LOCKED in public.claim_jobs) and runs their handlers.
// Safe to run concurrently from several invocations: a job is only ever claimed by one worker at a time.
import type { SupabaseClient } from '@supabase/supabase-js'
import { JOB_HANDLERS, type JobHandler, type JobRow } from '@/lib/jobs/handlers'

export interface RunSummary {
  claimed: number
  done: number
  retried: number
  dead: number
}

export async function runDueJobs(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: SupabaseClient<any, 'public', any>,
  options: { limit?: number; handlers?: Record<string, JobHandler> } = {}
): Promise<RunSummary> {
  const handlers = options.handlers ?? JOB_HANDLERS
  const { data: jobs, error } = await db.rpc('claim_jobs', { p_limit: options.limit ?? 20, p_lock_seconds: 120 })
  if (error) throw new Error(`claim_jobs failed: ${error.message}`)

  const summary: RunSummary = { claimed: jobs?.length ?? 0, done: 0, retried: 0, dead: 0 }
  for (const job of (jobs ?? []) as JobRow[]) {
    const handler = handlers[job.kind]
    try {
      if (!handler) throw new Error(`no handler registered for job kind '${job.kind}'`)
      await handler(job, db)
      const { error: completeError } = await db.rpc('complete_job', { p_job_id: job.id })
      if (completeError) throw new Error(`complete_job failed: ${completeError.message}`)
      summary.done++
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const { data: outcome } = await db.rpc('fail_job', { p_job_id: job.id, p_error: message })
      if (outcome === 'dead') summary.dead++
      else summary.retried++
    }
  }
  return summary
}
