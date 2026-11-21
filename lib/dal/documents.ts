// lib/dal/documents.ts
// Document templates, documents generated for leads, and their share links. Callers authorise first
// (templates: managers and above; documents: authorizeLeadWork); every query is scoped by organisation and
// the database re-checks that a document's lead, template and unit belong to it (20260052).
import crypto from 'node:crypto'
import { createServiceClient } from '@/lib/supabase/server'
import { getResponseMinutes } from '@/lib/dal/action-board'
import { missingFields, renderTemplate, unknownFields, type MergeContext } from '@/lib/documents/merge'
import { buildLetterhead, parseLetterhead, profileFromRow, profileToRow, type BusinessProfile, type Letterhead } from '@/lib/documents/letterhead'
import type { DalResult } from '@/lib/dal/routing'
import type { Json } from '@/types/database'

import { TEMPLATE_KINDS, type TemplateKind } from '@/lib/documents/kinds'
export { TEMPLATE_KINDS, type TemplateKind }
export const LINK_DAYS = { min: 1, max: 90, default: 30 }

export interface DocumentTemplate {
  id: string
  name: string
  kind: TemplateKind
  body: string
  /** Documents from this template carry the company letterhead (20260071). */
  letterhead: boolean
  updatedAt: string
}

/** The company's details for documents (Settings → Business details). Empty when never filled in. */
export async function getBusinessProfile(orgId: string): Promise<BusinessProfile> {
  const { data } = await createServiceClient().from('org_business_profiles').select('*').eq('org_id', orgId).maybeSingle()
  return profileFromRow(data as Record<string, unknown> | null)
}

/** Owners and admins only — the caller authorises. Values must already be normalised (normaliseProfile). */
export async function saveBusinessProfile(orgId: string, actorId: string, profile: BusinessProfile): Promise<boolean> {
  const { error } = await createServiceClient().from('org_business_profiles')
    .upsert({ org_id: orgId, ...profileToRow(profile), updated_by: actorId, updated_at: new Date().toISOString() }, { onConflict: 'org_id' })
  return !error
}

export async function listTemplates(orgId: string): Promise<DocumentTemplate[]> {
  const { data } = await createServiceClient().from('document_templates').select('id, name, kind, body, letterhead, updated_at')
    .eq('org_id', orgId).eq('archived', false).order('name')
  return (data ?? []).map((t) => ({ id: t.id, name: t.name, kind: t.kind as TemplateKind, body: t.body, letterhead: t.letterhead !== false, updatedAt: t.updated_at }))
}

export async function saveTemplate(
  orgId: string, actorId: string, input: { id?: string; name: string; kind: TemplateKind; body: string; letterhead?: boolean }
): Promise<DalResult<{ id: string }>> {
  const unknown = unknownFields(input.body)
  if (unknown.length) {
    return { success: false, error: `Unknown field${unknown.length > 1 ? 's' : ''}: ${unknown.map((k) => `{{${k}}}`).join(', ')}. Pick fields from the list.`, status: 400 }
  }
  const db = createServiceClient()
  const row = { name: input.name.trim(), kind: input.kind, body: input.body, letterhead: input.letterhead !== false, updated_by: actorId, updated_at: new Date().toISOString() }
  const { data, error } = input.id
    ? await db.from('document_templates').update(row).eq('org_id', orgId).eq('id', input.id).eq('archived', false).select('id').maybeSingle()
    : await db.from('document_templates').insert({ ...row, org_id: orgId, created_by: actorId }).select('id').single()
  if (error?.code === '23505') return { success: false, error: 'A template with that name already exists.', status: 409 }
  if (error) return { success: false, error: 'Could not save the template.', status: 500 }
  if (!data) return { success: false, error: 'Template not found.', status: 404 }
  return { success: true, data: { id: data.id } }
}

export async function archiveTemplate(orgId: string, id: string): Promise<boolean> {
  const { data } = await createServiceClient().from('document_templates').update({ archived: true, updated_at: new Date().toISOString() })
    .eq('org_id', orgId).eq('id', id).select('id').maybeSingle()
  return !!data
}

