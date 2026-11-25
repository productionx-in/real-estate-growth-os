// app/api/unsubscribe/route.ts — the button on /u/<token>: adds the address to the workspace's marketing opt-out list
// (lib/dal/campaigns.ts) and returns to the page. Public; the token is the key. Rate-limited per address.
import { NextResponse, type NextRequest } from 'next/server'
import { unsubscribe } from '@/lib/dal/campaigns'
import { checkDistributedRateLimit } from '@/lib/integrations/webhooks/rate-limiter'

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null)
  const token = String(form?.get('token') ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(token)) return NextResponse.json({ error: 'Invalid link.' }, { status: 400 })
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const limit = await checkDistributedRateLimit({ key: `unsubscribe:${ip}`, limit: 30, windowMs: 60_000 })
  if (!limit.allowed) return NextResponse.json({ error: 'Too many requests. Wait a minute.' }, { status: 429 })
  const ok = await unsubscribe(token)
  return NextResponse.redirect(new URL(`/u/${token}${ok ? '' : '?error=1'}`, request.url), 303)
}
