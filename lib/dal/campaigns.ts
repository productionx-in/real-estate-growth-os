// lib/dal/campaigns.ts
// Marketing campaigns (20260088). Callers authorise the organisation first (authorizeOrgAccess); every query here is
// also scoped by organisation, and only owners, admins and managers may change anything (canRunCampaigns, and the
// database trigger). Sending happens in the 'campaign.send' job (runCampaignBatch): e-mail is handed to the outbox,
// WhatsApp goes out through the Cloud API with an approved MARKETING template. Opt-outs are checked when recipients
// are chosen and again for each message at the moment it is sent.
import { createServiceClient } from '@/lib/supabase/server'
import type { DalResult } from '@/lib/dal/routing'
import type { Viewer } from '@/lib/leads/view-filters'
import { getSegment, segmentCandidates } from '@/lib/dal/segments'
import { queueEmail } from '@/lib/email/service'
import { sendWhatsAppMessage } from '@/lib/integrations/whatsapp/client'
import { templateBody, templateParamCount } from '@/lib/integrations/whatsapp/inbox-rules'
import {
  MAX_RECIPIENTS, WHATSAPP_BATCH, addressFor, canRunCampaigns, planRecipients, unknownPlaceholders, whatsappParams,
  type CampaignStatus, type Channel, type Counts,
} from '@/lib/campaigns/rules'

// The tables are newer than the generated types; keep the untyped access in one place.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = { from: (t: string) => any; rpc: (fn: string, args: Record<string, unknown>) => any }
const db = () => createServiceClient() as unknown as AnyDb

export interface Campaign {
  id: string
  name: string
  channel: Channel
  status: CampaignStatus
  segmentId: string | null
  segmentName: string | null
  subject: string | null
  body: string | null
  waConnectionId: string | null
  waTemplateName: string | null
  waLanguage: string | null
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
}

const COLUMNS = 'id, name, channel, status, segment_id, segment_name, subject, body, wa_connection_id, wa_template_name, wa_language, created_at, started_at, finished_at'
interface Row {
  id: string; name: string; channel: Channel; status: CampaignStatus; segment_id: string | null; segment_name: string | null
  subject: string | null; body: string | null; wa_connection_id: string | null; wa_template_name: string | null; wa_language: string | null
  created_at: string; started_at: string | null; finished_at: string | null
}
const toCampaign = (r: Row): Campaign => ({
  id: r.id, name: r.name, channel: r.channel, status: r.status, segmentId: r.segment_id, segmentName: r.segment_name,
  subject: r.subject, body: r.body, waConnectionId: r.wa_connection_id, waTemplateName: r.wa_template_name, waLanguage: r.wa_language,
  createdAt: r.created_at, startedAt: r.started_at, finishedAt: r.finished_at,
})

export interface Actor { profileId: string; role: Viewer['role'] }
const refuse = (error: string, status: number) => ({ success: false as const, error, status })
const forbidden = () => refuse('Only owners, admins and managers can run campaigns.', 403)

const emptyCounts = (): Counts => ({ total: 0, queued: 0, sent: 0, skipped: 0, failed: 0 })

async function countsFor(orgId: string, ids: string[]): Promise<Map<string, Counts>> {
  const map = new Map<string, Counts>()
  if (!ids.length) return map
  const { data } = await db().from('campaign_stats').select('campaign_id, total, queued, sent, skipped, failed').eq('org_id', orgId).in('campaign_id', ids)
  for (const r of (data ?? []) as (Counts & { campaign_id: string })[]) {
    map.set(r.campaign_id, { total: Number(r.total), queued: Number(r.queued), sent: Number(r.sent), skipped: Number(r.skipped), failed: Number(r.failed) })
  }
  return map
}

