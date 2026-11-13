// app/(dashboard)/[orgSlug]/leads/[leadId]/page.tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Pencil, AlertTriangle, ExternalLink, Layers, Radio } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getLeadById, getLeadActivities } from '@/lib/dal/leads'
import { PageShell } from '@/components/layout/PageShell'
import { LeadStatusBadge } from '@/components/leads/LeadStatusBadge'
import { StatusTransitionPanel } from '@/components/leads/StatusTransitionPanel'
import type { ComponentProps } from 'react'
import { ActivityLog } from '@/components/leads/ActivityLog'
import { formatDate, formatBudgetRange } from '@/lib/utils/format'
import type { MemberRole, LeadStatus } from '@/types/database'

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
  low: { label: 'Low', className: 'bg-gray-100 text-gray-600' },
  medium: { label: 'Medium', className: 'bg-amber-50 text-amber-700' },
  high: { label: 'High', className: 'bg-red-50 text-red-700' },
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

  const lead = await getLeadById(leadId)
  if (!lead) notFound()

  const activities = await getLeadActivities(leadId)

  // Resolve viewer role
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let viewerRole: MemberRole = 'readonly'
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()

    if (profile) {
      const { data: membership } = await supabase
        .from('org_members')
        .select('role')
        .eq('profile_id', profile.id)
        .eq('org_id', lead.org_id)
        .single()

      viewerRole = (membership?.role ?? 'readonly') as MemberRole
    }
  }

  const canEdit = viewerRole !== 'readonly'
  const priority = PRIORITY_CONFIG[lead.priority as keyof typeof PRIORITY_CONFIG]
  const assignee = lead.assignee as { id: string; full_name: string } | null
  const project = lead.project as { id: string; name: string; slug: string } | null

  // Check if lead has integration source attribution
  const hasAttribution = Boolean(
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
          <Link
            href={`/${orgSlug}/leads/${leadId}/edit`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium text-[var(--foreground)] bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--surface-hover)] transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
            Edit
          </Link>
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
        <div className="mb-5 p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-[13px] text-amber-900 space-y-1">
            <p className="font-semibold">Flagged as Potential Duplicate Record</p>
            <p className="text-[12px] text-amber-800 leading-relaxed">
              This lead was ingested with matching contact details or external ID. In accordance with
              production data integrity rules, the record was retained without destructive merging or overwriting.
            </p>
            {lead.duplicate_of_id && (
              <div className="pt-1">
                <Link
                  href={`/${orgSlug}/leads/${lead.duplicate_of_id}`}
                  className="inline-flex items-center gap-1 text-[12px] font-medium text-amber-800 underline hover:text-amber-950"
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
                  <span className="inline-flex items-center gap-1 text-amber-700 text-[12px] bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
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
                <span className="text-[11px] px-2 py-0.5 rounded font-mono bg-blue-50 text-blue-700 border border-blue-200">
                  Stage 3G Architecture
                </span>
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
                      <a
                        href={lead.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[var(--brand)] hover:underline inline-flex items-center gap-1"
                      >
                        {lead.source_url}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    }
                  />
                )}
                <DetailRow
                  label="Deduplication"
                  value={
                    lead.is_duplicate ? (
                      <span className="text-amber-700 font-medium">
                        Duplicate (Reference: {lead.duplicate_of_id?.slice(0, 8)}...)
                      </span>
                    ) : (
                      <span className="text-emerald-700 font-medium">Original Record</span>
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
          <StatusTransitionPanel
            leadId={leadId}
            currentStatus={lead.status as LeadStatus}
          />
        </div>
      </div>
    </PageShell>
  )
}