/** Everything a template can mention for this lead (and unit, if one is chosen). Null if the unit is not this organisation's. */
export async function buildContext(orgId: string, leadId: string, unitId: string | null, now = new Date()): Promise<MergeContext | null> {
  const db = createServiceClient()
  const [{ data: lead }, { data: org }, unitRes, { timezone }, profile] = await Promise.all([
    db.from('leads').select('name, phone, email, project_id, assigned_to').eq('org_id', orgId).eq('id', leadId).maybeSingle(),
    db.from('organisations').select('name').eq('id', orgId).maybeSingle(),
    unitId
      ? db.from('inventory_items').select('project_id, unit_number, tower_name, floor_number, bhk_config, carpet_area, super_built_up_area, area_value, area_unit, facing, base_rate, total_price, parking_spaces, pricing_breakup')
          .eq('org_id', orgId).eq('id', unitId).maybeSingle()
      : Promise.resolve({ data: null }),
    getResponseMinutes(orgId),
    getBusinessProfile(orgId),
  ])
  if (!lead || !org) return null
  const unit = unitRes.data
  if (unitId && !unit) return null
  const projectId = unit?.project_id ?? lead.project_id
  const [{ data: project }, agent] = await Promise.all([
    projectId
      ? db.from('projects').select('name, city, location, rera_number').eq('org_id', orgId).eq('id', projectId).maybeSingle()
      : Promise.resolve({ data: null }),
    (async () => {
      if (!lead.assigned_to) return null
      const { data: p } = await db.from('profiles').select('full_name, phone, auth_user_id').eq('id', lead.assigned_to).maybeSingle()
      if (!p) return null
      const { data: u } = await db.auth.admin.getUserById(p.auth_user_id)
      return { name: p.full_name, phone: p.phone, email: u?.user?.email ?? null }
    })(),
  ])
  return {
    lead: { name: lead.name, phone: lead.phone, email: lead.email },
    project: project ?? null,
    unit: unit ? { ...unit, pricing_breakup: unit.pricing_breakup } : null,
    agent,
    org: { name: org.name, profile },
    today: now,
    timezone,
  }
}

export async function previewDocument(orgId: string, leadId: string, templateId: string, unitId: string | null) {
  const db = createServiceClient()
  const { data: tpl } = await db.from('document_templates').select('name, body, letterhead').eq('org_id', orgId).eq('id', templateId).eq('archived', false).maybeSingle()
  if (!tpl) return null
  const ctx = await buildContext(orgId, leadId, unitId)
  if (!ctx) return null
  const letterhead: Letterhead | null = tpl.letterhead === false ? null : buildLetterhead(ctx.org.name, ctx.org.profile!)
  return { title: tpl.name, body: renderTemplate(tpl.body, ctx), missing: missingFields(tpl.body, ctx), letterhead }
}

export interface LeadDocument {
  id: string
  title: string
  token: string
  expiresAt: string
  revokedAt: string | null
  viewCount: number
  firstViewedAt: string | null
  lastViewedAt: string | null
  createdAt: string
  createdBy: string | null
}

export async function createDocument(
  orgId: string, leadId: string, actorId: string, input: { templateId: string; unitId: string | null; title?: string; validDays?: number; body?: string }
): Promise<DalResult<LeadDocument>> {
  const preview = await previewDocument(orgId, leadId, input.templateId, input.unitId)
  if (!preview) return { success: false, error: 'Template or unit not found.', status: 404 }
  // The salesperson may fill in blanks or adjust wording for this buyer before sharing (the filled-in text, never the template).
  const edited = typeof input.body === 'string' && input.body.trim().length > 0 && input.body !== preview.body
  const body = edited ? input.body!.replace(/\r\n?/g, '\n').slice(0, 40000) : preview.body
  const days = Math.min(LINK_DAYS.max, Math.max(LINK_DAYS.min, Math.floor(input.validDays ?? LINK_DAYS.default)))
  const db = createServiceClient()
  const { data, error } = await db.from('lead_documents').insert({
    org_id: orgId,
    lead_id: leadId,
    template_id: input.templateId,
    unit_id: input.unitId,
    title: (input.title?.trim() || preview.title).slice(0, 120),
    body,
    edited,
    // Frozen: a later change of address or GSTIN never rewrites what this buyer was sent.
    letterhead: preview.letterhead as unknown as Json | null,
    // 256 random bits: the link is the only key to the document, so it must not be guessable.
    share_token: crypto.randomBytes(32).toString('base64url'),
    expires_at: new Date(Date.now() + days * 86_400_000).toISOString(),
    created_by: actorId,
  }).select('id, title, share_token, expires_at, revoked_at, view_count, first_viewed_at, last_viewed_at, created_at').single()
  if (error || !data) return { success: false, error: 'Could not create the document.', status: 500 }
  await db.from('lead_activities').insert({
    lead_id: leadId, actor_id: actorId, type: 'note_added', note: `Shared the document “${data.title}”`,
    metadata: { document_id: data.id, event: 'document_shared' },
  })
  return {
    success: true,
    data: {
      id: data.id, title: data.title, token: data.share_token, expiresAt: data.expires_at, revokedAt: data.revoked_at,
      viewCount: data.view_count, firstViewedAt: data.first_viewed_at, lastViewedAt: data.last_viewed_at, createdAt: data.created_at, createdBy: null,
    },
  }
}