export async function listCampaigns(orgId: string): Promise<(Campaign & { counts: Counts })[]> {
  const { data } = await db().from('campaigns').select(COLUMNS).eq('org_id', orgId).order('created_at', { ascending: false }).limit(100)
  const rows = ((data ?? []) as Row[]).map(toCampaign)
  const counts = await countsFor(orgId, rows.map((r) => r.id))
  return rows.map((c) => ({ ...c, counts: counts.get(c.id) ?? emptyCounts() }))
}

export async function getCampaign(orgId: string, id: string): Promise<(Campaign & { counts: Counts }) | null> {
  const { data } = await db().from('campaigns').select(COLUMNS).eq('org_id', orgId).eq('id', id).maybeSingle()
  if (!data) return null
  const c = toCampaign(data as Row)
  return { ...c, counts: (await countsFor(orgId, [c.id])).get(c.id) ?? emptyCounts() }
}

export interface RecipientRow { id: string; leadId: string | null; leadName: string | null; address: string; status: string; skipReason: string | null; error: string | null; sentAt: string | null }

/** The report: recipients with their outcome (failed and skipped first, then the rest). */
export async function campaignRecipients(orgId: string, campaignId: string, limit = 300): Promise<RecipientRow[]> {
  const { data } = await db().from('campaign_recipient_outcomes')
    .select('id, lead_id, address, status, skip_reason, error, sent_at')
    .eq('org_id', orgId).eq('campaign_id', campaignId).order('updated_at', { ascending: false }).limit(limit)
  const rows = (data ?? []) as { id: string; lead_id: string | null; address: string; status: string; skip_reason: string | null; error: string | null; sent_at: string | null }[]
  const leadIds = [...new Set(rows.map((r) => r.lead_id).filter((x): x is string => !!x))]
  const names = new Map<string, string>()
  if (leadIds.length) {
    const { data: leads } = await db().from('leads_all').select('id, name').eq('org_id', orgId).in('id', leadIds)
    for (const l of (leads ?? []) as { id: string; name: string }[]) names.set(l.id, l.name)
  }
  const rank: Record<string, number> = { failed: 0, skipped: 1, queued: 2, sent: 3 }
  return rows.map((r) => ({
    id: r.id, leadId: r.lead_id, leadName: r.lead_id ? names.get(r.lead_id) ?? null : null,
    address: /^(lead|dup):/.test(r.address) ? '' : r.address, status: r.status, skipReason: r.skip_reason, error: r.error, sentAt: r.sent_at,
  })).sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9))
}

export interface WhatsAppOption { connectionId: string; label: string; templates: { name: string; language: string; body: string; params: number }[] }

/** Connected WhatsApp numbers and their approved MARKETING templates a campaign can use (at most one blank). */
export async function whatsappOptions(orgId: string): Promise<WhatsAppOption[]> {
  const { data: conns } = await db().from('integration_connections').select('id, name, metadata, status')
    .eq('org_id', orgId).eq('provider', 'whatsapp_cloud').eq('status', 'connected')
  const out: WhatsAppOption[] = []
  for (const c of (conns ?? []) as { id: string; name: string | null; metadata: Record<string, unknown> | null }[]) {
    const { data: tpls } = await db().from('whatsapp_templates').select('template_name, language, components')
      .eq('org_id', orgId).eq('connection_id', c.id).eq('status', 'APPROVED').eq('category', 'MARKETING').order('template_name')
    const templates = ((tpls ?? []) as { template_name: string; language: string; components: unknown }[])
      .map((t) => { const body = templateBody(t.components); return { name: t.template_name, language: t.language, body, params: templateParamCount(body) } })
      .filter((t) => t.params <= 1)
    const phone = typeof c.metadata?.display_phone_number === 'string' ? ` (${c.metadata.display_phone_number})` : ''
    out.push({ connectionId: c.id, label: `${c.name ?? 'WhatsApp'}${phone}`, templates })
  }
  return out
}

const cleanName = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '')

