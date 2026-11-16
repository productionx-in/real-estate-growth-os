// app/api/jobs/run/route.ts
// Job worker endpoint. Invoked every minute by pg_cron → pg_net (public.regrow_invoke_job_worker) with
// `Authorization: Bearer <JOB_WORKER_SECRET>`; the same secret is stored in Supabase Vault as
// 'regrow_job_worker_secret'. Fails closed when the secret is not configured.
import { NextResponse, type NextRequest } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { createServiceClient } from '@/lib/supabase/server'
import { runDueJobs } from '@/lib/jobs/runner'
import '@/lib/notifications/register'

export const dynamic = 'force-dynamic'

function authorised(header: string | null, secret: string): boolean {
  if (!header?.startsWith('Bearer ')) return false
  const provided = Buffer.from(header.slice('Bearer '.length))
  const expected = Buffer.from(secret)
  return provided.length === expected.length && timingSafeEqual(provided, expected)
}

export async function POST(request: NextRequest) {
  const secret = process.env.JOB_WORKER_SECRET
  if (!secret || secret.length < 32) {
    return NextResponse.json({ error: 'Job worker is not configured' }, { status: 503 })
  }
  if (!authorised(request.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }
  try {
    const summary = await runDueJobs(createServiceClient())
    return NextResponse.json(summary)
  } catch (err) {
    console.error('[jobs] worker run failed:', err)
    return NextResponse.json({ error: 'Worker run failed' }, { status: 500 })
  }
}
