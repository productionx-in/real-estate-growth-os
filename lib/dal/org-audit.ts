// lib/dal/org-audit.ts
// RE: customer-visible audit trail (org_audit_logs).
//
// Records who changed access, configuration or data in an organisation. The table is append-only in the
// database (trigger), readable by the organisation's owners and admins, and written only from the server.
// Writing an audit entry never blocks the action it describes — a failure is logged loudly instead — except
// where a caller explicitly needs the write to succeed (platform actions use logPlatformAction for that).
import { createServiceClient } from '@/lib/supabase/server'
import type { Json } from '@/types/database'

export type OrgAuditActorKind = 'member' | 'platform' | 'support' | 'system'

export interface OrgAuditEntry {
  orgId: string
  action: string // "<area>.<verb>", lower_snake, e.g. "member.role_changed"
  actorKind?: OrgAuditActorKind
  actorUserId?: string | null
  actorProfileId?: string | null
  actorLabel?: string | null
  targetType?: string | null
  targetId?: string | null
  metadata?: Record<string, unknown>
  ipAddress?: string | null
  userAgent?: string | null
}

const ACTION_PATTERN = /^[a-z_]+\.[a-z_]+$/
const SENSITIVE_KEY = /secret|token|password|credential|api[_-]?key|authorization|signature/i

/** Removes values that must never reach an audit trail (secrets, tokens, credentials). */
export function sanitizeAuditMetadata(metadata: Record<string, unknown> | undefined): Record<string, unknown> {
  const clean: Record<string, unknown> = {}
  if (!metadata) return clean
  for (const [key, value] of Object.entries(metadata)) {
    if (SENSITIVE_KEY.test(key)) clean[key] = '[REDACTED]'
    else if (value && typeof value === 'object' && !Array.isArray(value)) {
      clean[key] = sanitizeAuditMetadata(value as Record<string, unknown>)
    } else clean[key] = value
  }
  return clean
}

/** Pulls the client address and agent from a request, for the audit entry. */
export function requestOrigin(request: { headers: Headers }): { ipAddress: string | null; userAgent: string | null } {
  const forwarded = request.headers.get('x-forwarded-for')
  const ipAddress = forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || null
  return { ipAddress, userAgent: request.headers.get('user-agent')?.slice(0, 400) ?? null }
}

export async function recordOrgAudit(entry: OrgAuditEntry): Promise<{ success: boolean; error?: string }> {
  if (!ACTION_PATTERN.test(entry.action)) {
    console.error(`org audit: refused malformed action "${entry.action}"`)
    return { success: false, error: 'malformed action' }
  }
  try {
    const service = createServiceClient()
    const { error } = await service.from('org_audit_logs').insert({
      org_id: entry.orgId,
      actor_kind: entry.actorKind ?? 'member',
      actor_user_id: entry.actorUserId ?? null,
      actor_profile_id: entry.actorProfileId ?? null,
      actor_label: entry.actorLabel ?? null,
      action: entry.action,
      target_type: entry.targetType ?? null,
      target_id: entry.targetId ?? null,
      metadata: sanitizeAuditMetadata(entry.metadata) as Json,
      ip_address: entry.ipAddress ?? null,
      user_agent: entry.userAgent ?? null,
    })
    if (error) {
      console.error('AUDIT WRITE FAILED (org_audit_logs):', entry.action, error.message)
      return { success: false, error: error.message }
    }
    return { success: true }
  } catch (err) {
    console.error('AUDIT WRITE FAILED (org_audit_logs):', entry.action, err)
    return { success: false, error: 'audit write failed' }
  }
}

/** Shorthand for an action taken by a signed-in member through an API route. */
export function auditMember(
  request: { headers: Headers },
  actor: { user: { id: string }; profile: { id: string; full_name: string } },
  orgId: string,
  action: string,
  target?: { type: string; id?: string | null },
  metadata?: Record<string, unknown>
) {
  return recordOrgAudit({
    orgId,
    action,
    actorKind: 'member',
    actorUserId: actor.user.id,
    actorProfileId: actor.profile.id,
    actorLabel: actor.profile.full_name,
    targetType: target?.type ?? null,
    targetId: target?.id ?? null,
    metadata,
    ...requestOrigin(request),
  })
}

export const AUDIT_AREAS = {
  member: 'Team members',
  invitation: 'Invitations',
  routing: 'Lead routing',
  integration: 'Integrations',
  lead: 'Leads (import, export, delete)',
  project: 'Projects',
  inventory: 'Inventory',
  organisation: 'Workspace status',
  support: 'Support access',
  module: 'Modules',
  partner: 'Partner network',
  billing: 'Plan & billing',
  settings: 'Workspace settings',
} as const
export type AuditArea = keyof typeof AUDIT_AREAS

export interface OrgAuditRow {
  id: string
  created_at: string
  actor_kind: OrgAuditActorKind
  actor_label: string | null
  action: string
  target_type: string | null
  target_id: string | null
  metadata: Record<string, unknown>
  ip_address: string | null
}

export const AUDIT_PAGE_SIZE = 50

/**
 * One page of an organisation's audit trail, newest first. Server-only: the caller must already have checked
 * that the viewer is an active owner or admin of `orgId`. Uses keyset pagination on created_at.
 */
