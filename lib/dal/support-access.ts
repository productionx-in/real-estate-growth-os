// lib/dal/support-access.ts
// RE by PX: support access grants — the only path by which platform staff see a customer's business data.
// Rules live in migration 20260046 (service-role functions). Callers authorise first:
//   - platform side: authenticatePlatformAdmin([...], true)  (role + MFA)
//   - customer side: authorizeOrgAccess(orgId, ['owner', 'admin'])
// The functions re-check the essentials themselves (who may decide, who may end, expiry), so a bug in a route
// cannot widen access.
import { createServiceClient } from '@/lib/supabase/server'
import type { SupportGrantStatus } from '@/types/database'
import { recordOrgAudit } from './org-audit'

export const SUPPORT_REQUEST_ROLES = ['super_admin', 'support_agent'] as const
export const SUPPORT_DURATIONS = [15, 30, 60, 120, 240, 480, 1440] as const
export const EMERGENCY_MAX_MINUTES = 60

export interface SupportGrant {
  id: string
  org_id: string
  requested_by: string
  requested_by_label: string
  reason: string
  duration_minutes: number
  status: SupportGrantStatus
  emergency: boolean
  decided_at: string | null
  decision_note: string | null
  expires_at: string | null
  revoked_at: string | null
  created_at: string
}

const GRANT_COLUMNS =
  'id, org_id, requested_by, requested_by_label, reason, duration_minutes, status, emergency, decided_at, decision_note, expires_at, revoked_at, created_at'

/** Whether a grant gives access at this moment. */
export function isGrantLive(g: Pick<SupportGrant, 'status' | 'expires_at'>, now = new Date()): boolean {
  return g.status === 'approved' && !!g.expires_at && new Date(g.expires_at) > now
}

/** Customer-facing state of a grant, including approved grants that have run out. */
export function grantState(g: Pick<SupportGrant, 'status' | 'expires_at'>, now = new Date()): SupportGrantStatus | 'expired' {
  return g.status === 'approved' && !isGrantLive(g, now) ? 'expired' : g.status
}

type Result<T> = { ok: true; data: T } | { ok: false; error: string; status: number }

/** Maps the database's own refusals to HTTP statuses and readable messages. */
function fromDbError(message: string): { ok: false; error: string; status: number } {
  const text = message.replace(/^support grant: /, '')
  if (/not found/.test(message)) return { ok: false, error: 'Request not found.', status: 404 }
  if (/only /.test(message)) return { ok: false, error: text.charAt(0).toUpperCase() + text.slice(1) + '.', status: 403 }
  if (/uq_support_grants_one_pending/.test(message)) {
    return { ok: false, error: 'You already have an open request for this organisation.', status: 409 }
  }
  if (/check constraint|violates check/.test(message)) return { ok: false, error: 'Invalid request.', status: 400 }
  return { ok: false, error: text.charAt(0).toUpperCase() + text.slice(1), status: 400 }
}

export async function requestSupportAccess(input: {
  orgId: string
  userId: string
  label: string
  reason: string
  minutes: number
}): Promise<Result<{ id: string }>> {
  const service = createServiceClient()
  const { data, error } = await service.rpc('request_support_access', {
    p_org: input.orgId, p_user: input.userId, p_label: input.label, p_reason: input.reason, p_minutes: input.minutes,
  })
  if (error) return fromDbError(error.message)
  return { ok: true, data: { id: data as string } }
}

export async function decideSupportAccess(input: {
  grantId: string
  profileId: string
  userId: string
  label: string
  approve: boolean
  note?: string | null
}): Promise<Result<{ status: string; expires_at: string | null }>> {
  const service = createServiceClient()
  const { data, error } = await service.rpc('decide_support_access', {
    p_grant: input.grantId, p_profile: input.profileId, p_user: input.userId, p_label: input.label,
    p_approve: input.approve, p_note: input.note ?? null,
  })
  if (error) return fromDbError(error.message)
  return { ok: true, data: data as { status: string; expires_at: string | null } }
}

export async function emergencySupportAccess(input: {
  grantId: string
  userId: string
  label: string
  reason: string
  minutes: number
}): Promise<Result<{ status: string; expires_at: string | null }>> {
  const service = createServiceClient()
  const { data, error } = await service.rpc('emergency_support_access', {
    p_grant: input.grantId, p_user: input.userId, p_label: input.label, p_reason: input.reason, p_minutes: input.minutes,
  })
  if (error) return fromDbError(error.message)
  return { ok: true, data: data as { status: string; expires_at: string | null } }
}

