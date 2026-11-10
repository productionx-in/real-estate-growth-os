// app/(dashboard)/[orgSlug]/projects/[projectId]/page.tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { PageShell } from '@/components/layout/PageShell'
import { LeadsTable } from '@/components/leads/LeadsTable'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatDate } from '@/lib/utils/format'
import type { MemberRole } from '@/types/database'

export const metadata: Metadata = { title: 'Project' }

interface PageProps {
  params: Promise<{ orgSlug: string; projectId: string }>
}

const STATUS_LABEL: Record<string, string> = {
  planning: 'Planning', pre_launch: 'Pre-launch', launched: 'Launched',
  ongoing: 'Ongoing', completed: 'Completed',
}
const STATUS_COLORS: Record<string, string> = {
  planning: 'bg-gray-100 text-gray-600', pre_launch: 'bg-blue-50 text-blue-700',
  launched: 'bg-green-50 text-green-700', ongoing: 'bg-indigo-50 text-indigo-700',
  completed: 'bg-gray-100 text-gray-500',
}

export default async function ProjectDetailPage({ params }: PageProps) {
  const { orgSlug, projectId } = await params
  const supabase = await createClient()

  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .single()

  if (!project) notFound()

  // Viewer role
  const { data: { user } } = await supabase.auth.getUser()
  let viewerRole: MemberRole = 'readonly'

  if (user) {
    const { data: profile } = await supabase
      .from('profiles').select('id').eq('auth_user_id', user.id).single()
    if (profile) {
      const { data: m } = await supabase
        .from('org_members').select('role')
        .eq('org_id', project.org_id).eq('profile_id', profile.id).single()
      viewerRole = (m?.role ?? 'readonly') as MemberRole
    }
  }

  // Leads in this project
  const { data: leads } = await supabase
    .from('leads')
    .select(`
      id, name, phone, email, status, priority, source, created_at,
      project:projects(id, name),
      assignee:profiles!leads_assigned_to_fkey(id, full_name)
    `)
    .eq('org_id', project.org_id)
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })

  const leadCount = leads?.length ?? 0

  return (
    <PageShell
      title={project.name}
      description={
        <span className="flex items-center gap-2">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_COLORS[project.status] ?? ''}`}>
            {STATUS_LABEL[project.status] ?? project.status}
          </span>
          {project.city && <><span className="text-[var(--foreground-subtle)]">·</span><span>{project.city}</span></>}
        </span>
      }
    >
      <div className="mb-5">
        <Link href={`/${orgSlug}/projects`} className="inline-flex items-center gap-1.5 text-[13px] text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to projects
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-5">
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Total Leads', value: leadCount },
              { label: 'Booked', value: leads?.filter((l) => l.status === 'booked').length ?? 0 },
              { label: 'In Negotiation', value: leads?.filter((l) => l.status === 'negotiation').length ?? 0 },
            ].map((s) => (
              <div key={s.label} className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
                <div className="text-[11px] font-medium text-[var(--foreground-muted)] uppercase tracking-wide mb-1">{s.label}</div>
                <div className="text-2xl font-semibold text-[var(--foreground)]">{s.value}</div>
              </div>
            ))}
          </div>

          {/* Leads table */}
          {leads && leads.length > 0 ? (
            <LeadsTable leads={leads as any} orgSlug={orgSlug} orgId={project.org_id} viewerRole={viewerRole} />
          ) : (
            <EmptyState
              icon={Users}
              title="No leads for this project"
              description="Leads assigned to this project will appear here."
            />
          )}
        </div>

        {/* Right: project info */}
        <div>
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 space-y-3">
            <h3 className="text-[13px] font-semibold text-[var(--foreground)]">Project info</h3>
            <dl className="space-y-2 text-[13px]">
              {project.city && <div><dt className="text-[var(--foreground-muted)] text-[12px]">City</dt><dd>{project.city}</dd></div>}
              {project.location && <div><dt className="text-[var(--foreground-muted)] text-[12px]">Location</dt><dd>{project.location}</dd></div>}
              <div><dt className="text-[var(--foreground-muted)] text-[12px]">Type</dt><dd className="capitalize">{project.type.replace('_', ' ')}</dd></div>
              <div><dt className="text-[var(--foreground-muted)] text-[12px]">Created</dt><dd>{formatDate(project.created_at)}</dd></div>
            </dl>
            {project.description && (
              <>
                <hr className="border-[var(--border)]" />
                <p className="text-[13px] text-[var(--foreground-muted)] leading-relaxed">{project.description}</p>
              </>
            )}
          </div>
        </div>
      </div>
    </PageShell>
  )
}
