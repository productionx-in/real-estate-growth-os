// app/api/projects/route.ts
// Secure Project creation: Enforces authentication, multi-org resolution, and RBAC.
import { NextResponse, type NextRequest } from 'next/server'
import { ProjectSchema } from '@/lib/validations/project'
import { createProject } from '@/lib/dal/projects'
import { authenticateCaller } from '@/lib/auth/tenant'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const authResult = await authenticateCaller()
    if (!authResult.success) {
      return authResult.response
    }

    const { auth } = authResult
    const service = createServiceClient()

    const body = await request.json()
    const parsed = ProjectSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    // Resolve target organisation for multi-org users
    const { searchParams } = new URL(request.url)
    let requestedOrgId = (body.orgId || body.org_id || searchParams.get('orgId') || searchParams.get('org_id')) as string | undefined
    const requestedOrgSlug = (body.orgSlug || searchParams.get('orgSlug')) as string | undefined

    if (!requestedOrgId && requestedOrgSlug) {
      const { data: orgBySlug } = await service
        .from('organisations')
        .select('id')
        .eq('slug', requestedOrgSlug)
        .maybeSingle()

      if (orgBySlug) {
        requestedOrgId = orgBySlug.id
      }
    }

    let targetOrgId: string

    if (requestedOrgId) {
      const { data: membership } = await service
        .from('org_members')
        .select('role')
        .eq('org_id', requestedOrgId)
        .eq('profile_id', auth.profile.id)
        .maybeSingle()

      if (!membership || !['owner', 'admin', 'manager'].includes(membership.role)) {
        return NextResponse.json(
          { error: 'Insufficient permissions for the specified organisation' },
          { status: 403 }
        )
      }
      targetOrgId = requestedOrgId
    } else {
      // Find all memberships for this user
      const { data: memberships } = await service
        .from('org_members')
        .select('org_id, role')
        .eq('profile_id', auth.profile.id)

      if (!memberships || memberships.length === 0) {
        return NextResponse.json({ error: 'No organisation found for user' }, { status: 403 })
      }

      const managerMemberships = memberships.filter((m) =>
        ['owner', 'admin', 'manager'].includes(m.role)
      )

      if (managerMemberships.length === 0) {
        return NextResponse.json(
          { error: 'Managers or above can create projects' },
          { status: 403 }
        )
      }

      if (managerMemberships.length > 1) {
        return NextResponse.json(
          { error: 'User belongs to multiple organisations. Please select a workspace or specify orgId/orgSlug.' },
          { status: 400 }
        )
      }

      targetOrgId = managerMemberships[0].org_id
    }

    const { project, error } = await createProject(targetOrgId, parsed.data)
    if (error || !project) {
      return NextResponse.json({ error: error ?? 'Failed to create project' }, { status: 500 })
    }

    return NextResponse.json({ project }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
