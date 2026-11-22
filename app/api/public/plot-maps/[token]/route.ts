// app/api/public/plot-maps/[token]/route.ts — the public plot map as data (for the buyer page's live refresh and for
// websites that embed it). The 256-bit share link is the key; an unknown, unshared, unpublished or lapsed map is
// "not found". The response is built from an explicit allow-list and validated before it is sent: plot number,
// public status (available / reserved / sold), area, dimensions, facing, corner, road width, and price only when the
// developer chose to show prices. Never unit ids, buyers, bookings, holds, leads, documents or storage paths.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { openSharedLayout } from '@/lib/dal/plot-layouts'
import { checkDistributedRateLimit } from '@/lib/integrations/webhooks/rate-limiter'

const PublicPlot = z.object({
  number: z.string().max(60),
  status: z.enum(['available', 'reserved', 'sold']),
  area: z.number().nullable(),
  areaUnit: z.string().max(20).nullable(),
  dimensions: z.string().max(60).nullable(),
  facing: z.string().max(30).nullable(),
  corner: z.boolean(),
  roadWidthFt: z.number().nullable(),
  price: z.number().nullable(),
}).strict()
const PublicMap = z.object({
  project: z.string().max(200),
  developer: z.string().max(200),
  map: z.string().max(80),
  updatedAt: z.string(),
  plots: z.array(PublicPlot).max(5000),
}).strict()

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown-client'
  const limit = await checkDistributedRateLimit({ key: `plotmap:public:${ip}`, limit: 120, windowMs: 60_000 })
  if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  const map = await openSharedLayout(token)
  if (!map) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const body = PublicMap.parse({
    project: map.projectName, developer: map.orgName, map: map.name, updatedAt: new Date().toISOString(),
    plots: Object.values(map.plots).map((p) => ({
      number: p.unitNumber, status: p.status, area: p.area == null ? null : Number(p.area), areaUnit: p.areaUnit, dimensions: p.dimensions,
      facing: p.facing, corner: p.corner, roadWidthFt: p.roadWidthFt == null ? null : Number(p.roadWidthFt),
      price: map.showPrices && p.price != null ? Number(p.price) : null,
    })),
  })
  return NextResponse.json(body, { headers: { 'Cache-Control': 'public, max-age=15', 'Access-Control-Allow-Origin': '*' } })
}
