// app/api/microsites/[slug]/enquiry/route.ts — a buyer's enquiry from a project's public showroom (/p/<slug>).
// Public, unauthenticated. The organisation and project come only from the published microsite found by its slug on
// the server; the request body carries the buyer's details and nothing else (strict schema). Rate-limited per
// network and per showroom; a filled honeypot field is accepted silently and dropped.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { getMicrositeBySlug } from '@/lib/automation/microsite'
import { processInboundLead } from '@/lib/integrations/inbound'
import { checkDistributedRateLimit } from '@/lib/integrations/webhooks/rate-limiter'

type Ctx = { params: Promise<{ slug: string }> }
const SLUG = /^[a-z0-9-]{1,80}$/
const Body = z.object({
  name: z.string().trim().min(2).max(100),
  phone: z.string().trim().min(6).max(20),
  email: z.union([z.string().trim().email().max(255), z.literal('')]).optional(),
  message: z.string().trim().max(1000).optional(),
  website: z.string().max(200).optional(), // honeypot: real people never see or fill it
}).strict()

export async function POST(request: NextRequest, { params }: Ctx) {
  const { slug } = await params
  if (!SLUG.test(slug)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown-client'
  const byIp = await checkDistributedRateLimit({ key: `showroom:ip:${ip}`, limit: 10, windowMs: 300_000 })
  if (!byIp.allowed) return NextResponse.json({ error: 'Too many enquiries from this network. Please try again later.' }, { status: 429 })

  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Please enter your name and a valid phone number.' }, { status: 400 })
  if (parsed.data.website) return NextResponse.json({ success: true }) // bot

  const microsite = await getMicrositeBySlug(slug) // published only
  if (!microsite) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const byShowroom = await checkDistributedRateLimit({ key: `showroom:${microsite.id}`, limit: 60, windowMs: 60_000 })
  if (!byShowroom.allowed) return NextResponse.json({ error: 'Please try again in a minute.' }, { status: 429 })

  const result = await processInboundLead(microsite.org_id, {
    provider: 'website_webhook',
    name: parsed.data.name,
    phone: parsed.data.phone,
    email: parsed.data.email || null,
    campaignName: `Showroom: ${microsite.title}`.slice(0, 200),
    sourceUrl: `/p/${slug}`,
    notes: parsed.data.message ? `Enquiry from the project showroom: ${parsed.data.message}` : 'Enquiry from the project showroom.',
    sourceMetadata: { channel: 'project_showroom', microsite_id: microsite.id },
  }, { projectId: microsite.project_id })

  if (!result.success) return NextResponse.json({ error: 'We could not send your enquiry. Please try again.' }, { status: 500 })
  return NextResponse.json({ success: true })
}
