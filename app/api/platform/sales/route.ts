// app/api/platform/sales/route.ts — Internal Sales: RE’s own prospects (never customer CRM data).
// GET list (executives: own + unassigned; managers/Platform Owner/auditors: all) · POST create · POST import website requests.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { staffActor } from '@/lib/platform/route-auth'
import { createProspect, importWebsiteRequests, listProspects } from '@/lib/platform/portal'

const Create = z.object({
  action: z.literal('create'), companyName: z.string().trim().min(2).max(200), orgType: z.enum(['developer', 'channel_partner']),
  city: z.string().trim().max(100).nullish(), teamSize: z.number().int().positive().max(100000).nullish(),
  source: z.enum(['website', 'referral', 'event', 'outbound', 'partner', 'other']), campaign: z.string().trim().max(200).nullish(),
  contactName: z.string().trim().max(200).nullish(), contactEmail: z.string().trim().email().nullish().or(z.literal('').transform(() => null)),
  contactPhone: z.string().trim().max(30).nullish(), notes: z.string().trim().max(4000).nullish(), nextFollowUpAt: z.string().datetime().nullish(),
})

export async function GET(request: NextRequest) {
  const a = await staffActor('salesRead')
  if (!a.success) return a.response
  const r = await listProspects(a.db, a.actor, { stage: request.nextUrl.searchParams.get('stage') ?? undefined, mine: request.nextUrl.searchParams.get('mine') === '1' })
  return r.success ? NextResponse.json(r.data) : NextResponse.json({ error: r.error }, { status: r.status })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  if (body?.action === 'import_website') {
    const a = await staffActor('salesAll')
    if (!a.success) return a.response
    const r = await importWebsiteRequests(a.db, a.actor, process.env.REGROW_DEMO_FORM_CONNECTION_ID?.trim() || null)
    return r.success ? NextResponse.json(r.data) : NextResponse.json({ error: r.error }, { status: r.status })
  }
  const parsed = Create.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Check the details and try again.' }, { status: 400 })
  const a = await staffActor('salesWrite')
  if (!a.success) return a.response
  const { action: _a, ...input } = parsed.data
  void _a
  const r = await createProspect(a.db, a.actor, input)
  return r.success ? NextResponse.json(r.data) : NextResponse.json({ error: r.error }, { status: r.status })
}
