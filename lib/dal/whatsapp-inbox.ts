// lib/dal/whatsapp-inbox.ts
// The WhatsApp inbox: conversations, their messages and replies. Callers authorise the organisation first;
// every query here is scoped by organisation, and who-sees-what (lib/integrations/whatsapp/inbox-rules.ts)
// is applied in the query itself, so a sales executive's list never contains other people's buyers.
import { createServiceClient } from '@/lib/supabase/server'
import { checkDistributedRateLimit } from '@/lib/integrations/webhooks/rate-limiter'
import { sendWhatsAppMessage, type OutboundMessageParams } from '@/lib/integrations/whatsapp/client'
import {
  MAX_TEMPLATE_PARAM, MAX_TEXT, canReply, canSeeConversation, fillTemplate, readClears, replyMode, templateBody, templateParamCount,
  type InboxViewer, type ReplyMode,
} from '@/lib/integrations/whatsapp/inbox-rules'
import type { DalResult } from '@/lib/dal/routing'
import { leadScopeOf } from '@/lib/auth/permissions'

export type InboxFilter = 'all' | 'unread' | 'mine' | 'unlinked'

export interface ConversationSummary {
  id: string
  name: string
  phone: string
  leadId: string | null
  leadStatus: string | null
  assigneeName: string | null
  lastMessageAt: string | null
  preview: string | null
  lastDirection: 'inbound' | 'outbound' | null
  unread: number
  optedOut: boolean
}

interface ConvRow {
  id: string
  org_id: string
  connection_id: string
  wa_id: string
  contact_name: string | null
  lead_id: string | null
  is_opted_out: boolean
  last_inbound_at: string | null
  last_message_at: string | null
  last_message_preview: string | null
  last_direction: 'inbound' | 'outbound' | null
  unread_count: number
  lead: { id: string; name: string; status: string; assigned_to: string | null; assignee: { full_name: string } | null } | null
}

const CONV_COLUMNS = `id, org_id, connection_id, wa_id, contact_name, lead_id, is_opted_out, last_inbound_at, last_message_at,
  last_message_preview, last_direction, unread_count,
  lead:leads(id, name, status, assigned_to, assignee:profiles!leads_assigned_to_fkey(full_name))`

function displayPhone(waId: string) {
  return waId.startsWith('91') && waId.length === 12 ? `+91 ${waId.slice(2, 7)} ${waId.slice(7)}` : `+${waId}`
}

function summarise(r: ConvRow): ConversationSummary {
  return {
    id: r.id,
    name: r.lead?.name || r.contact_name || displayPhone(r.wa_id),
    phone: displayPhone(r.wa_id),
    leadId: r.lead?.id ?? null,
    leadStatus: r.lead?.status ?? null,
    assigneeName: r.lead?.assignee?.full_name ?? null,
    lastMessageAt: r.last_message_at,
    preview: r.last_message_preview,
    lastDirection: r.last_direction,
    unread: r.unread_count,
    optedOut: r.is_opted_out,
  }
}

export async function listConversations(orgId: string, viewer: InboxViewer, filter: InboxFilter = 'all'): Promise<ConversationSummary[]> {
  const db = createServiceClient()
  const scope = leadScopeOf(viewer.role)
  const scoped = scope !== 'all'
  // Narrower roles only see conversations with a lead in their scope (inner join on the lead).
  let q = db.from('whatsapp_conversations')
    .select(scoped ? CONV_COLUMNS.replace('lead:leads(', 'lead:leads!inner(') : CONV_COLUMNS)
    .eq('org_id', orgId)
  if (scope === 'own' || filter === 'mine') q = q.eq('lead.assigned_to', viewer.profileId)
  else if (scope === 'team') q = q.in('lead.assigned_to', [viewer.profileId, ...(viewer.teamProfileIds ?? [])])
  if (scope === 'booked') q = q.eq('lead.status', 'booked')
  if (filter === 'mine' && !scoped) q = q.not('lead', 'is', null)
  if (filter === 'unread') q = q.gt('unread_count', 0)
  if (filter === 'unlinked') q = q.is('lead_id', null)
  const { data } = await q.order('last_message_at', { ascending: false, nullsFirst: false }).limit(200)
  return ((data ?? []) as unknown as ConvRow[])
    .filter((r) => canSeeConversation(r.lead?.assigned_to ?? null, viewer, r.lead?.status))
    .map(summarise)
}

