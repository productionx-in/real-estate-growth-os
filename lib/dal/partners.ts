// lib/dal/partners.ts
// Channel partner network (PR 1). Callers authorise the organisation first; every write goes through a
// database function (migration 20260058) that re-checks role, partnership state, sharing and ownership and
// writes both organisations' audit logs in one transaction. Reads are shaped per side: the developer never
// receives an agency's lead id, the agency never receives the developer's lead id, and a conflict never
// names whose claim it collided with.
import { createServiceClient } from '@/lib/supabase/server'
import type { DalResult } from '@/lib/dal/routing'
import {
  CONSENT_VERSION, type InventoryVisibility, type PartnerAction, type PartnershipStatus, type RegistrationStatus,
} from '@/lib/partners/rules'

type Db = ReturnType<typeof createServiceClient>
// The partner tables are not in the generated types; reads use an untyped handle.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const raw = (db: Db) => db as unknown as { from: (t: string) => any; rpc: (f: string, a: Record<string, unknown>) => any }

/** Database refusals the user may read ("partner: …"); anything else is generic. */
function fail(error: { message?: string; code?: string } | null): { success: false; error: string; status: number } {
  const m = error?.message?.match(/partner: (.+)$/)
  const status = error?.code === '42501' ? 403 : error?.code === 'P0002' ? 404 : error?.code === '23505' ? 409 : m ? 409 : 500
  if (!m) console.error('partner write failed:', error?.message)
  return { success: false, error: m ? m[1].charAt(0).toUpperCase() + m[1].slice(1) + '.' : 'Something went wrong. Please try again.', status }
}

async function call<T>(fn: string, args: Record<string, unknown>): Promise<DalResult<T>> {
  const { data, error } = await raw(createServiceClient()).rpc(fn, args)
  if (error) return fail(error)
  return { success: true, data: data as T }
}

// ── Writes ──────────────────────────────────────────────────────────────────────────────────────
export const ensurePartnerCode = (agencyOrgId: string, actorProfileId: string) =>
  call<string>('partner_ensure_code', { p_agency: agencyOrgId, p_actor: actorProfileId })

export const requestPartnership = (developerOrgId: string, actorProfileId: string, code: string) =>
  call<string>('partner_request', { p_developer: developerOrgId, p_actor: actorProfileId, p_code: code })

export const setPartnershipStatus = (orgId: string, actorProfileId: string, partnershipId: string, action: PartnerAction) =>
  call<PartnershipStatus>('partner_set_status', { p_org: orgId, p_actor: actorProfileId, p_partnership: partnershipId, p_action: action })

export const shareProject = (developerOrgId: string, actorProfileId: string, partnershipId: string, projectId: string, visibility: InventoryVisibility | null) =>
  call<InventoryVisibility | null>('partner_share_project', {
    p_developer: developerOrgId, p_actor: actorProfileId, p_partnership: partnershipId, p_project: projectId, p_visibility: visibility,
  })

export interface SubmitOutcome {
  outcome: 'submitted' | 'already_submitted' | 'conflict'
  registration_id: string
  status: RegistrationStatus
  protected_until: string | null
}
export const submitRegistration = (input: {
  agencyOrgId: string; actorProfileId: string; partnershipId: string; projectId: string; agencyLeadId: string; note: string | null; consent: boolean
}) => call<SubmitOutcome>('partner_submit_registration', {
  p_agency: input.agencyOrgId, p_actor: input.actorProfileId, p_partnership: input.partnershipId, p_project: input.projectId,
  p_agency_lead: input.agencyLeadId, p_note: input.note, p_consent: input.consent, p_consent_version: CONSENT_VERSION,
})

export interface ReviewOutcome { status: 'accepted' | 'rejected'; developer_lead_id?: string; protected_until?: string }
export const reviewRegistration = (developerOrgId: string, actorProfileId: string, registrationId: string, accept: boolean, reason: string | null) =>
  call<ReviewOutcome>('partner_review_registration', {
    p_developer: developerOrgId, p_actor: actorProfileId, p_registration: registrationId, p_accept: accept, p_reason: reason,
  })

// ── Reads ───────────────────────────────────────────────────────────────────────────────────────
export async function getPartnerCode(orgId: string): Promise<string | null> {
  const { data } = await createServiceClient().from('organisations').select('partner_code').eq('id', orgId).maybeSingle()
  return (data as { partner_code?: string | null } | null)?.partner_code ?? null
}

