// lib/dal/workspace.ts
// Robust workspace and tenant resolution for Server Components.
// Validates session, loads organization, verifies membership, and provides tenant context.
import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { MemberRole } from '@/types/database'

export interface VerifiedWorkspace {
  user: {
    id: string
    email?: string
  }
  profile: {
    id: string
    full_name: string
    avatar_url: string | null
    phone: string | null
  }
  org: {
    id: string
    name: string
    slug: string
    type: 'developer' | 'channel_partner'
    plan?: string
    created_at?: string
  }
  role: MemberRole
  isManager: boolean
  isAdmin: boolean
}

export async function getVerifiedWorkspace(orgSlug: string): Promise<VerifiedWorkspace> {
  const supabase = await createClient()

  // 1. Verify user session
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    redirect(`/login?redirectTo=/${encodeURIComponent(orgSlug)}`)
  }

  // Use service client to guarantee lookup regardless of Supabase JWT claims hook configuration
  const service = createServiceClient()

  // 2. Fetch organisation by slug
  const { data: org } = await service
    .from('organisations')
    .select('id, name, slug, type, plan, created_at')
    .eq('slug', orgSlug)
    .maybeSingle()

  if (!org) {
    // Org does not exist — redirect to workspace selector instead of dead 404
    redirect('/select-org')
  }

  // 3. Ensure profile exists for this user
  let { data: profile } = await service
    .from('profiles')
    .select('id, full_name, avatar_url, phone')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!profile) {
    const fullName =
      (user.user_metadata?.full_name as string) ||
      user.email?.split('@')[0] ||
      'Workspace Member'

    const { data: newProfile } = await service
      .from('profiles')
      .insert({
        auth_user_id: user.id,
        full_name: fullName,
      })
      .select('id, full_name, avatar_url, phone')
      .single()

    profile = newProfile
  }

  if (!profile) {
    redirect('/select-org')
  }

  // 4. Verify membership in this organisation (Strict security: never auto-assign ownership)
  const { data: membership } = await service
    .from('org_members')
    .select('role')
    .eq('org_id', org.id)
    .eq('profile_id', profile.id)
    .maybeSingle()

  if (!membership) {
    // User is authenticated but is NOT a member of this organisation.
    // Strictly redirect to their own org selector. Never grant membership or ownership.
    redirect('/select-org')
  }

  const role = (membership.role ?? 'readonly') as MemberRole
  const isManager = ['owner', 'admin', 'manager'].includes(role)
  const isAdmin = ['owner', 'admin'].includes(role)

  return {
    user: { id: user.id, email: user.email },
    profile,
    org: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      type: org.type as 'developer' | 'channel_partner',
      plan: org.plan,
      created_at: org.created_at,
    },
    role,
    isManager,
    isAdmin,
  }
}
