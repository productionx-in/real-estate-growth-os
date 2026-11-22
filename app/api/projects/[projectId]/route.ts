// app/api/projects/[projectId]/route.ts
// Secure Project detail routes: Enforces authentication, tenant isolation, and RBAC.
import { describeBlockers, projectDeleteBlockers } from '@/lib/dal/deletion'
import { NextResponse, type NextRequest } from 'next/server'
import { ProjectSchema } from '@/lib/validations/project'
import { getProjectById, updateProject } from '@/lib/dal/projects'
import { authorizeProjectAccess } from '@/lib/auth/tenant'
import { createServiceClient } from '@/lib/supabase/server'
import { auditMember } from '@/lib/dal/org-audit'

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
    const { orgId, project } = authResult.context

    // The project's exact name must be typed to confirm (a delete cannot be undone).
    const body = (await request.json().catch(() => null)) as { confirmName?: unknown } | null
    if (typeof body?.confirmName !== 'string' || body.confirmName.trim() !== project.name.trim()) {
      return NextResponse.json({ error: 'Type the project name exactly to confirm.' }, { status: 400 })
    }
    // Never take real business with it (lib/dal/deletion.ts).
    const blockers = await projectDeleteBlockers(orgId, projectId)
    if (blockers.length) {
      return NextResponse.json({
        error: `This project can’t be deleted: it has ${describeBlockers(blockers)}. Mark it Completed instead to keep its history.`,
        blockers,
      }, { status: 409 })
    }

    const service = createServiceClient()
    const { count: units } = await service.from('inventory_items').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('project_id', projectId)
    const { error } = await service
      .from('projects')
      .delete()
      .eq('id', projectId)
      .eq('org_id', orgId)

    if (error) {
      return NextResponse.json({ error: 'Could not delete the project.' }, { status: 500 })
    }

    await auditMember(request, authResult.context, orgId, 'project.deleted', { type: 'project', id: projectId }, {
      name: project.name, units_removed: units ?? 0,
    })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
