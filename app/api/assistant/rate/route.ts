// app/api/assistant/rate/route.ts — a thumbs up / down on one of Rio's answers: the quality label used to pick
// training examples and to compare models. Only the conversation that received the answer can rate it.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/server'
import { checkDistributedRateLimit } from '@/lib/integrations/webhooks/rate-limiter'
import { rateAnswer } from '@/lib/support/memory'

const Body = z.object({ conversationId: z.string().uuid(), messageId: z.string().uuid(), rating: z.union([z.literal(1), z.literal(-1)]) })

export async function POST(request: NextRequest) {
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!(await checkDistributedRateLimit({ key: `rio-rate:ip:${ip}`, limit: 60, windowMs: 10 * 60_000 })).allowed) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  const ok = await rateAnswer(createServiceClient() as unknown as Parameters<typeof rateAnswer>[0], parsed.data.conversationId, parsed.data.messageId, parsed.data.rating)
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'not_found' }, { status: 404 })
}