export async function createCampaign(orgId: string, actor: Actor, input: { name: unknown; channel: Channel; segmentId?: unknown }): Promise<DalResult<Campaign>> {
  if (!canRunCampaigns(actor.role)) return forbidden()
  const name = cleanName(input.name)
  if (name.length < 1 || name.length > 80) return refuse('Give the campaign a name of 1–80 characters.', 400)
  let segmentId: string | null = null, segmentName: string | null = null
  if (typeof input.segmentId === 'string' && input.segmentId) {
    const seg = await getSegment(orgId, input.segmentId)
    if (!seg) return refuse('Segment not found.', 404)
    segmentId = seg.id; segmentName = seg.name
  }
  const { data, error } = await db().from('campaigns').insert({
    org_id: orgId, name, channel: input.channel, segment_id: segmentId, segment_name: segmentName, created_by: actor.profileId,
  }).select(COLUMNS).single()
  if (error || !data) {
    if (error?.message?.includes('only owners, admins and managers')) return forbidden()
    return refuse('Could not create the campaign.', 500)
  }
  return { success: true, data: toCampaign(data as Row) }
}

export interface DraftInput {
  name?: unknown; segmentId?: unknown; subject?: unknown; body?: unknown
  waConnectionId?: unknown; waTemplateName?: unknown; waLanguage?: unknown
}

export async function updateDraft(orgId: string, actor: Actor, id: string, input: DraftInput): Promise<DalResult<Campaign>> {
  if (!canRunCampaigns(actor.role)) return forbidden()
  const current = await getCampaign(orgId, id)
  if (!current) return refuse('Campaign not found.', 404)
  if (current.status !== 'draft') return refuse('This campaign has already been sent; it can no longer be edited.', 409)
  const u: Record<string, unknown> = {}
  if (input.name !== undefined) {
    const n = cleanName(input.name)
    if (n.length < 1 || n.length > 80) return refuse('Give the campaign a name of 1–80 characters.', 400)
    u.name = n
  }
  if (input.segmentId !== undefined) {
    if (input.segmentId === null || input.segmentId === '') { u.segment_id = null; u.segment_name = null }
    else {
      const seg = typeof input.segmentId === 'string' ? await getSegment(orgId, input.segmentId) : null
      if (!seg) return refuse('Segment not found.', 404)
      u.segment_id = seg.id; u.segment_name = seg.name
    }
  }
  if (current.channel === 'email') {
    if (input.subject !== undefined) {
      const s = typeof input.subject === 'string' ? input.subject.replace(/\s+/g, ' ').trim() : ''
      if (s.length > 150) return refuse('Keep the subject under 150 characters.', 400)
      u.subject = s || null
    }
    if (input.body !== undefined) {
      const b = typeof input.body === 'string' ? input.body.replace(/\r\n/g, '\n').trim() : ''
      if (b.length > 5000) return refuse('Keep the message under 5,000 characters.', 400)
      u.body = b || null
    }
    const bad = unknownPlaceholders(`${u.subject ?? current.subject ?? ''} ${u.body ?? current.body ?? ''}`)
    if (bad.length) return refuse(`Only {{first_name}} can be filled in automatically; remove {{${bad[0]}}}.`, 400)
  } else if (input.waConnectionId !== undefined || input.waTemplateName !== undefined || input.waLanguage !== undefined) {
    const conn = typeof input.waConnectionId === 'string' ? input.waConnectionId : null
    const name = typeof input.waTemplateName === 'string' ? input.waTemplateName : null
    const lang = typeof input.waLanguage === 'string' ? input.waLanguage : null
    if (!conn || !name || !lang) { u.wa_connection_id = null; u.wa_template_name = null; u.wa_language = null }
    else {
      const option = (await whatsappOptions(orgId)).find((o) => o.connectionId === conn)
      if (!option?.templates.some((t) => t.name === name && t.language === lang)) {
        return refuse('Choose an approved marketing template of a connected WhatsApp number.', 400)
      }
      u.wa_connection_id = conn; u.wa_template_name = name; u.wa_language = lang
    }
  }
  if (!Object.keys(u).length) return { success: true, data: current }
  const { data, error } = await db().from('campaigns').update(u).eq('org_id', orgId).eq('id', id).eq('status', 'draft').select(COLUMNS).maybeSingle()
  if (error || !data) return refuse('Could not save the campaign.', error ? 500 : 409)
  return { success: true, data: toCampaign(data as Row) }
}