export async function listOrgAudit(
  orgId: string,
  opts: { area?: AuditArea; before?: string } = {}
): Promise<{ rows: OrgAuditRow[]; nextBefore: string | null }> {
  const service = createServiceClient()
  let q = service
    .from('org_audit_logs')
    .select('id, created_at, actor_kind, actor_label, action, target_type, target_id, metadata, ip_address')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(AUDIT_PAGE_SIZE + 1)
  if (opts.area && opts.area in AUDIT_AREAS) q = q.like('action', `${opts.area}.%`)
  if (opts.before && !Number.isNaN(Date.parse(opts.before))) q = q.lt('created_at', opts.before)
  const { data, error } = await q
  if (error) {
    console.error('listOrgAudit failed:', error.message)
    return { rows: [], nextBefore: null }
  }
  const rows = (data ?? []) as OrgAuditRow[]
  const more = rows.length > AUDIT_PAGE_SIZE
  const page = more ? rows.slice(0, AUDIT_PAGE_SIZE) : rows
  return { rows: page, nextBefore: more ? page[page.length - 1].created_at : null }
}

const ACTION_LABELS: Record<string, string> = {
  'member.role_changed': 'Changed a member’s role',
  'campaign.created': 'Created a campaign',
  'campaign.updated': 'Changed a campaign draft',
  'campaign.deleted': 'Deleted a campaign draft',
  'campaign.sent': 'Sent a campaign',
  'campaign.cancelled': 'Cancelled a campaign',
  'segment.created': 'Created a lead segment',
  'segment.updated': 'Changed a lead segment',
  'segment.deleted': 'Deleted a lead segment',
  'segment.leads_added': 'Added leads to a list',
  'segment.leads_removed': 'Removed leads from a list',
  'member.deactivated': 'Deactivated a member',
  'invitation.created': 'Invited a team member',
  'invitation.revoked': 'Revoked an invitation',
  'invitation.accepted': 'Joined the workspace',
  'routing.rule_created': 'Created a routing rule',
  'routing.rule_updated': 'Edited a routing rule',
  'routing.rule_deleted': 'Deleted a routing rule',
  'routing.team_created': 'Created a sales team',
  'routing.team_updated': 'Edited a sales team',
  'routing.team_deleted': 'Deleted a sales team',
  'routing.team_member_set': 'Changed sales-team membership',
  'routing.team_member_removed': 'Removed someone from a sales team',
  'routing.response_settings_updated': 'Changed response-time targets',
  'integration.connected': 'Connected an integration',
  'integration.updated': 'Edited an integration',
  'integration.disconnected': 'Disconnected an integration',
  'integration.webhook_secret_rotated': 'Rotated a webhook secret',
  'integration.webhook_secret_invalidated': 'Invalidated the previous webhook secret',
  'integration.website_updated': 'Changed website enquiry settings',
  'document.template_saved': 'Saved a document template',
  'document.template_removed': 'Removed a document template',
  'lead.imported': 'Imported leads',
  'lead.exported': 'Exported leads',
  'lead.deleted': 'Deleted a lead',
  'project.deleted': 'Deleted a project',
  'organisation.lifecycle_changed': 'Workspace status changed',
  'module.enabled': 'Module switched on',
  'module.disabled': 'Module switched off',
  'support.access_requested': 'RE support asked for access',
  'support.access_approved': 'Approved support access',
  'support.access_denied': 'Denied support access',
  'support.access_revoked': 'Ended support access',
  'support.access_cancelled': 'Support withdrew its request',
  'support.emergency_access': 'Emergency support access granted',
  'support.data_viewed': 'Support viewed the workspace overview',
  'partner.code_created': 'Created the agency partner code',
  'partner.requested': 'Partnership requested',
  'partner.accepted': 'Partnership accepted',
  'partner.rejected': 'Partnership request declined',
  'partner.cancelled': 'Partnership request withdrawn',
  'partner.paused': 'Partnership paused',
  'partner.resumed': 'Partnership resumed',
  'partner.ended': 'Partnership ended',
  'partner.project_shared': 'Project shared with a partner',
  'partner.project_unshared': 'Project no longer shared with a partner',
  'partner.project_visibility_changed': 'Changed what a partner sees of a project',
  'partner.registration_submitted': 'Buyer registered with a developer',
  'partner.registration_conflict': 'Buyer registration found already registered',
  'partner.registration_accepted': 'Buyer registration accepted',
  'partner.registration_rejected': 'Buyer registration rejected',
  'partner.registrations_withdrawn': 'Pending registrations withdrawn (partnership ended)',
  'partner.developer_lead_created': 'Lead created from an accepted registration',
  'billing.trial_started': 'Free trial started',
  'billing.transition_started': '30-day transition to a paid plan started',
  'billing.invoice_issued': 'Invoice issued',
  'billing.payment_received': 'Payment received',
  'billing.payment_overdue': 'Plan payment overdue (7-day grace)',
  'billing.subscription_expired': 'Plan ended — workspace read-only',
}

export function describeAuditAction(action: string): string {
  return ACTION_LABELS[action] ?? action.replace('.', ': ').replace(/_/g, ' ')
}
