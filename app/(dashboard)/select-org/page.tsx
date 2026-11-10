// app/(dashboard)/select-org/page.tsx
// Shown after login — routes user to their workspace
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function SelectOrgPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Find this user's org membership
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()

  if (!profile) redirect('/register')

  const { data: membership } = await supabase
    .from('org_members')
    .select('organisations(slug)')
    .eq('profile_id', profile.id)
    .order('joined_at', { ascending: true })
    .limit(1)
    .single()

  if (!membership) {
    // User has no org yet — send to org creation
    redirect('/create-org')
  }

  const org = membership.organisations as { slug: string } | null
  if (!org) redirect('/create-org')

  redirect(`/${org.slug}`)
}