/** What is still missing before a draft can be sent (shown to the sender, and enforced by sendCampaign). */
export function missingForSend(c: Campaign): string[] {
  const m: string[] = []
  if (!c.segmentId) m.push('Choose who receives it (a segment).')
  if (c.channel === 'email') {
    if (!c.subject) m.push('Write a subject.')
    if (!c.body) m.push('Write the message.')
  } else if (!c.waTemplateName || !c.waConnectionId || !c.waLanguage) m.push('Choose an approved WhatsApp marketing template.')
  return m
}

async function suppressedSet(orgId: string, channel: Channel, addresses: string[]): Promise<Set<string>> {
  const out = new Set<string>()
  for (let i = 0; i < addresses.length; i += 300) {
    const { data } = await db().from('marketing_suppressions').select('address').eq('org_id', orgId).eq('channel', channel).in('address', addresses.slice(i, i + 300))
    for (const r of (data ?? []) as { address: string }[]) out.add(r.address)
  }
  return out
}

async function plan(orgId: string, actor: Actor, c: Campaign) {
  const seg = c.segmentId ? await getSegment(orgId, c.segmentId) : null
  if (!seg) return refuse('The segment of this campaign no longer exists. Choose another.', 409)
  const leads = await segmentCandidates(orgId, seg, actor, MAX_RECIPIENTS + 1)
  if (leads.length > MAX_RECIPIENTS) return refuse(`A campaign can reach up to ${MAX_RECIPIENTS.toLocaleString('en-IN')} leads. Narrow the segment.`, 409)
  const candidates = leads.map((l) => ({ leadId: l.id, name: l.name, email: l.email, phone: l.phone, status: l.status }))
  const addresses = [...new Set(candidates.map((x) => addressFor(c.channel, x)).filter((a): a is string => !!a))]
  const planned = planRecipients(c.channel, candidates, await suppressedSet(orgId, c.channel, addresses))
  return { success: true as const, data: planned }
}

/** Who would receive it right now, without sending anything. */
export async function previewAudience(orgId: string, actor: Actor, id: string): Promise<DalResult<{ willSend: number; skipped: Record<string, number> }>> {
  if (!canRunCampaigns(actor.role)) return forbidden()
  const c = await getCampaign(orgId, id)
  if (!c) return refuse('Campaign not found.', 404)
  const p = await plan(orgId, actor, c)
  if (!p.success) return p
  const skipped: Record<string, number> = {}
  for (const r of p.data) if (r.skipReason) skipped[r.skipReason] = (skipped[r.skipReason] ?? 0) + 1
  return { success: true, data: { willSend: p.data.filter((r) => r.status === 'queued').length, skipped } }
}

/**
 * Starts sending: freezes the recipients (once — a second click finds the campaign no longer a draft) and queues the
 * sending job. The sender must confirm that these people agreed to hear from the organisation.
 */
