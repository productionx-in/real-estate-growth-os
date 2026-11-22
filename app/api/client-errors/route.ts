// app/api/client-errors/route.ts — the error page reports errors that happened in the browser, so they appear in the
// server logs under the reference the person sees ("C-XXXXXX"). Sanitised (lib/errors/client.ts), rate-limited per
// address, nothing stored in the database, nothing returned.
import { NextResponse, type NextRequest } from 'next/server'
import { sanitiseReport } from '@/lib/errors/client'
import { checkDistributedRateLimit } from '@/lib/integrations/webhooks/rate-limiter'

export async function POST(request: NextRequest) {
  const ip = (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown'
  const limit = await checkDistributedRateLimit({ key: `client-errors:${ip}`, limit: 20, windowMs: 60_000 })
  if (!limit.allowed) return new NextResponse(null, { status: 204 })
  const raw = await request.text().catch(() => '')
  if (raw.length > 4000) return new NextResponse(null, { status: 204 })
  let body: Record<string, unknown> = {}
  try { body = JSON.parse(raw) } catch { return new NextResponse(null, { status: 204 }) }
  console.error('[client-error]', JSON.stringify(sanitiseReport(body)))
  return new NextResponse(null, { status: 204 })
}