export async function listLeadDocuments(orgId: string, leadId: string): Promise<LeadDocument[]> {
  const { data } = await createServiceClient().from('lead_documents')
    .select('id, title, share_token, expires_at, revoked_at, view_count, first_viewed_at, last_viewed_at, created_at, creator:profiles!lead_documents_created_by_fkey(full_name)')
    .eq('org_id', orgId).eq('lead_id', leadId).order('created_at', { ascending: false }).limit(50)
  return ((data ?? []) as unknown as {
    id: string; title: string; share_token: string; expires_at: string; revoked_at: string | null; view_count: number
    first_viewed_at: string | null; last_viewed_at: string | null; created_at: string; creator: { full_name: string } | null
  }[]).map((d) => ({
    id: d.id, title: d.title, token: d.share_token, expiresAt: d.expires_at, revokedAt: d.revoked_at, viewCount: d.view_count,
    firstViewedAt: d.first_viewed_at, lastViewedAt: d.last_viewed_at, createdAt: d.created_at, createdBy: d.creator?.full_name ?? null,
  }))
}

/** Turns the link off for good. */
export async function revokeDocument(orgId: string, leadId: string, documentId: string): Promise<boolean> {
  const { data } = await createServiceClient().from('lead_documents').update({ revoked_at: new Date().toISOString() })
    .eq('org_id', orgId).eq('lead_id', leadId).eq('id', documentId).is('revoked_at', null).select('id').maybeSingle()
  return !!data
}

// Link previews (WhatsApp, Facebook, Slack…) fetch a shared page before anyone opens it; they must not count.
const PREVIEW_AGENTS = /bot|crawl|spider|preview|whatsapp|facebookexternalhit|telegram|slack|discord|skype|linkedin|twitter|embedly|google|bing|headless/i

export function isLinkPreview(userAgent: string | null): boolean {
  return !userAgent || PREVIEW_AGENTS.test(userAgent)
}

export interface SharedDocument {
  title: string
  body: string
  orgName: string
  letterhead: Letterhead | null
  sharedBy: { name: string; phone: string | null } | null
  createdAt: string
}

/** The public page: the document behind a live link, or null (unknown, expired and revoked look the same). */
export async function openSharedDocument(token: string, userAgent: string | null): Promise<SharedDocument | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null
  const db = createServiceClient()
  let doc: { id: string; org_id: string; title: string; body: string; created_by: string | null; created_at: string } | null = null
  if (isLinkPreview(userAgent)) {
    const { data } = await db.from('lead_documents').select('id, org_id, title, body, created_by, created_at')
      .eq('share_token', token).is('revoked_at', null).gt('expires_at', new Date().toISOString()).maybeSingle()
    doc = data
  } else {
    const { data } = await db.rpc('record_document_view', { p_token: token })
    doc = (Array.isArray(data) ? data[0] : data) ?? null
  }
  if (!doc) return null
  const [{ data: org }, { data: by }, { data: frozen }] = await Promise.all([
    db.from('organisations').select('name').eq('id', doc.org_id).maybeSingle(),
    doc.created_by ? db.from('profiles').select('full_name, phone').eq('id', doc.created_by).maybeSingle() : Promise.resolve({ data: null }),
    db.from('lead_documents').select('letterhead').eq('id', doc.id).eq('org_id', doc.org_id).maybeSingle(),
  ])
  return {
    title: doc.title, body: doc.body, orgName: org?.name ?? '', createdAt: doc.created_at,
    letterhead: parseLetterhead(frozen?.letterhead),
    sharedBy: by ? { name: by.full_name, phone: by.phone } : null,
  }
}