/** Unread conversations this member can see (for the navigation badge). */
export async function unreadCount(orgId: string, viewer: InboxViewer): Promise<number> {
  const rows = await listConversations(orgId, viewer, 'unread')
  return rows.length
}

export interface ThreadMessage {
  id: string
  direction: 'inbound' | 'outbound'
  type: string
  body: string | null
  status: string
  at: string
  sentBy: string | null
}

export interface TemplateOption {
  name: string
  language: string
  body: string
  params: number
}

export interface Thread {
  conversation: ConversationSummary & { connectionId: string; waId: string }
  messages: ThreadMessage[]
  reply: ReplyMode
  canReply: boolean
  templates: TemplateOption[]
}

async function loadVisible(orgId: string, conversationId: string, viewer: InboxViewer): Promise<ConvRow | null> {
  const db = createServiceClient()
  const { data } = await db.from('whatsapp_conversations').select(CONV_COLUMNS).eq('org_id', orgId).eq('id', conversationId).maybeSingle()
  const row = data as unknown as ConvRow | null
  return row && canSeeConversation(row.lead?.assigned_to ?? null, viewer, row.lead?.status) ? row : null
}

export async function getThread(orgId: string, conversationId: string, viewer: InboxViewer, now = new Date()): Promise<Thread | null> {
  const row = await loadVisible(orgId, conversationId, viewer)
  if (!row) return null
  const db = createServiceClient()
  const [{ data: msgs }, { data: tpls }] = await Promise.all([
    db.from('whatsapp_messages')
      .select('id, direction, message_type, body, delivery_status, received_at, sender:profiles!whatsapp_messages_sent_by_fkey(full_name)')
      .eq('org_id', orgId).eq('conversation_id', row.id)
      // Meta's timestamps are whole seconds: the time we stored each message breaks ties.
      .order('received_at', { ascending: false }).order('created_at', { ascending: false }).limit(200),
    db.from('whatsapp_templates').select('template_name, language, components, status')
      .eq('org_id', orgId).eq('connection_id', row.connection_id).eq('status', 'APPROVED').order('template_name'),
  ])
  return {
    conversation: { ...summarise(row), connectionId: row.connection_id, waId: row.wa_id },
    messages: ((msgs ?? []) as unknown as {
      id: string; direction: 'inbound' | 'outbound'; message_type: string; body: string | null; delivery_status: string
      received_at: string; sender: { full_name: string } | null
    }[]).reverse().map((m) => ({
      id: m.id, direction: m.direction, type: m.message_type, body: m.body, status: m.delivery_status, at: m.received_at,
      sentBy: m.sender?.full_name ?? null,
    })),
    reply: replyMode(row, now),
    canReply: canReply(viewer.role),
    templates: (tpls ?? []).map((t) => {
      const body = templateBody(t.components)
      return { name: t.template_name, language: t.language, body, params: templateParamCount(body) }
    }),
  }
}

/** Marks the conversation read if this viewer's opening counts (readClears); false if they cannot see it. */
export async function markRead(orgId: string, conversationId: string, viewer: InboxViewer): Promise<boolean> {
  const row = await loadVisible(orgId, conversationId, viewer)
  if (!row) return false
  if (!readClears(row.lead?.assigned_to ?? null, viewer)) return true
  const db = createServiceClient()
  await db.from('whatsapp_conversations')
    .update({ unread_count: 0, last_read_at: new Date().toISOString(), last_read_by: viewer.profileId })
    .eq('org_id', orgId).eq('id', row.id)
  return true
}

export type ReplyInput =
  | { kind: 'text'; text: string }
  | { kind: 'template'; name: string; language: string; params: string[] }

