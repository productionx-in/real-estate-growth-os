// app/api/public/plot-maps/[token]/image/route.ts — the published map's page image, for buyers. Served through the
// share link (never a storage URL): only the PUBLISHED version's rendered page is ever returned — not the original
// document, not drafts. Dies with the link (unshared, unpublished, add-on lapsed).
import { NextResponse, type NextRequest } from 'next/server'
import { openSharedLayout } from '@/lib/dal/plot-layouts'
import { readVersionImage } from '@/lib/dal/plot-map-publishing'
import { checkDistributedRateLimit } from '@/lib/integrations/webhooks/rate-limiter'

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown-client'
  const limit = await checkDistributedRateLimit({ key: `plotmap:image:${ip}`, limit: 60, windowMs: 60_000 })
  if (!limit.allowed) return new NextResponse('Too many requests', { status: 429 })
  const map = await openSharedLayout(token)
  if (!map?.imagePath) return new NextResponse('Not found', { status: 404 })
  const blob = await readVersionImage(map.imagePath)
  if (!blob) return new NextResponse('Not found', { status: 404 })
  return new NextResponse(blob.stream(), {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff' },
  })
}