export interface SharedProject { projectId: string; name: string; city: string | null; visibility: InventoryVisibility }
export interface PartnershipView {
  id: string
  side: 'developer' | 'agency'
  status: PartnershipStatus
  partnerName: string
  protectionDays: number
  pausedByMe: boolean
  createdAt: string
  activatedAt: string | null
  /** Developer: every project currently shared. Agency: only while the partnership is active. */
  projects: SharedProject[]
}

export async function listPartnerships(orgId: string): Promise<PartnershipView[]> {
  const db = raw(createServiceClient())
  const { data: rows } = await db.from('org_partnerships')
    .select('id, developer_org_id, agency_org_id, status, protection_days, paused_by_org_id, created_at, activated_at')
    .or(`developer_org_id.eq.${orgId},agency_org_id.eq.${orgId}`)
    .order('created_at', { ascending: false }).limit(200)
  type Row = { id: string; developer_org_id: string; agency_org_id: string; status: PartnershipStatus; protection_days: number; paused_by_org_id: string | null; created_at: string; activated_at: string | null }
  const list = (rows ?? []) as Row[]
  if (!list.length) return []
  const partnerIds = [...new Set(list.map((r) => (r.developer_org_id === orgId ? r.agency_org_id : r.developer_org_id)))]
  const [{ data: orgs }, { data: shares }] = await Promise.all([
    createServiceClient().from('organisations').select('id, name').in('id', partnerIds),
    db.from('partnership_projects').select('partnership_id, inventory_visibility, project:projects(id, name, city)')
      .in('partnership_id', list.map((r) => r.id)).is('revoked_at', null),
  ])
  const name = new Map((orgs ?? []).map((o) => [o.id, o.name]))
  type Share = { partnership_id: string; inventory_visibility: InventoryVisibility; project: { id: string; name: string; city: string | null } | null }
  return list.map((r) => {
    const side = r.developer_org_id === orgId ? 'developer' : 'agency'
    const projects = side === 'agency' && r.status !== 'active' ? [] : ((shares ?? []) as Share[])
      .filter((s) => s.partnership_id === r.id && s.project)
      .map((s) => ({ projectId: s.project!.id, name: s.project!.name, city: s.project!.city, visibility: s.inventory_visibility }))
    return {
      id: r.id, side, status: r.status, partnerName: name.get(side === 'developer' ? r.agency_org_id : r.developer_org_id) ?? 'Partner',
      protectionDays: r.protection_days, pausedByMe: r.paused_by_org_id === orgId, createdAt: r.created_at, activatedAt: r.activated_at, projects,
    }
  })
}

export interface DeveloperRegistrationView {
  id: string; status: RegistrationStatus; agencyName: string; projectName: string | null
  buyerName: string; buyerPhone: string; note: string | null; submittedAt: string
  protectedUntil: string | null; rejectionReason: string | null; developerLeadId: string | null
}
/** The developer's queue. Conflicted attempts are listed without saying whose claim they hit. Never the agency's lead id. */
export async function listRegistrationsForDeveloper(orgId: string): Promise<DeveloperRegistrationView[]> {
  const { data } = await raw(createServiceClient()).from('deal_registrations')
    .select('id, status, agency_org_id, buyer_name, buyer_phone, note, submitted_at, protected_until, rejection_reason, developer_lead_id, project:projects(name)')
    .eq('developer_org_id', orgId).order('submitted_at', { ascending: false }).limit(500)
  type Row = { id: string; status: RegistrationStatus; agency_org_id: string; buyer_name: string; buyer_phone: string; note: string | null; submitted_at: string; protected_until: string | null; rejection_reason: string | null; developer_lead_id: string | null; project: { name: string } | null }
  const rows = (data ?? []) as Row[]
  const { data: orgs } = rows.length
    ? await createServiceClient().from('organisations').select('id, name').in('id', [...new Set(rows.map((r) => r.agency_org_id))])
    : { data: [] }
  const name = new Map((orgs ?? []).map((o) => [o.id, o.name]))
  return rows.map((r) => ({
    id: r.id, status: r.status, agencyName: name.get(r.agency_org_id) ?? 'Partner agency', projectName: r.project?.name ?? null,
    buyerName: r.buyer_name, buyerPhone: r.buyer_phone, note: r.note, submittedAt: r.submitted_at,
    protectedUntil: r.protected_until, rejectionReason: r.rejection_reason, developerLeadId: r.developer_lead_id,
  }))
}

