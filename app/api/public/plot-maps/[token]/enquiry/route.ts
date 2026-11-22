// app/api/public/plot-maps/[token]/enquiry/route.ts — a buyer's enquiry or site-visit request from the public plot
// map. Public and unauthenticated: the organisation and project come only from the shared map found by its token on
// the server; the body carries the buyer's details, the plot number and an optional preferred visit date (strict
// schema). Goes through the normal lead intake (processInboundLead: dedupe, routing, timing); a site-visit request is a
// lead with the preferred date in its notes for the team to schedule. Rate-limited per network and per map; a filled
// honeypot is accepted silently and dropped; only an AVAILABLE plot on the map can be asked about.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { openSharedLayout } from '@/lib/dal/plot-layouts'
import { processInboundLead } from '@/lib/integrations/inbound'
import { checkDistributedRateLimit } from '@/lib/integrations/webhooks/rate-limiter'

const Body = z.object({
  kind: z.enum(['enquiry', 'site_visit']),
  plot: z.string().trim().min(1).max(60),
  name: z.string().trim().min(2).max(100),
  phone: z.string().trim().min(6).max(20),
  email: z.union([z.string().trim().email().max(255), z.literal('')]).optional(),
  message: z.string().trim().max(500).optional(),
  visitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  website: z.string().max(200).optional(), // honeypot
}).strict()

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown-client'
  const byIp = await checkDistributedRateLimit({ key: `plotmap:enquiry:ip:${ip}`, limit: 10, windowMs: 300_000 })
  if (!byIp.allowed) return NextResponse.json({ error: 'Too many requests from this network. Please try again later.' }, { status: 429 })
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Please enter your name and a valid phone number.' }, { status: 400 })
  const b = parsed.data
  if (b.website) return NextResponse.json({ success: true }) // bot
  if (b.kind === 'site_visit') {
    const today = new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10)
    if (!b.visitDate || b.visitDate < today) return NextResponse.json({ error: 'Choose a visit date from today onwards.' }, { status: 400 })
  }

  const map = await openSharedLayout(token)
  if (!map) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const plot = Object.values(map.plots).find((p) => p.unitNumber === b.plot)
  if (!plot || plot.status !== 'available') return NextResponse.json({ error: 'This plot is no longer available. Please choose another.' }, { status: 409 })
  const perMap = await checkDistributedRateLimit({ key: `plotmap:enquiry:map:${map.id}`, limit: 60, windowMs: 60_000 })
  if (!perMap.allowed) return NextResponse.json({ error: 'Please try again in a minute.' }, { status: 429 })

  const what = b.kind === 'site_visit' ? `Site visit requested for ${b.visitDate} (plot ${plot.unitNumber})` : `Enquiry about plot ${plot.unitNumber}`
  const result = await processInboundLead(map.orgId, {
    provider: 'website_webhook',
    name: b.name, phone: b.phone, email: b.email || null,
    campaignName: `Plot map: ${map.name}`.slice(0, 200),
    sourceUrl: `/m/${token.slice(0, 6)}…`,
    notes: b.message ? `${what} from the public plot map: ${b.message}` : `${what} from the public plot map.`,
    sourceMetadata: { channel: 'plot_map', layout_id: map.id, plot: plot.unitNumber, request: b.kind, ...(b.visitDate ? { preferred_visit_date: b.visitDate } : {}) },
  }, { projectId: map.projectId })
  if (!result.success) return NextResponse.json({ error: 'We could not send your request. Please try again.' }, { status: 500 })
  return NextResponse.json({ success: true })
}
