// app/api/assistant/route.ts — Rio's answers. Public (the website uses it), so: validated input, short
// conversations, per-IP rate limit, and no customer data in the prompt. Whichever AI provider is configured answers
// (lib/support/providers.ts); with none, or if all fail, the offline guide answers. Every turn is stored, redacted,
// for research and training (lib/support/memory.ts).
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { askRio, type RioMeta } from '@/lib/support/ai'
import { answer as offlineAnswer } from '@/lib/support/guide'
import { checkDistributedRateLimit } from '@/lib/integrations/webhooks/rate-limiter'
import { createServiceClient } from '@/lib/supabase/server'
import { saveRioCallback } from '@/lib/support/prospect'
import { rememberTurn } from '@/lib/support/memory'

const Body = z.object({
  conversationId: z.string().uuid(),
  context: z.enum(['website', 'auth', 'workspace']),
  path: z.string().max(200).regex(/^\/[\w\-/]*$/),
  orgSlug: z.string().regex(/^[a-z0-9-]{1,80}$/).optional(),
  messages: z.array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().trim().min(1).max(800) })).min(1).max(12),
})

const OFFLINE_HANDOFF = {
  workspace: 'Let me get the right person from our team on this — the quickest way is below.',
  other: 'That one’s best answered by our team — they can walk you through it on a quick call:',
}

export async function POST(request: NextRequest) {
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success || parsed.data.messages.at(-1)?.role !== 'user') return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  const b = parsed.data

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const limit = await checkDistributedRateLimit({ key: `rio:ip:${ip}`, limit: 30, windowMs: 10 * 60_000 })
  if (!limit.allowed) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  const db = createServiceClient() as unknown as Parameters<typeof rememberTurn>[0]
  const question = b.messages.at(-1)!.text
  let answer: string, links: { label: string; href: string }[], handoff: boolean, source: 'ai' | 'offline', meta: RioMeta | null = null
  let callbackSaved = false
  try {
    const ai = await askRio({ context: b.context, path: b.path, orgSlug: b.orgSlug, history: b.messages })
    ;({ answer, links, handoff } = ai.reply); meta = ai.meta; source = 'ai'
    if (ai.reply.callback) {
      // A visitor asked to be called back: a few per address per day, straight into the Sales pipeline.
      const cb = await checkDistributedRateLimit({ key: `rio-callback:ip:${ip}`, limit: 3, windowMs: 86_400_000 })
      if (cb.allowed) callbackSaved = await saveRioCallback(db, ai.reply.callback)
    }
  } catch {
    // No provider configured, or every provider failed: the offline guide answers.
    const a = offlineAnswer(question, b.context, b.orgSlug)
    answer = a?.text ?? OFFLINE_HANDOFF[b.context === 'workspace' ? 'workspace' : 'other']
    links = a?.links ?? []; handoff = !a || a.id === 'human'; source = 'offline'
  }

  const messageId = await rememberTurn(db, { conversationId: b.conversationId, context: b.context, orgSlug: b.orgSlug, path: b.path, question, answer, links, handoff, source, meta, callbackSaved })
  return NextResponse.json({ answer, links, handoff, callbackSaved, source, messageId })
}
