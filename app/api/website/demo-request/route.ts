// app/api/website/demo-request/route.ts — demo, consultation and contact requests from REGrow's own website. Public,
// so it is rate-limited per address, ignores bots (hidden field, too-fast submissions) and accepts only plain fields.
// A request becomes a prospect in REGrow's internal Sales pipeline (staff console → Sales); nothing is written to any
// customer workspace, and no setting is needed for it to work.
import { NextResponse, type NextRequest } from 'next/server'
import crypto from 'node:crypto'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/server'
import { checkDistributedRateLimit } from '@/lib/integrations/webhooks/rate-limiter'

const Body = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(120),
  phone: z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/, 'Enter a valid mobile number'),
  email: z.string().trim().max(200).email('Enter a valid email address').or(z.literal('')).optional(),
  companyName: z.string().trim().max(200).optional(),
  companyType: z.enum(['developer', 'channel_partner']).default('developer'),
  teamSize: z.coerce.number().int().positive().max(100000).optional().catch(undefined),
  interest: z.string().trim().max(60).optional(),
  notes: z.string().trim().max(1000).optional(),
  website_url_hp: z.string().optional(),
  formLoadTime: z.number().optional(),
  submissionTime: z.number().optional(),
})

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown'
  const limited = await checkDistributedRateLimit({ key: `website-demo:ip:${ip}`, limit: 5, windowMs: 600_000 })
  if (!limited.allowed) return NextResponse.json({ error: 'Too many requests. Please try again in a few minutes.' }, { status: 429 })

  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Please check the form.' }, { status: 400 })
  const b = parsed.data
  // Bots: a filled hidden field, or a form submitted within 3 seconds of loading. Answer as if accepted.
  const tooFast = b.formLoadTime && b.submissionTime ? b.submissionTime - b.formLoadTime < 3000 : false
  if (b.website_url_hp || tooFast) return NextResponse.json({ success: true })

  const db = createServiceClient() as unknown as { from: (t: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any
  // The same mobile number within a day is one request, not several.
  const since = new Date(Date.now() - 86_400_000).toISOString()
  const { data: recent } = await db.from('internal_prospects').select('id').eq('contact_phone', b.phone).gte('created_at', since).limit(1)
  if (recent?.length) return NextResponse.json({ success: true })

  const { error } = await db.from('internal_prospects').insert({
    company_name: (b.companyName && b.companyName.length >= 2 ? b.companyName : b.name).slice(0, 200),
    org_type: b.companyType,
    team_size: b.teamSize ?? null,
    source: 'website',
    campaign: b.interest ?? null,
    stage: 'new',
    contact_name: b.name,
    contact_email: b.email || null,
    contact_phone: b.phone,
    notes: b.notes ?? null,
    source_ref: `website-form:${crypto.randomUUID()}`,
  })
  if (error) {
    console.error('website demo request failed:', error.message)
    return NextResponse.json({ error: 'We could not save your request. Please try again or email us.' }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