/**
 * Sends a reply from the inbox. Enforces who may reply, Meta's rules (opt-out, 24-hour window, approved
 * templates only), a per-person send limit, and records who sent it — on the message and on the lead.
 */
export async function sendReply(
  orgId: string, conversationId: string, viewer: InboxViewer, input: ReplyInput, now = new Date()
): Promise<DalResult<{ messageId: string }>> {
  if (!canReply(viewer.role)) return { success: false, error: 'Read-only members cannot send messages.', status: 403 }
  const row = await loadVisible(orgId, conversationId, viewer)
  if (!row) return { success: false, error: 'Conversation not found.', status: 404 }

  const mode = replyMode(row, now)
  if (mode.mode === 'blocked') return { success: false, error: mode.reason, status: 409 }

  let message: OutboundMessageParams
  let stored: string
  if (input.kind === 'text') {
    const text = input.text.trim()
    if (!text || text.length > MAX_TEXT) return { success: false, error: `Write a message of up to ${MAX_TEXT} characters.`, status: 400 }
    if (mode.mode !== 'text') return { success: false, error: mode.reason, status: 409 }
    message = { type: 'text', text: { body: text } }
    stored = text
  } else {
    const db = createServiceClient()
    const { data: tpl } = await db.from('whatsapp_templates').select('template_name, language, components')
      .eq('org_id', orgId).eq('connection_id', row.connection_id).eq('status', 'APPROVED')
      .eq('template_name', input.name).eq('language', input.language).maybeSingle()
    if (!tpl) return { success: false, error: 'That template is not approved for this WhatsApp number.', status: 400 }
    const body = templateBody(tpl.components)
    const params = input.params.map((p) => p.trim())
    if (params.length !== templateParamCount(body) || params.some((p) => !p || p.length > MAX_TEMPLATE_PARAM)) {
      return { success: false, error: 'Fill in every blank in the template.', status: 400 }
    }
    message = {
      type: 'template',
      template: {
        name: tpl.template_name,
        language: { code: tpl.language },
        ...(params.length ? { components: [{ type: 'body', parameters: params.map((text) => ({ type: 'text' as const, text })) }] } : {}),
      },
    }
    stored = fillTemplate(body, params) || `[Template: ${tpl.template_name}]`
  }

  const limit = await checkDistributedRateLimit({ key: `wa:send:${viewer.profileId}`, limit: 30, windowMs: 60_000 })
  if (!limit.allowed) return { success: false, error: 'You are sending messages too quickly. Wait a minute.', status: 429 }

  const sent = await sendWhatsAppMessage({
    orgId, connectionId: row.connection_id, to: row.wa_id, message, conversationId: row.id, leadId: row.lead_id,
  })
  if (!sent.success || !sent.messageId) {
    // Set-up problems get a plain instruction (and no internals); WhatsApp's own refusals are shown as given.
    const setup = ['missing_credentials', 'decryption_error', 'missing_phone_number_id'].includes(String(sent.errorCode))
    return {
      success: false,
      error: setup
        ? 'WhatsApp is not fully connected for this workspace. Ask a manager to reconnect it in Integrations → WhatsApp.'
        : sent.error ?? 'WhatsApp did not accept the message.',
      status: setup ? 503 : 502,
    }
  }

  const db = createServiceClient()
  // The stored copy shows what the buyer received (template blanks filled in), and who sent it.
  await db.from('whatsapp_messages').update({ sent_by: viewer.profileId, body: stored })
    .eq('org_id', orgId).eq('wamid', sent.messageId)
  if (row.lead_id) {
    // Counts as contact with the lead (first response time, follow-ups) like a logged WhatsApp.
    await db.from('lead_activities').insert({
      lead_id: row.lead_id, actor_id: viewer.profileId, type: 'whatsapp_logged',
      note: `WhatsApp sent: ${stored.slice(0, 200)}`, metadata: { conversation_id: row.id, wamid: sent.messageId, via: 'inbox' },
    })
  }
  return { success: true, data: { messageId: sent.messageId } }
}