export async function sendCampaign(orgId: string, actor: Actor, id: string, consent: boolean): Promise<DalResult<{ queued: number; skipped: number }>> {
  if (!canRunCampaigns(actor.role)) return forbidden()
  if (!consent) return refuse('Confirm that these people agreed to receive messages from you.', 400)
  const c = await getCampaign(orgId, id)
  if (!c) return refuse('Campaign not found.', 404)
  if (c.status !== 'draft') return refuse('This campaign has already been sent.', 409)
  const missing = missingForSend(c)
  if (missing.length) return refuse(missing[0], 400)
  if (c.channel === 'whatsapp') {
    const ok = (await whatsappOptions(orgId)).find((o) => o.connectionId === c.waConnectionId)?.templates.some((t) => t.name === c.waTemplateName && t.language === c.waLanguage)
    if (!ok) return refuse('The WhatsApp template is no longer approved, or the number is disconnected. Choose another.', 409)
  }
  const p = await plan(orgId, actor, c)
  if (!p.success) return p
  const queued = p.data.filter((r) => r.status === 'queued').length
  if (!queued) return refuse('Nobody in this segment can receive it (no address, opted out or junk). Nothing was sent.', 409)

  // Claim the campaign: only one request moves it out of draft.
  const { data: claimed } = await db().from('campaigns').update({
    status: 'sending', consent_confirmed: true, started_at: new Date().toISOString(), sent_by: actor.profileId,
  }).eq('org_id', orgId).eq('id', id).eq('status', 'draft').select('id').maybeSingle()
  if (!claimed) return refuse('This campaign has already been sent.', 409)

  for (let i = 0; i < p.data.length; i += 500) {
    const rows = p.data.slice(i, i + 500).map((r) => ({
      campaign_id: id, org_id: orgId, lead_id: r.leadId, address: r.address, first_name: r.firstName, status: r.status, skip_reason: r.skipReason,
    }))
    const { error } = await db().from('campaign_recipients').insert(rows)
    if (error) {
      await db().from('campaign_recipients').update({ status: 'skipped', skip_reason: 'cancelled' }).eq('campaign_id', id).eq('status', 'queued')
      await db().from('campaigns').update({ status: 'cancelled', finished_at: new Date().toISOString() }).eq('org_id', orgId).eq('id', id)
      return refuse('Could not prepare the recipients. Nothing was sent; the campaign was cancelled.', 500)
    }
  }
  await db().rpc('enqueue_job', { p_kind: 'campaign.send', p_payload: { campaign_id: id, round: 0 }, p_org_id: orgId, p_run_at: new Date().toISOString(), p_dedupe_key: `campaign.send:${id}:0` })
  return { success: true, data: { queued, skipped: p.data.length - queued } }
}

/** Stops a campaign: a draft is simply cancelled; while sending, nothing more goes out (e-mails not yet sent are withdrawn). */
export async function cancelCampaign(orgId: string, actor: Actor, id: string): Promise<DalResult<{ withdrawn: number }>> {
  if (!canRunCampaigns(actor.role)) return forbidden()
  const c = await getCampaign(orgId, id)
  if (!c) return refuse('Campaign not found.', 404)
  if (c.status !== 'draft' && c.status !== 'sending') return refuse('This campaign has finished.', 409)
  const { data: moved } = await db().from('campaigns').update({ status: 'cancelled', finished_at: new Date().toISOString() })
    .eq('org_id', orgId).eq('id', id).in('status', ['draft', 'sending']).select('id').maybeSingle()
  if (!moved) return refuse('This campaign has finished.', 409)
  const { data: pending } = await db().from('campaign_recipients').select('id, email_outbox_id').eq('campaign_id', id).eq('status', 'queued')
  const rows = (pending ?? []) as { id: string; email_outbox_id: string | null }[]
  const outbox = rows.map((r) => r.email_outbox_id).filter((x): x is string => !!x)
  let withdrawn = 0
  for (let i = 0; i < outbox.length; i += 300) {
    const { data } = await db().from('email_outbox').update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .in('id', outbox.slice(i, i + 300)).eq('status', 'queued').select('id')
    withdrawn += (data ?? []).length
  }
  const notHandedOver = rows.filter((r) => !r.email_outbox_id).map((r) => r.id)
  for (let i = 0; i < notHandedOver.length; i += 300) {
    await db().from('campaign_recipients').update({ status: 'skipped', skip_reason: 'cancelled' }).in('id', notHandedOver.slice(i, i + 300)).eq('status', 'queued')
  }
  return { success: true, data: { withdrawn: withdrawn + notHandedOver.length } }
}

