// lib/support/memory.ts — Rio's memory for research and for training RE’s own assistant later
// (docs/design/rio-assistant.md). Every turn is stored, whichever model (or the offline guide) answered.
// Privacy by design: text is redacted before it is written, no user or organisation id is stored (a workspace is
// kept only as a keyed one-way hash), and workspace conversations never leave the table in exports.
import crypto from 'node:crypto'
import type { GuideContext, GuideLink } from '@/lib/support/guide'
import type { RioMeta } from '@/lib/support/ai'

type Db = { from: (t: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

/** Masks e-mails, phone numbers and any other run of 6+ digits (OTPs, account, card or ID numbers). */
export function redact(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[email]')
    .replace(/(\+?\d[\d\s().-]{8,}\d)/g, (m) => (m.replace(/\D/g, '').length >= 10 ? '[phone]' : m))
    .replace(/\d{6,}/g, '[number]')
    .slice(0, 4000)
}

/** Keyed hash of a workspace slug: groups one workspace's conversations without naming the customer. */
export function workspaceHash(orgSlug: string, key = process.env.ENCRYPTION_KEY || 'repx-rio'): string {
  return crypto.createHmac('sha256', key).update(`workspace:${orgSlug}`).digest('hex')
}

export interface Turn {
  conversationId: string; context: GuideContext; orgSlug?: string; path: string
  question: string
  answer: string; links: GuideLink[]; handoff: boolean; source: 'ai' | 'offline'; meta: RioMeta | null; callbackSaved: boolean
}

/** Stores one question and its answer. Returns the stored answer's id (for ratings), or null if storing failed —
 *  a storage failure never blocks the reply. */
export async function rememberTurn(db: Db, t: Turn): Promise<string | null> {
  try {
    const now = new Date().toISOString()
    const { data: existing } = await db.from('assistant_conversations').select('id, message_count, callback_saved').eq('id', t.conversationId).maybeSingle()
    if (existing) {
      await db.from('assistant_conversations').update({ message_count: existing.message_count + 2, last_at: now, callback_saved: existing.callback_saved || t.callbackSaved }).eq('id', t.conversationId)
    } else {
      const { error } = await db.from('assistant_conversations').insert({
        id: t.conversationId, context: t.context, workspace_hash: t.context === 'workspace' && t.orgSlug ? workspaceHash(t.orgSlug) : null,
        first_path: t.path.slice(0, 200), message_count: 2, callback_saved: t.callbackSaved, started_at: now, last_at: now,
      })
      if (error) throw new Error(error.message)
    }
    const { error: qErr } = await db.from('assistant_messages').insert({ conversation_id: t.conversationId, role: 'user', content: redact(t.question) })
    if (qErr) throw new Error(qErr.message)
    const { data, error } = await db.from('assistant_messages').insert({
      conversation_id: t.conversationId, role: 'assistant', content: redact(t.answer), source: t.source,
      provider: t.meta?.provider ?? null, model: t.meta?.model ?? null, latency_ms: t.meta?.latencyMs ?? null,
      input_tokens: t.meta?.inputTokens ?? null, output_tokens: t.meta?.outputTokens ?? null,
      handoff: t.handoff, links: t.links,
    }).select('id').single()
    if (error) throw new Error(error.message)
    return data.id as string
  } catch (error) {
    console.error('[rio] could not store the conversation:', error instanceof Error ? error.message : error)
    return null
  }
}

/** A thumbs up / down on one of Rio's answers, only within the conversation it belongs to. */
export async function rateAnswer(db: Db, conversationId: string, messageId: string, rating: 1 | -1): Promise<boolean> {
  const { data } = await db.from('assistant_messages').update({ rating, rated_at: new Date().toISOString() })
    .eq('id', messageId).eq('conversation_id', conversationId).eq('role', 'assistant').select('id')
  return Boolean(data?.length)
}

export interface ExportRow { messages: { role: 'system' | 'user' | 'assistant'; content: string }[]; metadata: Record<string, unknown> }

/** Conversations as fine-tuning examples (JSONL chat format). Website and sign-in conversations only. */
export async function exportConversations(db: Db, opts: { since?: string; onlyRatedGood?: boolean; limit?: number } = {}): Promise<ExportRow[]> {
  let q = db.from('assistant_conversations').select('id, context, first_path, callback_saved, started_at').in('context', ['website', 'auth']).order('started_at', { ascending: true }).limit(Math.min(opts.limit ?? 2000, 5000))
  if (opts.since) q = q.gte('started_at', opts.since)
  const { data: convs } = await q
  const ids = (convs ?? []).map((c: { id: string }) => c.id)
  if (!ids.length) return []
  const rows: { conversation_id: string; role: 'user' | 'assistant'; content: string; source: string | null; provider: string | null; model: string | null; rating: number | null; handoff: boolean | null; created_at: string }[] = []
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db.from('assistant_messages').select('conversation_id, role, content, source, provider, model, rating, handoff, created_at').in('conversation_id', ids.slice(i, i + 200)).order('created_at', { ascending: true })
    rows.push(...(data ?? []))
  }
  const out: ExportRow[] = []
  for (const c of convs as { id: string; context: string; first_path: string | null; callback_saved: boolean; started_at: string }[]) {
    const msgs = rows.filter((r) => r.conversation_id === c.id)
    if (!msgs.some((m) => m.role === 'assistant')) continue
    const ratings = msgs.filter((m) => m.rating !== null).map((m) => m.rating as number)
    if (opts.onlyRatedGood && !(ratings.length && ratings.every((r) => r > 0))) continue
    out.push({
      messages: [
        { role: 'system', content: `You are Rio, RE’s guide (${c.context === 'website' ? 'website visitor' : 'sign-in page'}).` },
        ...msgs.map((m) => ({ role: m.role, content: m.content })),
      ],
      metadata: {
        conversation: c.id, context: c.context, first_path: c.first_path, started_at: c.started_at, callback_saved: c.callback_saved,
        ratings, handoffs: msgs.filter((m) => m.handoff).length,
        answered_by: [...new Set(msgs.filter((m) => m.role === 'assistant').map((m) => (m.source === 'offline' ? 'offline' : `${m.provider}:${m.model}`)))],
      },
    })
  }
  return out
}