export async function endSupportAccess(input: {
  grantId: string
  side: 'customer' | 'platform'
  userId: string
  profileId: string | null
  label: string
}): Promise<Result<{ status: string }>> {
  const service = createServiceClient()
  const { data, error } = await service.rpc('end_support_access', {
    p_grant: input.grantId, p_side: input.side, p_user: input.userId, p_profile: input.profileId, p_label: input.label,
  })
  if (error) return fromDbError(error.message)
  return { ok: true, data: { status: data as string } }
}

export async function getGrant(grantId: string): Promise<SupportGrant | null> {
  const service = createServiceClient()
  const { data } = await service.from('support_access_grants').select(GRANT_COLUMNS).eq('id', grantId).maybeSingle()
  return (data as SupportGrant | null) ?? null
}

/** Every request made about one organisation, newest first (customer view and platform view). */
export async function listGrantsForOrg(orgId: string, limit = 50): Promise<SupportGrant[]> {
  const service = createServiceClient()
  const { data } = await service
    .from('support_access_grants')
    .select(GRANT_COLUMNS)
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data ?? []) as SupportGrant[]
}

/** Live grants for one organisation (for the customer's "support has access" banner). */
export async function liveGrantsForOrg(orgId: string): Promise<SupportGrant[]> {
  const service = createServiceClient()
  const { data } = await service
    .from('support_access_grants')
    .select(GRANT_COLUMNS)
    .eq('org_id', orgId)
    .eq('status', 'approved')
    .gt('expires_at', new Date().toISOString())
  return (data ?? []) as SupportGrant[]
}

export async function activeGrantId(orgId: string, userId: string): Promise<string | null> {
  const service = createServiceClient()
  const { data } = await service.rpc('active_support_grant', { p_org: orgId, p_user: userId })
  return (data as string | null) ?? null
}

export interface SupportOverview {
  grant: { id: string; expires_at: string; emergency: boolean }
  organisation: { name: string; slug: string; type: string; lifecycle_state: string; plan: string | null }
  members: { full_name: string; role: string; status: string }[]
  leadsByStatus: Record<string, number>
  integrations: { provider: string; name: string; status: string; last_sync_at: string | null; last_error: string | null }[]
}

/**
 * Read-only diagnostic view of one organisation for a support person holding a live grant. Contact details,
 * lead names, phone numbers and credentials are deliberately not included. Each view is written to the
 * customer's audit log.
 */
export async function getSupportOverview(
  orgId: string,
  viewer: { userId: string; label: string }
): Promise<Result<SupportOverview>> {
  const grantId = await activeGrantId(orgId, viewer.userId)
  if (!grantId) return { ok: false, error: 'You need an approved, unexpired support grant for this organisation.', status: 403 }

  const service = createServiceClient()
  const [grant, org, members, leads, integrations] = await Promise.all([
    service.from('support_access_grants').select('id, expires_at, emergency').eq('id', grantId).single(),
    service.from('organisations').select('name, slug, type, lifecycle_state, plan').eq('id', orgId).single(),
    service.from('org_members').select('role, status, profile:profiles!org_members_profile_id_fkey(full_name)').eq('org_id', orgId),
    service.from('leads').select('status').eq('org_id', orgId).gte('created_at', new Date(Date.now() - 30 * 864e5).toISOString()),
    service.from('integration_connections').select('provider, name, status, last_sync_at, last_error').eq('org_id', orgId),
  ])
  const failed = [grant, org, members, leads, integrations].find((r) => r.error)
  if (failed?.error) {
    console.error('support overview query failed:', failed.error.message)
    return { ok: false, error: 'Could not load the organisation.', status: 500 }
  }

  const leadsByStatus: Record<string, number> = {}
  for (const l of leads.data ?? []) leadsByStatus[l.status] = (leadsByStatus[l.status] ?? 0) + 1

  await recordOrgAudit({
    orgId,
    action: 'support.data_viewed',
    actorKind: 'support',
    actorUserId: viewer.userId,
    actorLabel: viewer.label,
    targetType: 'support_grant',
    targetId: grantId,
    metadata: { view: 'overview' },
  })

  type MemberRow = { role: string; status: string; profile: { full_name: string } | { full_name: string }[] | null }
  return {
    ok: true,
    data: {
      grant: grant.data as SupportOverview['grant'],
      organisation: org.data as SupportOverview['organisation'],
      members: ((members.data ?? []) as MemberRow[]).map((m) => ({
        full_name: (Array.isArray(m.profile) ? m.profile[0]?.full_name : m.profile?.full_name) ?? 'Unknown',
        role: m.role,
        status: m.status,
      })),
      leadsByStatus,
      integrations: (integrations.data ?? []) as SupportOverview['integrations'],
    },
  }
}