export async function deleteDraft(orgId: string, actor: Actor, id: string): Promise<DalResult<{ name: string }>> {
  if (!canRunCampaigns(actor.role)) return forbidden()
  const c = await getCampaign(orgId, id)
  if (!c) return refuse('Campaign not found.', 404)
  if (c.status !== 'draft') return refuse('Only drafts can be deleted; a sent campaign stays as a record.', 409)
  await db().from('campaigns').delete().eq('org_id', orgId).eq('id', id).eq('status', 'draft')
  return { success: true, data: { name: c.name } }
}

// ── The sending job ──────────────────────────────────────────────────────────────────────────────────────────────

interface Claimed { id: string; org_id: string; lead_id: string | null; address: string; first_name: string | null }

const EMAIL_BATCH = 200

/**
 * One run of 'campaign.send' for one campaign: claims the next batch, re-checks opt-outs, hands e-mails to the outbox
 * or sends WhatsApp templates, and records each outcome. Returns 'more' while recipients wait to be handed over,
 * 'waiting' while e-mails are still in the outbox (the campaign can still be stopped), and 'done' once every message is
 * delivered, failed or left out — then the campaign is marked sent.
 */
export async function runCampaignBatch(campaignId: string): Promise<'more' | 'waiting' | 'done'> {
  const { data: row } = await db().from('campaigns').select(`org_id, ${COLUMNS}`).eq('id', campaignId).maybeSingle()
  if (!row || row.status !== 'sending') return 'done'
  const c = toCampaign(row as Row)
  const orgId = (row as { org_id: string }).org_id

  const { data: batch, error } = await db().rpc('claim_campaign_recipients', { p_campaign: campaignId, p_limit: c.channel === 'email' ? EMAIL_BATCH : WHATSAPP_BATCH })
  if (error) throw new Error(`campaign.send: claim failed: ${error.message}`)
  const rows = (batch ?? []) as Claimed[]

  if (rows.length) {
    const suppressed = await suppressedSet(orgId, c.channel, rows.map((r) => r.address))
    let template: { body: string; params: number } | null = null
    if (c.channel === 'whatsapp') {
      const { data: tpl } = await db().from('whatsapp_templates').select('components')
        .eq('org_id', orgId).eq('connection_id', c.waConnectionId).eq('template_name', c.waTemplateName).eq('language', c.waLanguage)
        .eq('status', 'APPROVED').eq('category', 'MARKETING').maybeSingle()
      if (tpl) { const body = templateBody(tpl.components); template = { body, params: templateParamCount(body) } }
    }
    for (const r of rows) {
      const done = (u: Record<string, unknown>) => db().from('campaign_recipients').update({ ...u, claimed_until: null }).eq('id', r.id).eq('status', 'queued')
      if (suppressed.has(r.address)) { await done({ status: 'skipped', skip_reason: 'opted_out' }); continue }
      if (c.channel === 'email') {
        const outboxId = await queueEmail(createServiceClient() as never, {
          orgId, category: 'marketing', template: 'campaign.email', to: r.address,
          payload: { recipientId: r.id }, idempotencyKey: `campaign:${r.id}`,
        })
        if (outboxId) await db().from('campaign_recipients').update({ email_outbox_id: outboxId, claimed_until: null }).eq('id', r.id)
        else await done({ status: 'failed', error: 'The e-mail could not be queued.' })
        continue
      }
      const params = template ? whatsappParams(template.params, r.first_name) : null
      if (!template || !params) { await done({ status: 'failed', error: 'The WhatsApp template is no longer approved.' }); continue }
      const sent = await sendWhatsAppMessage({
        orgId, connectionId: c.waConnectionId!, to: r.address, leadId: r.lead_id,
        message: { type: 'template', template: { name: c.waTemplateName!, language: { code: c.waLanguage! }, ...(params.length ? { components: [{ type: 'body', parameters: params.map((text) => ({ type: 'text' as const, text })) }] } : {}) } },
      })
      if (sent.success) await done({ status: 'sent', wa_message_id: sent.messageId ?? null })
      else if (sent.errorCode === 'recipient_opted_out') await done({ status: 'skipped', skip_reason: 'opted_out' })
      else await done({ status: 'failed', error: (sent.error ?? 'WhatsApp did not accept the message.').slice(0, 300) })
    }
  }

  const { count } = await db().from('campaign_recipients').select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaignId).eq('status', 'queued').is('email_outbox_id', null)
  if ((count ?? 0) > 0) return 'more'
  const { count: inOutbox } = await db().from('campaign_recipient_outcomes').select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaignId).eq('status', 'queued')
  if ((inOutbox ?? 0) > 0) return 'waiting'
  await db().from('campaigns').update({ status: 'sent', finished_at: new Date().toISOString() }).eq('id', campaignId).eq('status', 'sending')
  return 'done'
}

