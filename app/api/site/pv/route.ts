// app/api/site/pv/route.ts — page-view beacon for the public website (components/marketing/SiteBeacon.tsx).
// Public and unauthenticated by design: validated (lib/site/pageview.ts), bots ignored, rate-limited per address,
// stored without the address. Always answers 204 so the page never waits on it or learns anything from it.
import { NextResponse, type NextRequest } from 'next/server'
import { parsePageview, isBot } from '@/lib/site/pageview'
import { createServiceClient } from '@/lib/supabase/server'
import { checkDistributedRateLimit } from '@/lib/integrations/webhooks/rate-limiter'

const done = () => new NextResponse(null, { status: 204 })

export async function POST(request: NextRequest) {
  const ua = request.headers.get('user-agent')
  if (isBot(ua) || request.headers.get('sec-gpc') === '1' || request.headers.get('dnt') === '1') return done()
  const ip = (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown'
  const limit = await checkDistributedRateLimit({ key: `site-pv:${ip}`, limit: 60, windowMs: 60_000 })
  if (!limit.allowed) return done()
  const raw = await request.text().catch(() => '')
  if (!raw || raw.length > 2000) return done()
  let body: unknown
  try { body = JSON.parse(raw) } catch { return done() }
  const pv = parsePageview(body, { userAgent: ua, ownHost: request.nextUrl.hostname })
  if (!pv) return done()
  const country = request.headers.get('x-vercel-ip-country')
  const db = createServiceClient() as unknown as { from: (t: 'site_pageviews') => { insert: (row: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }> } }
  const { error } = await db.from('site_pageviews').insert({
    visit_id: pv.visitId, seq: pv.seq, path: pv.path, prev_path: pv.prevPath, referrer_host: pv.referrerHost,
    utm_source: pv.utmSource, utm_medium: pv.utmMedium, utm_campaign: pv.utmCampaign,
    country: country && /^[A-Z]{2}$/.test(country) ? country : null, device: pv.device,
  })
  if (error) console.error('[site-pv] insert failed:', error.message)
  return done()
}
