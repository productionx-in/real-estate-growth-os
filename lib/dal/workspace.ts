// lib/dal/workspace.ts
// Robust workspace and tenant resolution for Server Components.
// Validates session, loads organization, verifies membership, and provides tenant context.
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { MemberRole, OrgLifecycleState } from '@/types/database'
import { isActiveMembership } from '@/lib/auth/permissions'

export interface AvailableOrgSummary {
  id: string
  name: string
  slug: string
  type: 'developer' | 'channel_partner'
  role: MemberRole
}

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
    lifecycle_state: OrgLifecycleState
    lifecycle_changed_at: string | null
    /** Demo/test workspace (migration 20260063). */
    is_demo: boolean
  }
  role: MemberRole
  isManager: boolean
  isAdmin: boolean
  availableOrgs: AvailableOrgSummary[]
}

/** Resolves the signed-in person's workspace. Wrapped in React cache(), so the workspace layout and its page share one
 *  lookup per request instead of repeating it. Independent lookups run in parallel: the session check alongside the
 *  organisation, then the profile alongside the memberships (joined through profiles.auth_user_id). */
export const getVerifiedWorkspace = cache(async (orgSlug: string): Promise<VerifiedWorkspace> => {
  const supabase = await createClient()
  // Use service client to guarantee lookup regardless of Supabase JWT claims hook configuration
  const service = createServiceClient()

  // 1. Verify the session (with the Auth server, so revoked sessions are refused) while loading the organisation.
  const [{ data: { user }, error: authError }, { data: org }] = await Promise.all([
    supabase.auth.getUser(),
    service
      .from('organisations')
      .select('id, name, slug, type, plan, created_at, lifecycle_state, lifecycle_changed_at, is_demo')
      .eq('slug', orgSlug)
      .maybeSingle(),
  ])

  if (authError || !user) {
    redirect(`/login?redirectTo=/${encodeURIComponent(orgSlug)}`)
  }

  if (!org) {
    // Org does not exist — redirect to workspace selector instead of dead 404
    redirect('/select-org')
  }

  // 2. Profile and all memberships (for the workspace switcher), in parallel.
  const [{ data: existingProfile }, { data: allMemberships }] = await Promise.all([
    service
      .from('profiles')
      .select('id, full_name, avatar_url, phone')
      .eq('auth_user_id', user.id)
      .maybeSingle(),
    service
      .from('org_members')
      .select(`
        org_id,
        role,
        status,
        organisation:organisations(id, name, slug, type),
        member:profiles!org_members_profile_id_fkey!inner(auth_user_id)
      `)
      .eq('member.auth_user_id', user.id)
      .order('joined_at', { ascending: true }),
  ])
  let profile = existingProfile

  // 3. Ensure a profile exists for this user (a brand-new profile has no memberships, so step 4 sends them on).
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

  // 4. Verify membership in this organisation.
  const typedMemberships = (allMemberships ?? []) as unknown as Array<{
    org_id: string
    role: string | null
    status?: string | null
    organisation: { id: string; name: string; slug: string; type: string } | null
  }>

  const currentMembership = typedMemberships.find(
    (m) => (m.org_id === org.id || m.organisation?.slug === orgSlug) && isActiveMembership(m.status)
  )

  if (!currentMembership) {
    // User is authenticated but is NOT an active member of this organisation (or has been deactivated).
    // Strictly redirect to their own org selector. Never grant membership or ownership.
    redirect('/select-org')
  }

  const availableOrgs: AvailableOrgSummary[] = typedMemberships
    .filter((m) => m.organisation && m.organisation.slug && isActiveMembership(m.status))
    .map((m) => ({
      id: m.organisation!.id,
      name: m.organisation!.name,
      slug: m.organisation!.slug,
      type: m.organisation!.type as 'developer' | 'channel_partner',
      role: (m.role ?? 'readonly') as MemberRole,
    }))

  const role = (currentMembership.role ?? 'readonly') as MemberRole
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
      lifecycle_state: (org.lifecycle_state ?? 'active') as OrgLifecycleState,
      lifecycle_changed_at: org.lifecycle_changed_at ?? null,
      is_demo: org.is_demo === true,
    },
    role,
    isManager,
    isAdmin,
    availableOrgs,
  }
})
