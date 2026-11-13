// app/api/projects/[projectId]/route.ts
// Secure Project detail routes: Enforces authentication, tenant isolation, and RBAC.
import { NextResponse, type NextRequest } from 'next/server'
import { ProjectSchema } from '@/lib/validations/project'
import { getProjectById, updateProject } from '@/lib/dal/projects'
import { authorizeProjectAccess } from '@/lib/auth/tenant'
import { createServiceClient } from '@/lib/supabase/server'

interface RouteParams {
  params: Promise<{ projectId: string }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params

    // Verify authentication and membership in project's organisation
    const authResult = await authorizeProjectAccess(projectId)
    if (!authResult.success) {
      return authResult.response
    }

    const project = await getProjectById(projectId)
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    return NextResponse.json({ project })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params

    // Verify manager/admin/owner permissions on this specific project's organisation
    const authResult = await authorizeProjectAccess(projectId, ['owner', 'admin', 'manager'])
    if (!authResult.success) {
      return authResult.response
    }

    const body = await request.json()
    const parsed = ProjectSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { project, error } = await updateProject(projectId, parsed.data)
    if (error || !project) {
      return NextResponse.json({ error: error ?? 'Update failed' }, { status: 500 })
    }

    return NextResponse.json({ project })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params

    // Verify admin/owner permissions on this project's organisation
    const authResult = await authorizeProjectAccess(projectId, ['owner', 'admin'])
    if (!authResult.success) {
      return authResult.response
    }

    const service = createServiceClient()
    const { error } = await service
      .from('projects')
      .delete()
      .eq('id', projectId)
      .eq('org_id', authResult.context.orgId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
