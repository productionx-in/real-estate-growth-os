// app/api/cron/sweep-holds/route.ts
import { NextResponse, type NextRequest } from 'next/server'
import { releaseExpiredBlockings } from '@/lib/dal/sales'

export const dynamic = 'force-dynamic'

function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    // If no secret configured in environment (e.g. dev/local test), check x-vercel-cron header or allow development
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
      return true
    }
    const vercelCronHeader = request.headers.get('x-vercel-cron')
    return Boolean(vercelCronHeader)
  }

  const authHeader = request.headers.get('authorization')
  if (authHeader && authHeader === `Bearer ${cronSecret}`) {
    return true
  }

  // Also check query param secret fallback if provided
  const { searchParams } = new URL(request.url)
  if (searchParams.get('key') === cronSecret) {
    return true
  }

  return false
}

async function handleSweep(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const orgId = searchParams.get('orgId') || undefined

    const releasedCount = await releaseExpiredBlockings(orgId)

    return NextResponse.json({
      success: true,
      releasedCount,
      timestamp: new Date().toISOString(),
      message: `Successfully swept and released ${releasedCount} expired hold(s)`
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
