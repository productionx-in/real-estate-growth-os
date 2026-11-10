// app/(dashboard)/[orgSlug]/leads/[leadId]/page.tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Pencil } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getLeadById, getLeadActivities } from '@/lib/dal/leads'
import { PageShell } from '@/components/layout/PageShell'
import { LeadStatusBadge } from '@/components/leads/LeadStatusBadge'
import { StatusTransitionPanel } from '@/components/leads/StatusTransitionPanel'
import { ActivityLog } from '@/components/leads/ActivityLog'
import { formatDate, formatBudgetRange } from '@/lib/utils/format'
import type { MemberRole, LeadStatus } from '@/types/database'

export const metadata: Metadata = { title: 'Lead Detail' }

export const instant = false;

interface PageProps {
  params: Promise<{ orgSlug: string; leadId: string }>
}

const SOURCE_LABELS: Record<string, string> = {
  website: 'Website', meta_ads: 'Meta Ads', google_ads: 'Google Ads',
  '99acres': '99acres', housing: 'Housing.com', magicbricks: 'Magicbricks',
  whatsapp: 'WhatsApp', referral: 'Referral', walk_in: 'Walk-in',
  csv_import: 'CSV Import', other: 'Other',
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
      <dd className="text-[13px] text-[var(--foreground)]">{value}</dd>
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

  const isManager = ['owner', 'admin', 'manager'].includes(viewerRole)
  const canEdit = viewerRole !== 'readonly'
  const priority = PRIORITY_CONFIG[lead.priority as keyof typeof PRIORITY_CONFIG]
  const assignee = lead.assignee as { id: string; full_name: string } | null
  const project = lead.project as { id: string; name: string; slug: string } | null

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
                ) : '—'
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
          <ActivityLog leadId={leadId} activities={activities as any} />
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
