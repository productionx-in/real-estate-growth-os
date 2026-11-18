// app/(dashboard)/[orgSlug]/leads/[leadId]/page.tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Pencil, AlertTriangle, ExternalLink, Layers, MessageCircle, Radio } from 'lucide-react'
import { getLeadById, getLeadActivities } from '@/lib/dal/leads'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { PageShell } from '@/components/layout/PageShell'
import { LeadStatusBadge } from '@/components/leads/LeadStatusBadge'
import { StatusTransitionPanel } from '@/components/leads/StatusTransitionPanel'
import type { ComponentProps } from 'react'
import { ActivityLog } from '@/components/leads/ActivityLog'
import { LeadWorkPanel } from '@/components/leads/LeadWorkPanel'
import { listLeadTasks } from '@/lib/dal/follow-ups'
import { formatDate, formatBudgetRange } from '@/lib/utils/format'
import type { MemberRole, LeadStatus } from '@/types/database'
import { createServiceClient } from '@/lib/supabase/server'
import { getModules } from '@/lib/auth/entitlements'
import { ScheduleVisitDialog } from '@/components/visits/ScheduleVisitDialog'
import { safeHttpUrl, visitDetails } from '@/lib/integrations/website/attribution'
import { LeadDocuments } from '@/components/documents/LeadDocuments'
import { listLeadDocuments, listTemplates } from '@/lib/dal/documents'
import { inr } from '@/lib/documents/merge'

export const metadata: Metadata = { title: 'Lead Detail' }

interface PageProps {
  params: Promise<{ orgSlug: string; leadId: string }>
}

const SOURCE_LABELS: Record<string, string> = {
  website: 'Website',
  meta_ads: 'Meta Ads',
  google_ads: 'Google Ads',
  '99acres': '99acres',
  housing: 'Housing.com',
  magicbricks: 'Magicbricks',
  whatsapp: 'WhatsApp',
  referral: 'Referral',
  walk_in: 'Walk-in',
  csv_import: 'CSV Import',
  other: 'Other',
}

const PLATFORM_LABELS: Record<string, string> = {
  meta_ads: 'Meta Lead Ads (FB / IG)',
  google_ads: 'Google Ads',
  website_webhook: 'Website Enquiry Webhook',
  whatsapp_cloud: 'WhatsApp Cloud API',
  property_portal_99acres: '99acres Portal',
  property_portal_magicbricks: 'Magicbricks Portal',
  property_portal_housing: 'Housing.com Portal',
  manual: 'Manual Entry',
  other: 'External Channel',
}

const PRIORITY_CONFIG = {
  low: { label: 'Low', className: 'bg-surface-hover text-muted' },
  medium: { label: 'Medium', className: 'bg-warning-bg text-warning' },
  high: { label: 'High', className: 'bg-danger-bg text-danger' },
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-2.5 border-b border-[var(--border)] last:border-0">
      <dt className="w-28 flex-shrink-0 text-[12px] font-medium text-[var(--foreground-muted)]">
        {label}
      </dt>
      <dd className="text-[13px] text-[var(--foreground)] break-words min-w-0 flex-1">{value}</dd>
    </div>
  )
}

