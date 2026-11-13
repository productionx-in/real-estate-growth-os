// app/(dashboard)/select-org/page.tsx
// Shown after login — routes user to their workspace or displays workspace selector
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Building2, ArrowRight, Plus } from 'lucide-react'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function SelectOrgPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const service = createServiceClient()

  // Find or create profile
  let { data: profile } = await service
    .from('profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!profile) {
    const fullName =
      (user.user_metadata?.full_name as string) ||
      user.email?.split('@')[0] ||
      'User'

    const { data: newProfile } = await service
      .from('profiles')
      .insert({ auth_user_id: user.id, full_name: fullName })
      .select('id')
      .single()

    profile = newProfile
  }

  if (!profile) {
    redirect('/create-org')
  }

  // Find user's organisations
  const { data: memberships } = await service
    .from('org_members')
    .select(`
      role,
      organisation:organisations(id, name, slug, type)
    `)
    .eq('profile_id', profile.id)
    .order('joined_at', { ascending: true })

  if (!memberships || memberships.length === 0) {
    redirect('/create-org')
  }

  // If user belongs to only 1 organisation, send them directly into that workspace
  if (memberships.length === 1) {
    const org = memberships[0].organisation as any
    if (org?.slug) {
      redirect(`/${org.slug}`)
    }
    redirect('/create-org')
  }

  // Multiple organisations: render selection card
  return (
    <div className="min-h-screen bg-[var(--background)] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="w-9 h-9 rounded-xl bg-[var(--brand)] flex items-center justify-center shadow-xs">
            <Building2 className="w-5 h-5 text-white" />
          </div>
          <span className="text-lg font-bold text-[var(--foreground)]">Growth OS</span>
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-7 shadow-sm">
          <h1 className="text-base font-bold text-[var(--foreground)] mb-1">
            Select Your Workspace
          </h1>
          <p className="text-xs text-[var(--foreground-muted)] mb-5">
            Choose which real estate workspace you wish to open.
          </p>

          <div className="space-y-2.5">
            {memberships.map((m: any) => {
              const org = m.organisation
              if (!org) return null

              return (
                <Link
                  key={org.id}
                  href={`/${org.slug}`}
                  className="flex items-center justify-between p-3.5 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] hover:bg-[var(--surface-hover)] hover:border-[var(--brand)] transition-all group"
                >
                  <div>
                    <h3 className="text-xs font-semibold text-[var(--foreground)] group-hover:text-[var(--brand)]">
                      {org.name}
                    </h3>
                    <div className="text-[11px] text-[var(--foreground-muted)] flex items-center gap-1.5 capitalize mt-0.5">
                      <span>{org.type.replace('_', ' ')}</span>
                      <span>·</span>
                      <span className="text-[var(--brand)] font-medium">{m.role}</span>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-[var(--brand)] group-hover:translate-x-0.5 transition-all" />
                </Link>
              )
            })}
          </div>

          <div className="mt-5 pt-4 border-t border-[var(--border)]">
            <Link
              href="/create-org"
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-semibold text-[var(--brand)] bg-blue-50/50 hover:bg-blue-50 border border-blue-200 rounded-lg transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Create Another Workspace
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
