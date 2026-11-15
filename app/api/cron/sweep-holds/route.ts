// app/api/cron/sweep-holds/route.ts
// Production-Hardened Scheduled Hold Expiration Cron Handler
import { NextResponse, type NextRequest } from 'next/server'
import { releaseExpiredBlockings } from '@/lib/dal/sales'

export const dynamic = 'force-dynamic'

export function verifyCronAuthorization(request: NextRequest): { authorized: boolean; status: number; error?: string } {
  const isProduction = process.env.NODE_ENV === 'production'
  const cronSecret = process.env.CRON_SECRET

  // Production requirement: CRON_SECRET is strictly mandatory
  if (isProduction && !cronSecret) {
    return {
      authorized: false,
      status: 500,
      error: 'CRON_SECRET is not configured in production environment',
    }
  }

  // When CRON_SECRET is configured, require exact Bearer token
  if (cronSecret) {
    const authHeader = request.headers.get('authorization')
    if (authHeader && authHeader === `Bearer ${cronSecret}`) {
      return { authorized: true, status: 200 }
    }
    return {
      authorized: false,
      status: 401,
      error: 'Invalid or missing cron authorization header',
    }
  }

  // Non-production (development / test): only permit explicit test bypass header
  if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
    const testHeader = request.headers.get('x-test-cron')
    if (testHeader === 'true') {
      return { authorized: true, status: 200 }
    }
    return {
      authorized: false,
      status: 401,
      error: 'Unauthenticated: Local cron sweep requires x-test-cron header or CRON_SECRET',
    }
  }

  return {
    authorized: false,
    status: 401,
    error: 'Unauthorized cron request',
  }
}

async function handleSweep(request: NextRequest) {
  const auth = verifyCronAuthorization(request)
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const { searchParams } = new URL(request.url)
    const orgId = searchParams.get('orgId') || undefined

    const releasedCount = await releaseExpiredBlockings(orgId)

    return NextResponse.json({
      success: true,
      releasedCount,
      timestamp: new Date().toISOString(),
      message: `Successfully swept and released ${releasedCount} expired hold(s)`,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { success: false, error: msg, timestamp: new Date().toISOString() },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  return handleSweep(request)
}

export async function POST(request: NextRequest) {
  return handleSweep(request)
}