export interface AgencyRegistrationView {
  id: string; status: RegistrationStatus; developerName: string; projectName: string | null
  buyerName: string; agencyLeadId: string | null; submittedAt: string; protectedUntil: string | null; rejectionReason: string | null
}
/** The agency's registrations: its own buyers and their status. Never the developer's lead id or notes. */
export async function listRegistrationsForAgency(orgId: string, agencyLeadId?: string): Promise<AgencyRegistrationView[]> {
  let q = raw(createServiceClient()).from('deal_registrations')
    .select('id, status, developer_org_id, buyer_name, agency_lead_id, submitted_at, protected_until, rejection_reason, project:projects(name)')
    .eq('agency_org_id', orgId)
  if (agencyLeadId) q = q.eq('agency_lead_id', agencyLeadId)
  const { data } = await q.order('submitted_at', { ascending: false }).limit(500)
  type Row = { id: string; status: RegistrationStatus; developer_org_id: string; buyer_name: string; agency_lead_id: string | null; submitted_at: string; protected_until: string | null; rejection_reason: string | null; project: { name: string } | null }
  const rows = (data ?? []) as Row[]
  const { data: orgs } = rows.length
    ? await createServiceClient().from('organisations').select('id, name').in('id', [...new Set(rows.map((r) => r.developer_org_id))])
    : { data: [] }
  const name = new Map((orgs ?? []).map((o) => [o.id, o.name]))
  return rows.map((r) => ({
    id: r.id, status: r.status, developerName: name.get(r.developer_org_id) ?? 'Developer', projectName: r.project?.name ?? null,
    buyerName: r.buyer_name, agencyLeadId: r.agency_lead_id, submittedAt: r.submitted_at,
    // A conflicted attempt has no protection of its own; the date of the other claim is only returned at submission.
    protectedUntil: r.status === 'accepted' ? r.protected_until : null, rejectionReason: r.rejection_reason,
  }))
}

export interface PartnerUnit {
  unitId: string; unitNumber: string; tower: string | null; floor: number | null; configuration: string | null
  category: string; available: boolean
  /** Only when the developer shares prices for this project. */
  price?: number | null
}
/**
 * Inventory of a project shared with this agency, at the level the developer chose. Refused (null) unless the
 * partnership is active, belongs to this agency, and the project is shared with visibility above "none".
 * Prices are read from the database only when the level is "availability_and_price".
 */
export async function partnerInventory(agencyOrgId: string, partnershipId: string, projectId: string): Promise<PartnerUnit[] | null> {
  const db = raw(createServiceClient())
  const { data: p } = await db.from('org_partnerships').select('id, developer_org_id, status')
    .eq('id', partnershipId).eq('agency_org_id', agencyOrgId).maybeSingle()
  if (!p || p.status !== 'active') return null
  const { data: share } = await db.from('partnership_projects').select('inventory_visibility')
    .eq('partnership_id', partnershipId).eq('project_id', projectId).is('revoked_at', null).maybeSingle()
  const vis = share?.inventory_visibility as InventoryVisibility | undefined
  if (!vis || vis === 'none') return null
  const withPrice = vis === 'availability_and_price'
  const columns = `id, unit_number, tower_name, floor_number, bhk_config, category, status${withPrice ? ', total_price' : ''}`
  const { data } = await createServiceClient().from('inventory_items').select(columns)
    .eq('org_id', p.developer_org_id).eq('project_id', projectId).order('unit_number').limit(2000)
  type U = { id: string; unit_number: string; tower_name: string | null; floor_number: number | null; bhk_config: string | null; category: string; status: string; total_price?: number | null }
  return ((data ?? []) as unknown as U[]).map((u) => ({
    unitId: u.id, unitNumber: u.unit_number, tower: u.tower_name, floor: u.floor_number, configuration: u.bhk_config,
    category: u.category, available: u.status === 'available', ...(withPrice ? { price: u.total_price ?? null } : {}),
  }))
}

/** What an agency can register a buyer for: active partnerships and their shared projects. */
export async function registrationTargets(agencyOrgId: string): Promise<{ partnershipId: string; developerName: string; projects: { id: string; name: string }[] }[]> {
  return (await listPartnerships(agencyOrgId))
    .filter((p) => p.side === 'agency' && p.status === 'active' && p.projects.length > 0)
    .map((p) => ({ partnershipId: p.id, developerName: p.partnerName, projects: p.projects.map((x) => ({ id: x.projectId, name: x.name })) }))
}
