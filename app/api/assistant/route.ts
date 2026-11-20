// app/api/assistant/route.ts — Rio's AI answers. Public (the website uses it), so: validated input, short
// conversations, per-IP rate limit, and no customer data anywhere in the prompt. Returns 503 when AI is not
// configured; the bubble then answers from its offline guide.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import Anthropic from '@anthropic-ai/sdk'
import { aiConfigured, askRio } from '@/lib/support/ai'
import { checkDistributedRateLimit } from '@/lib/integrations/webhooks/rate-limiter'
import { createServiceClient } from '@/lib/supabase/server'
import { saveRioCallback } from '@/lib/support/prospect'

const Body = z.object({
  context: z.enum(['website', 'auth', 'workspace']),
  path: z.string().max(200).regex(/^\/[\w\-/]*$/),
  orgSlug: z.string().regex(/^[a-z0-9-]{1,80}$/).optional(),
  messages: z.array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().trim().min(1).max(800) })).min(1).max(12),
})

export async function POST(request: NextRequest) {
  if (!aiConfigured()) return NextResponse.json({ error: 'not_configured' }, { status: 503 })
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success || parsed.data.messages.at(-1)?.role !== 'user') return NextResponse.json({ error: 'bad_request' }, { status: 400 })

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const limit = await checkDistributedRateLimit({ key: `rio:ip:${ip}`, limit: 30, windowMs: 10 * 60_000 })
  if (!limit.allowed) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  try {
    const reply = await askRio({ context: parsed.data.context, path: parsed.data.path, orgSlug: parsed.data.orgSlug, history: parsed.data.messages })
    let callbackSaved = false
    if (reply.callback) {
      // A visitor asked to be called back: one per address per day, straight into the Sales pipeline.
      const cb = await checkDistributedRateLimit({ key: `rio-callback:ip:${ip}`, limit: 3, windowMs: 86_400_000 })
      if (cb.allowed) callbackSaved = await saveRioCallback(createServiceClient() as unknown as Parameters<typeof saveRioCallback>[0], reply.callback)
    }
    return NextResponse.json({ answer: reply.answer, links: reply.links, handoff: reply.handoff, callbackSaved })
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return NextResponse.json({ error: 'busy' }, { status: 503 })
    if (error instanceof Anthropic.APIError) console.error(`[rio] Claude API error ${error.status}: ${error.message}`)
    else console.error('[rio] unexpected error', error)
    return NextResponse.json({ error: 'unavailable' }, { status: 503 })
  }
}
