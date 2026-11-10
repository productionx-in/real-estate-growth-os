// app/(dashboard)/[orgSlug]/layout.tsx
// Org-scoped layout: validates user belongs to this org
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

interface OrgLayoutProps {
  children: React.ReactNode
  params: Promise<{ orgSlug: string }>
}

export default async function OrgLayout({ children, params }: OrgLayoutProps) {
  const { orgSlug } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Verify org exists
  const { data: org } = await supabase
    .from('organisations')
    .select('id, name, slug')
    .eq('slug', orgSlug)
    .single()

  if (!org) notFound()

  // Verify user belongs to this org
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()

  if (!profile) redirect('/register')

  const { data: membership } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', org.id)
    .eq('profile_id', profile.id)
    .single()

  if (!membership) {
    // User authenticated but not a member of this org
    redirect('/select-org')
  }

  return <>{children}</>
}
