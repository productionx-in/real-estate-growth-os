// lib/auth/tenant.ts
// Standardized, server-side tenant isolation and role-based access control helpers.
// Enforces explicit authentication, organization membership, and project scoping.
import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { MemberRole } from '@/types/database'

export interface AuthContext {
  user: {
    id: string
    email?: string
  }
  profile: {
    id: string
    full_name: string
  }
}

export interface TenantContext extends AuthContext {
  orgId: string
  role: MemberRole
}

export interface ProjectAuthContext extends TenantContext {
  project: {
    id: string
    org_id: string
    name: string
    category: string
  }
}

export interface InventoryAuthContext extends TenantContext {
  item: {
    id: string
    org_id: string
    project_id: string
    unit_number: string
    status: string
  }
}

export interface LeadAuthContext extends TenantContext {
  lead: {
    id: string
    org_id: string
    project_id: string | null
    assigned_to: string | null
    status: string
  }
}

/**
 * 1. Verify caller has an active, valid authentication session.
 */
export async function authenticateCaller(): Promise<
  | { success: true; auth: AuthContext }
  | { success: false; response: NextResponse }
> {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return {
      success: false,
      response: NextResponse.json(
        { error: 'Unauthorised. Authentication required.' },
        { status: 401 }
      ),
    }
  }

  const service = createServiceClient()
  let { data: profile } = await service
    .from('profiles')
    .select('id, full_name')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!profile) {
    const fullName =
      (user.user_metadata?.full_name as string) ||
      user.email?.split('@')[0] ||
      'User'

    const { data: newProfile, error: profileErr } = await service
      .from('profiles')
      .insert({ auth_user_id: user.id, full_name: fullName })
      .select('id, full_name')
      .single()

    if (profileErr || !newProfile) {
      return {
        success: false,
        response: NextResponse.json(
          { error: 'Profile resolution failed' },
          { status: 403 }
        ),
      }
    }
    profile = newProfile
  }

  return {
    success: true,
    auth: {
      user: { id: user.id, email: user.email },
      profile: { id: profile.id, full_name: profile.full_name },
    },
  }
}

/**
 * 2. Verify caller is a member of the specified organization with sufficient role.
 */
export async function authorizeOrgAccess(
  orgId: string,
  allowedRoles?: MemberRole[]
): Promise<
  | { success: true; context: TenantContext }
  | { success: false; response: NextResponse }
> {
  const authRes = await authenticateCaller()
  if (!authRes.success) return authRes

  const { auth } = authRes
  const service = createServiceClient()

  const { data: membership } = await service
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('profile_id', auth.profile.id)
    .maybeSingle()

  if (!membership) {
    return {
      success: false,
      response: NextResponse.json(
        { error: 'Forbidden. You do not belong to this organisation.' },
        { status: 403 }
      ),
    }
  }

  const role = membership.role as MemberRole

  if (allowedRoles && !allowedRoles.includes(role)) {
    return {
      success: false,
      response: NextResponse.json(
        { error: `Forbidden. Role '${role}' lacks required permissions.` },
        { status: 403 }
      ),
    }
  }

  return {
    success: true,
    context: {
      ...auth,
      orgId,
      role,
    },
  }
}

/**
 * 3. Verify project exists, caller belongs to project's org, and has required role.
 */
export async function authorizeProjectAccess(
  projectId: string,
  allowedRoles?: MemberRole[]
): Promise<
  | { success: true; context: ProjectAuthContext }
  | { success: false; response: NextResponse }
