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
  const { data: org, error: orgError } = await service
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

  // 4. Verify membership in this organisation
  let { data: membership } = await service
    .from('org_members')
    .select('role')
    .eq('org_id', org.id)
    .eq('profile_id', profile.id)
    .maybeSingle()

  // Auto-heal: If this user has no membership in this org, check if they are the creator or if it's their only org
  if (!membership) {
    // Check if the user is a member of any other org
    const { data: otherMemberships } = await service
      .from('org_members')
      .select('id')
      .eq('profile_id', profile.id)
      .limit(1)

    // If user has zero org memberships at all, add them as owner to this newly created org
    if (!otherMemberships || otherMemberships.length === 0) {
      const { data: newMember } = await service
        .from('org_members')
        .insert({
          org_id: org.id,
          profile_id: profile.id,
          role: 'owner',
        })
        .select('role')
        .single()
      membership = newMember
    } else {
      // User is authenticated but not allowed in this specific organisation
      redirect('/select-org')
    }
  }

  const role = (membership?.role ?? 'readonly') as MemberRole
  const isManager = ['owner', 'admin', 'manager'].includes(role)
  const isAdmin = ['owner', 'admin'].includes(role)

  return {
    user: { id: user.id, email: user.email },
    profile,
    org: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      type: org.type as any,
      plan: org.plan,
      created_at: org.created_at,
    },
    role,
    isManager,
    isAdmin,
  }
}