// ── Opt-outs ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** The unsubscribe link's page: which organisation and address it is for (nothing else is shown). */
export async function unsubscribeTarget(token: string): Promise<{ orgName: string; address: string; done: boolean } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return null
  const { data: r } = await db().from('campaign_recipients').select('org_id, address, campaign:campaigns!inner(channel)').eq('unsubscribe_token', token).maybeSingle()
  if (!r || r.campaign?.channel !== 'email') return null
  const [{ data: org }, { data: sup }] = await Promise.all([
    db().from('organisations').select('name').eq('id', r.org_id).maybeSingle(),
    db().from('marketing_suppressions').select('address').eq('org_id', r.org_id).eq('channel', 'email').eq('address', r.address).maybeSingle(),
  ])
  const [user, domain] = String(r.address).split('@')
  return { orgName: org?.name ?? 'this company', address: `${user.slice(0, 2)}${'•'.repeat(Math.max(user.length - 2, 1))}@${domain}`, done: !!sup }
}

export async function unsubscribe(token: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return false
  const { data: r } = await db().from('campaign_recipients').select('org_id, address, campaign:campaigns!inner(channel)').eq('unsubscribe_token', token).maybeSingle()
  if (!r || r.campaign?.channel !== 'email') return false
  const { error } = await db().from('marketing_suppressions').upsert(
    { org_id: r.org_id, channel: 'email', address: r.address, source: 'unsubscribe_link' }, { onConflict: 'org_id,channel,address', ignoreDuplicates: true })
  return !error
}

/** WhatsApp STOP / START (lib/integrations/whatsapp/processor.ts): keep the marketing opt-out list in step. */
export async function recordWhatsAppConsent(orgId: string, waId: string, optedOut: boolean): Promise<void> {
  const address = waId.replace(/\D/g, '')
  if (!/^[0-9]{8,15}$/.test(address)) return
  if (optedOut) {
    await db().from('marketing_suppressions').upsert({ org_id: orgId, channel: 'whatsapp', address, source: 'whatsapp_stop' }, { onConflict: 'org_id,channel,address', ignoreDuplicates: true })
  } else {
    await db().from('marketing_suppressions').delete().eq('org_id', orgId).eq('channel', 'whatsapp').eq('address', address).eq('source', 'whatsapp_stop')
  }
}

export async function suppressionCounts(orgId: string): Promise<{ email: number; whatsapp: number }> {
  const [e, w] = await Promise.all(['email', 'whatsapp'].map((ch) =>
    db().from('marketing_suppressions').select('address', { count: 'exact', head: true }).eq('org_id', orgId).eq('channel', ch)))
  return { email: e.count ?? 0, whatsapp: w.count ?? 0 }
}
