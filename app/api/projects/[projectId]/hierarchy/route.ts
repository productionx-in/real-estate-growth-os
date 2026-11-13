// app/api/projects/[projectId]/hierarchy/route.ts
// Secure Project Hierarchy endpoints: Enforces authentication, tenant isolation, and RBAC.
import { NextResponse, type NextRequest } from 'next/server'
import { authorizeProjectAccess } from '@/lib/auth/tenant'
import { CreateHierarchyNodeSchema } from '@/lib/validations/hierarchy'
import { getProjectHierarchyTree, createHierarchyNode } from '@/lib/dal/hierarchy'

interface RouteParams {
  params: Promise<{ projectId: string }>
}

/**
 * GET /api/projects/[projectId]/hierarchy
 * Returns the hierarchical structure with aggregated descendant inventory statistics.
 * Accessible by all project/org members (owner, admin, manager, sales_exec, readonly).
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params

    const authResult = await authorizeProjectAccess(projectId)
    if (!authResult.success) {
      return authResult.response
    }

    const { orgId } = authResult.context
    const tree = await getProjectHierarchyTree(projectId, orgId)

    return NextResponse.json({
      project_id: projectId,
      ...tree,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * POST /api/projects/[projectId]/hierarchy
 * Creates a new root or child hierarchy node.
 * Accessible by managers, admins, and owners.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params

    const authResult = await authorizeProjectAccess(projectId, ['owner', 'admin', 'manager'])
    if (!authResult.success) {
      return authResult.response
    }

    const body = await request.json()
    const parsed = CreateHierarchyNodeSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { orgId } = authResult.context
    const { node, error } = await createHierarchyNode(projectId, orgId, parsed.data)

    if (error || !node) {
      return NextResponse.json({ error: error ?? 'Failed to create hierarchy node' }, { status: 400 })
    }

    return NextResponse.json({ node }, { status: 201 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
