// app/(dashboard)/[orgSlug]/settings/page.tsx
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { PageShell } from '@/components/layout/PageShell'
import { redirect } from 'next/navigation'

export const metadata: Metadata = { title: 'Settings' }

interface PageProps {
  params: Promise<{ orgSlug: string }>
}

const ORG_TYPE_LABEL: Record<string, string> = {
  developer: 'Property Developer / Builder',
  channel_partner: 'Channel Partner',
}

export default async function SettingsPage({ params }: PageProps) {
  const { orgSlug } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: org } = await supabase
    .from('organisations').select('*').eq('slug', orgSlug).single()
  if (!org) redirect(`/${orgSlug}`)

  const { data: profile } = await supabase
    .from('profiles').select('*').eq('auth_user_id', user.id).single()

  const { data: membership } = profile
    ? await supabase
        .from('org_members').select('role')
        .eq('org_id', org.id).eq('profile_id', profile.id).single()
    : { data: null }

  const isAdmin = ['owner', 'admin'].includes(membership?.role ?? '')

  return (
    <PageShell title="Settings" description="Manage your workspace configuration">
      <div className="max-w-2xl space-y-6">

        {/* Organisation info */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
          <h2 className="text-[13px] font-semibold text-[var(--foreground)] mb-4">Organisation</h2>
          <dl className="space-y-3">
            <div className="flex gap-3">
              <dt className="w-28 text-[12px] font-medium text-[var(--foreground-muted)]">Name</dt>
              <dd className="text-[13px] text-[var(--foreground)]">{org.name}</dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-28 text-[12px] font-medium text-[var(--foreground-muted)]">Type</dt>
              <dd className="text-[13px] text-[var(--foreground)]">{ORG_TYPE_LABEL[org.type] ?? org.type}</dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-28 text-[12px] font-medium text-[var(--foreground-muted)]">Workspace URL</dt>
              <dd className="text-[13px] text-[var(--foreground)] font-mono">/{org.slug}</dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-28 text-[12px] font-medium text-[var(--foreground-muted)]">Plan</dt>
              <dd>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700 capitalize">
                  {org.plan}
                </span>
              </dd>
            </div>
          </dl>
          {!isAdmin && (
            <p className="mt-4 text-[12px] text-[var(--foreground-muted)]">
              Only admins and owners can edit organisation settings.
            </p>
          )}
        </div>

        {/* Profile info */}
        {profile && (
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
            <h2 className="text-[13px] font-semibold text-[var(--foreground)] mb-4">Your profile</h2>
            <dl className="space-y-3">
              <div className="flex gap-3">
                <dt className="w-28 text-[12px] font-medium text-[var(--foreground-muted)]">Name</dt>
                <dd className="text-[13px] text-[var(--foreground)]">{profile.full_name}</dd>
              </div>
              <div className="flex gap-3">
                <dt className="w-28 text-[12px] font-medium text-[var(--foreground-muted)]">Email</dt>
                <dd className="text-[13px] text-[var(--foreground)]">{user.email}</dd>
              </div>
              <div className="flex gap-3">
                <dt className="w-28 text-[12px] font-medium text-[var(--foreground-muted)]">Role</dt>
                <dd className="text-[13px] text-[var(--foreground)] capitalize">
                  {membership?.role?.replace('_', ' ') ?? 'Unknown'}
                </dd>
              </div>
              {profile.phone && (
                <div className="flex gap-3">
                  <dt className="w-28 text-[12px] font-medium text-[var(--foreground-muted)]">Phone</dt>
                  <dd className="text-[13px] text-[var(--foreground)]">{profile.phone}</dd>
                </div>
              )}
            </dl>
          </div>
        )}

        {/* Supabase setup reminder */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <h3 className="text-[13px] font-semibold text-amber-800 mb-1">⚙️ Supabase setup required</h3>
          <p className="text-[12px] text-amber-700">
            To activate the JWT custom claims hook, go to Supabase Dashboard → Authentication → Hooks 
            and register <code className="font-mono bg-amber-100 px-1 rounded">public.custom_access_token_hook</code> 
            as the Customize Access Token hook.
          </p>
        </div>
      </div>
    </PageShell>
  )
}
