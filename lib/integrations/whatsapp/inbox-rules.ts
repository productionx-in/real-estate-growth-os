// lib/integrations/whatsapp/inbox-rules.ts
// Rules for the WhatsApp inbox, shared by the API (which enforces them) and the UI (which only reflects them).
// No server imports, so client components can use it.
//
//   Who sees a conversation: owners, admins, managers and read-only members see every conversation in the
//   workspace; a sales executive only conversations with leads assigned to them; a team lead their team's;
//   post-sales only booked customers'. A conversation with no lead is for whole-workspace roles only.
//   Who replies: anyone who can see it except read-only members.
//   What can be sent (Meta's WhatsApp Business policy):
//     • nothing to someone who opted out (STOP) until they opt back in (START);
//     • free text within 24 hours of the buyer's last message;
//     • after that, only an approved message template.
import type { MemberRole } from '@/types/database'
import { leadScopeOf, type LeadViewer } from '@/lib/auth/permissions'

export const CUSTOMER_CARE_WINDOW_MS = 24 * 60 * 60 * 1000
export const MAX_TEXT = 4096
export const MAX_TEMPLATE_PARAM = 1024

export type InboxViewer = LeadViewer

/**
 * Can this member see a conversation whose lead is assigned to `leadAssignee` (null: no lead / unassigned)
 * and has `leadStatus`? Stricter than canSeeLead: an unassigned buyer's chat belongs to whole-workspace roles.
 */
export function canSeeConversation(leadAssignee: string | null, viewer: InboxViewer, leadStatus?: string | null): boolean {
  switch (leadScopeOf(viewer.role)) {
    case 'all': return true
    case 'own': return !!leadAssignee && leadAssignee === viewer.profileId
    case 'team': return !!leadAssignee && (leadAssignee === viewer.profileId || (viewer.teamProfileIds ?? []).includes(leadAssignee))
    case 'booked': return leadStatus === 'booked'
  }
}

export function canReply(role: MemberRole): boolean {
  return role !== 'readonly'
}

/**
 * Does opening the conversation count as reading it? Only for the person who owns the buyer (the lead's
 * salesperson) — or, when nobody owns it, anyone who can reply. A manager looking in must not make a new
 * message look handled to the salesperson; read-only members never clear it.
 */
export function readClears(leadAssignee: string | null, viewer: InboxViewer): boolean {
  if (!canReply(viewer.role)) return false
  return leadAssignee ? leadAssignee === viewer.profileId : true
}

export type ReplyMode =
  | { mode: 'text'; windowEndsAt: string }
  | { mode: 'template'; reason: string }
  | { mode: 'blocked'; reason: string }

export function replyMode(conv: { is_opted_out: boolean; last_inbound_at: string | null }, now: Date): ReplyMode {
  if (conv.is_opted_out) {
    return { mode: 'blocked', reason: 'This buyer replied STOP. You can message them again only after they send START.' }
  }
  const last = conv.last_inbound_at ? new Date(conv.last_inbound_at).getTime() : NaN
  if (Number.isFinite(last) && now.getTime() - last < CUSTOMER_CARE_WINDOW_MS) {
    return { mode: 'text', windowEndsAt: new Date(last + CUSTOMER_CARE_WINDOW_MS).toISOString() }
  }
  return {
    mode: 'template',
    reason: 'More than 24 hours since the buyer last wrote, so WhatsApp only allows an approved template.',
  }
}

/** The {{1}}, {{2}}… placeholders a template body needs, in order (1..n, no gaps assumed by Meta). */
export function templateParamCount(body: string): number {
  let max = 0
  for (const m of body.matchAll(/\{\{\s*(\d{1,2})\s*\}\}/g)) max = Math.max(max, Number(m[1]))
  return max
}

/** The template body with its placeholders filled, for the inbox preview and the stored copy. */
export function fillTemplate(body: string, params: string[]): string {
  return body.replace(/\{\{\s*(\d{1,2})\s*\}\}/g, (all, n) => params[Number(n) - 1] ?? all)
}

/** The body text of a stored template (Meta's components array), or ''. */
export function templateBody(components: unknown): string {
  if (!Array.isArray(components)) return ''
  for (const c of components) {
    if (c && typeof c === 'object' && String((c as Record<string, unknown>).type).toLowerCase() === 'body') {
      const t = (c as Record<string, unknown>).text
      return typeof t === 'string' ? t : ''
    }
  }
  return ''
}

/** What to show for a message that has no text (photo, voice note, location…). */
export function messageLabel(type: string, body: string | null): string {
  if (body && !/^\[[A-Z_]+\]$/.test(body)) return body
  const labels: Record<string, string> = {
    image: 'Photo', video: 'Video', audio: 'Voice message', document: 'Document', sticker: 'Sticker',
    location: 'Location', contacts: 'Contact card', interactive: 'Button reply', button: 'Button reply',
  }
  // The stored placeholder names the type ("[IMAGE]"), so a preview without a type still reads well.
  const named = body?.match(/^\[([A-Z_]+)\]$/)?.[1]?.toLowerCase()
  return labels[type] ?? (named ? labels[named] : undefined) ?? 'Message'
}