export default async function LeadDetailPage({ params }: PageProps) {
  const { orgSlug, leadId } = await params
  const { org, role, profile } = await getVerifiedWorkspace(orgSlug)

  const lead = await getLeadById(leadId)
  if (!lead || lead.org_id !== org.id) notFound()

  // Enforce server-authoritative role visibility:
  if (role === 'sales_exec' && lead.assigned_to !== profile.id) {
    notFound()
  }

  const service = createServiceClient()
  const [activities, tasks, visitProjects, visitAgents, waConversation] = await Promise.all([
    getLeadActivities(leadId), listLeadTasks(org.id, leadId),
    service.from('projects').select('id, name').eq('org_id', org.id).order('name'),
    service.from('org_members').select('profile_id, profile:profiles!org_members_profile_id_fkey(full_name)').eq('org_id', org.id).eq('status', 'active').in('role', ['owner', 'admin', 'manager', 'sales_exec']),
    service.from('whatsapp_conversations').select('id').eq('org_id', org.id).eq('lead_id', leadId)
      .order('last_message_at', { ascending: false, nullsFirst: false }).limit(1).maybeSingle(),
  ])
  const salesOn = (await getModules(org.id)).sales
  // Documents (sales module): what was shared with this buyer, templates, and units to quote.
  const [leadDocs, docTemplates, docUnits] = salesOn
    ? await Promise.all([
        listLeadDocuments(org.id, leadId),
        listTemplates(org.id),
        service.from('inventory_items').select('id, unit_number, tower_name, bhk_config, total_price, project:projects(name)')
          .eq('org_id', org.id).in('status', ['available', 'blocked'])
          .order('unit_number').limit(500),
      ])
    : [[], [], { data: [] }]
  type UnitRow = { id: string; unit_number: string; tower_name: string | null; bhk_config: string | null; total_price: number | null; project: { name: string } | null }
  type AgentRow = { profile_id: string; profile: { full_name: string } | { full_name: string }[] | null }
  const viewerRole: MemberRole = role
  const canEdit = viewerRole !== 'readonly'
  // Working a lead (calls, outcomes, follow-ups): managers and above, or the salesperson it is assigned to.
  const canWork = canEdit && (viewerRole !== 'sales_exec' || lead.assigned_to === profile.id)
  const priority = PRIORITY_CONFIG[lead.priority as keyof typeof PRIORITY_CONFIG]
  const assignee = lead.assignee as { id: string; full_name: string } | null
  const project = lead.project as { id: string; name: string; slug: string } | null

  // Source details arrive from public web pages: only http(s) URLs become links (never javascript: or data:).
  const landingUrl = safeHttpUrl(lead.source_url)
  const visit = visitDetails(lead.source_metadata)

  // Check if lead has integration source attribution
  const hasAttribution = visit.length > 0 || Boolean(
    lead.source_platform ||
    lead.campaign_name ||
    lead.ad_name ||
    lead.form_name ||
    lead.external_lead_id ||
    lead.source_url ||
    lead.is_duplicate
  )

  return (
    <PageShell
      title={lead.name}
      description={
        <span className="flex items-center gap-2">
          <LeadStatusBadge status={lead.status as LeadStatus} />
          <span className="text-[var(--foreground-subtle)]">·</span>
          <span>Added {formatDate(lead.created_at)}</span>
        </span>
      }
      actions={
        canEdit ? (
          <>
          {waConversation.data && (
            <Link
              href={`/${orgSlug}/inbox?c=${waConversation.data.id}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium text-[var(--foreground)] bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--surface-hover)] transition-colors"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              WhatsApp chat
            </Link>
          )}
          {canWork && salesOn && (
            <ScheduleVisitDialog
              fixedLead={{ id: lead.id, label: lead.name }}
              projects={(visitProjects.data ?? []).map((p) => ({ id: p.id, label: p.name }))}
              agents={((visitAgents.data ?? []) as AgentRow[]).map((m) => ({ id: m.profile_id, label: (Array.isArray(m.profile) ? m.profile[0]?.full_name : m.profile?.full_name) ?? 'Unknown' }))}
              defaultProjectId={lead.project_id}
              defaultAgentId={lead.assigned_to ?? profile.id}
              canPickAgent={viewerRole !== 'sales_exec'}
            />
          )}
          <Link
            href={`/${orgSlug}/leads/${leadId}/edit`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium text-[var(--foreground)] bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--surface-hover)] transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
            Edit
          </Link>
          </>
        ) : undefined
      }
    >
      {/* Back link */}
      <div className="mb-5">
        <Link
          href={`/${orgSlug}/leads`}
          className="inline-flex items-center gap-1.5 text-[13px] text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to leads
        </Link>
      </div>

      {/* Duplicate Alert Banner if flagged */}
      {lead.is_duplicate && (
        <div className="mb-5 p-4 bg-warning-bg border border-warning/30 rounded-lg flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
          <div className="text-[13px] text-warning space-y-1">
            <p className="font-semibold">Flagged as Potential Duplicate Record</p>
            <p className="text-[12px] text-warning leading-relaxed">
              This lead was ingested with matching contact details or external ID. In accordance with
              production data integrity rules, the record was retained without destructive merging or overwriting.
            </p>
            {lead.duplicate_of_id && (
              <div className="pt-1">
                <Link
                  href={`/${orgSlug}/leads/${lead.duplicate_of_id}`}
                  className="inline-flex items-center gap-1 text-[12px] font-medium text-warning underline hover:text-warning"
                >
                  View Canonical Original Lead ({lead.duplicate_of_id.slice(0, 8)}...)
                  <ExternalLink className="w-3 h-3" />
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Left: lead info + activity ── */}
        <div className="lg:col-span-2 space-y-5">
          {/* Contact info */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
            <h2 className="text-[13px] font-semibold text-[var(--foreground)] mb-3">
              Contact information
            </h2>
            <dl>
              <DetailRow label="Phone" value={
                <a href={`tel:${lead.phone}`} className="text-[var(--brand)] hover:underline">
                  {lead.phone}
                </a>
              } />
              {lead.email && (
                <DetailRow label="Email" value={
                  <a href={`mailto:${lead.email}`} className="text-[var(--brand)] hover:underline">
                    {lead.email}
                  </a>
                } />
              )}
              <DetailRow label="Source" value={SOURCE_LABELS[lead.source] ?? lead.source} />
              <DetailRow label="Priority" value={
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${priority?.className ?? ''}`}>
                  {priority?.label ?? lead.priority}
                </span>
              } />
              <DetailRow label="Project" value={
                project ? (
                  <Link href={`/${orgSlug}/projects/${project.id}`} className="text-[var(--brand)] hover:underline">
                    {project.name}
                  </Link>
                ) : (
                  <span className="inline-flex items-center gap-1 text-warning text-[12px] bg-warning-bg px-2 py-0.5 rounded border border-warning/30">
                    <Radio className="w-3 h-3" />
                    Unmapped / Direct Org Lead
                  </span>
                )
              } />
              <DetailRow label="Budget" value={formatBudgetRange(lead.budget_min, lead.budget_max)} />
              <DetailRow label="Assigned to" value={
                assignee ? (
                  <div className="flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-full bg-[var(--brand-light)] flex items-center justify-center">
                      <span className="text-[9px] font-bold text-[var(--brand)]">
                        {assignee.full_name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    {assignee.full_name}
                  </div>
                ) : (
                  <span className="text-[var(--foreground-subtle)] italic">Unassigned</span>
                )
              } />
            </dl>
          </div>

          {/* Campaign & Integration Attribution Card (Stage 3G) */}
          {hasAttribution && (
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-[var(--brand)]" />
                  <h2 className="text-[13px] font-semibold text-[var(--foreground)]">
                    Lead Source & Campaign Attribution
                  </h2>
                </div>
              </div>
              <dl>
                {lead.source_platform && (
                  <DetailRow
                    label="Platform"
                    value={
                      <span className="font-medium text-[var(--foreground)]">
                        {PLATFORM_LABELS[lead.source_platform] ?? lead.source_platform}
                      </span>
                    }
                  />
                )}
                {lead.campaign_name && (
                  <DetailRow
                    label="Campaign"
                    value={
                      <div>
                        <span className="font-medium">{lead.campaign_name}</span>
                        {lead.campaign_id && (
                          <span className="ml-2 text-[11px] text-[var(--foreground-muted)] font-mono">
                            (ID: {lead.campaign_id})
                          </span>
                        )}
                      </div>
                    }
                  />
                )}
                {lead.ad_name && (
                  <DetailRow
                    label="Ad Creative"
                    value={
                      <div>
                        <span>{lead.ad_name}</span>
                        {lead.ad_id && (
                          <span className="ml-2 text-[11px] text-[var(--foreground-muted)] font-mono">
                            (ID: {lead.ad_id})
                          </span>
                        )}
                      </div>
                    }
                  />
                )}
                {lead.form_name && (
                  <DetailRow
                    label="Lead Form"
                    value={
                      <div>
                        <span>{lead.form_name}</span>
                        {lead.form_id && (
                          <span className="ml-2 text-[11px] text-[var(--foreground-muted)] font-mono">
                            (ID: {lead.form_id})
                          </span>
                        )}
                      </div>
                    }
                  />
                )}
                {lead.external_lead_id && (
                  <DetailRow
                    label="External Lead ID"
                    value={
                      <span className="font-mono text-[12px] bg-[var(--surface-hover)] px-1.5 py-0.5 rounded">
                        {lead.external_lead_id}
                      </span>
                    }
                  />
                )}
                {lead.source_url && (
                  <DetailRow
                    label="Landing URL"
                    value={
                      landingUrl ? (
                        <a
                          href={landingUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="text-[var(--brand)] hover:underline inline-flex items-center gap-1 break-all"
                        >
                          {landingUrl}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="break-all text-[var(--foreground-muted)]">{lead.source_url}</span>
                      )
                    }
                  />
                )}
                {visit.map((row) => (
                  <DetailRow
                    key={row.label}
                    label={row.label}
                    value={
                      row.href ? (
                        <a href={row.href} target="_blank" rel="noreferrer noopener" className="text-[var(--brand)] hover:underline break-all">
                          {row.value}
                        </a>
                      ) : (
                        <span className="break-all">{row.value}</span>
                      )
                    }
                  />
                ))}
                <DetailRow
                  label="Deduplication"
                  value={
                    lead.is_duplicate ? (
                      <span className="text-warning font-medium">
                        Duplicate (Reference: {lead.duplicate_of_id?.slice(0, 8)}...)
                      </span>
                    ) : (
                      <span className="text-success font-medium">Original Record</span>
                    )
                  }
                />
              </dl>
            </div>
          )}

          {/* Notes */}
          {lead.notes && (
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
              <h2 className="text-[13px] font-semibold text-[var(--foreground)] mb-2">Notes</h2>
              <p className="text-[13px] text-[var(--foreground-muted)] whitespace-pre-wrap leading-relaxed">
                {lead.notes}
              </p>
            </div>
          )}

          {/* Activity log */}
          <ActivityLog
            leadId={leadId}
            activities={(activities ?? []) as unknown as ComponentProps<typeof ActivityLog>['activities']}
          />
        </div>

        {/* ── Right: status transitions ── */}
        <div className="space-y-5">
          {canWork && (
            <LeadWorkPanel
              leadId={leadId}
              phone={lead.phone}
              slaState={lead.sla_state}
              slaDueAt={lead.sla_due_at}
              assignedAt={lead.assigned_at}
              firstActionAt={lead.first_action_at}
              tasks={tasks}
            />
          )}
          <StatusTransitionPanel
            leadId={leadId}
            currentStatus={lead.status as LeadStatus}
          />
          {salesOn && (
            <LeadDocuments
              leadId={leadId}
              leadName={lead.name}
              leadPhone={lead.phone}
              documents={leadDocs.map((d) => ({ ...d, live: !d.revokedAt && new Date(d.expiresAt) > new Date() }))}
              templates={docTemplates.map((t) => ({ id: t.id, label: t.name }))}
              units={((docUnits.data ?? []) as unknown as UnitRow[]).map((u) => ({
                id: u.id,
                label: [u.project?.name, u.tower_name, u.unit_number, u.bhk_config, u.total_price != null ? inr(u.total_price) : null].filter(Boolean).join(' · '),
              }))}
              canWork={canWork}
            />
          )}
        </div>
      </div>
    </PageShell>
  )
}