> {
  const authRes = await authenticateCaller()
  if (!authRes.success) return authRes

  const { auth } = authRes
  const service = createServiceClient()

  const { data: project } = await service
    .from('projects')
    .select('id, org_id, name, category')
    .eq('id', projectId)
    .maybeSingle()

  if (!project) {
    return {
      success: false,
      response: NextResponse.json({ error: 'Project not found' }, { status: 404 }),
    }
  }

  const { data: membership } = await service
    .from('org_members')
    .select('role')
    .eq('org_id', project.org_id)
    .eq('profile_id', auth.profile.id)
    .maybeSingle()

  if (!membership) {
    return {
      success: false,
      response: NextResponse.json(
        { error: 'Forbidden. You do not belong to this project’s organisation.' },
        { status: 403 }
      ),
    }
  }

  const role = membership.role as MemberRole

  if (allowedRoles && !allowedRoles.includes(role)) {
    return {
      success: false,
      response: NextResponse.json(
        { error: `Forbidden. Role '${role}' lacks required permissions for this project.` },
        { status: 403 }
      ),
    }
  }

  return {
    success: true,
    context: {
      ...auth,
      orgId: project.org_id,
      role,
      project: {
        id: project.id,
        org_id: project.org_id,
        name: project.name,
        category: project.category,
      },
    },
  }
}

/**
 * 4. Verify inventory item exists, caller belongs to item's org, and has required role.
 */
export async function authorizeInventoryAccess(
  inventoryId: string,
  allowedRoles?: MemberRole[]
): Promise<
  | { success: true; context: InventoryAuthContext }
  | { success: false; response: NextResponse }
> {
  const authRes = await authenticateCaller()
  if (!authRes.success) return authRes

  const { auth } = authRes
  const service = createServiceClient()

  const { data: item } = await service
    .from('inventory_items')
    .select('id, org_id, project_id, unit_number, status')
    .eq('id', inventoryId)
    .maybeSingle()

  if (!item) {
    return {
      success: false,
      response: NextResponse.json({ error: 'Inventory unit not found' }, { status: 404 }),
    }
  }

  const { data: membership } = await service
    .from('org_members')
    .select('role')
    .eq('org_id', item.org_id)
    .eq('profile_id', auth.profile.id)
    .maybeSingle()

  if (!membership) {
    return {
      success: false,
      response: NextResponse.json(
        { error: 'Forbidden. You do not belong to this inventory’s organisation.' },
        { status: 403 }
      ),
    }
  }

  const role = membership.role as MemberRole

  if (allowedRoles && !allowedRoles.includes(role)) {
    return {
      success: false,
      response: NextResponse.json(
        { error: `Forbidden. Role '${role}' lacks required permissions for this inventory item.` },
        { status: 403 }
      ),
    }
  }

  return {
    success: true,
    context: {
      ...auth,
      orgId: item.org_id,
      role,
      item: {
        id: item.id,
        org_id: item.org_id,
        project_id: item.project_id,
        unit_number: item.unit_number,
        status: item.status,
      },
    },
  }
}

/**
 * 5. Verify lead exists, caller belongs to lead's org, and has required role.
 */
export async function authorizeLeadAccess(
  leadId: string,
  allowedRoles?: MemberRole[]
): Promise<
  | { success: true; context: LeadAuthContext }
  | { success: false; response: NextResponse }
> {
  const authRes = await authenticateCaller()
  if (!authRes.success) return authRes

  const { auth } = authRes
  const service = createServiceClient()

  const { data: lead } = await service
    .from('leads')
    .select('id, org_id, project_id, assigned_to, status')
    .eq('id', leadId)
    .maybeSingle()

  if (!lead) {
    return {
      success: false,
      response: NextResponse.json({ error: 'Lead not found' }, { status: 404 }),
    }
  }

  const { data: membership } = await service
    .from('org_members')
    .select('role')
    .eq('org_id', lead.org_id)
    .eq('profile_id', auth.profile.id)
    .maybeSingle()

  if (!membership) {
    return {
      success: false,
      response: NextResponse.json(
        { error: 'Forbidden. You do not belong to this lead’s organisation.' },
        { status: 403 }
      ),
    }
  }

  const role = membership.role as MemberRole

  if (allowedRoles && !allowedRoles.includes(role)) {
    return {
      success: false,
      response: NextResponse.json(
        { error: `Forbidden. Role '${role}' lacks required permissions for this lead.` },
        { status: 403 }
      ),
    }
  }

  return {
    success: true,
    context: {
      ...auth,
      orgId: lead.org_id,
      role,
      lead: {
        id: lead.id,
        org_id: lead.org_id,
        project_id: lead.project_id,
        assigned_to: lead.assigned_to,
        status: lead.status,
      },
    },
  }
}
