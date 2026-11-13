// app/api/projects/[projectId]/hierarchy/[nodeId]/route.ts
// Individual Project Hierarchy Node endpoints (Update & Safe Delete)
import { NextResponse, type NextRequest } from 'next/server'
import { authorizeProjectAccess } from '@/lib/auth/tenant'
import { UpdateHierarchyNodeSchema } from '@/lib/validations/hierarchy'
import { updateHierarchyNode, safeDeleteHierarchyNode } from '@/lib/dal/hierarchy'

interface RouteParams {
  params: Promise<{ projectId: string; nodeId: string }>
}

/**
 * PATCH /api/projects/[projectId]/hierarchy/[nodeId]
 * Updates a node or safely moves it (re-parenting with circular relationship check).
 * Accessible by managers, admins, and owners.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId, nodeId } = await params

    const authResult = await authorizeProjectAccess(projectId, ['owner', 'admin', 'manager'])
    if (!authResult.success) {
      return authResult.response
    }

    const body = await request.json()
    const parsed = UpdateHierarchyNodeSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { orgId } = authResult.context
    const { node, error } = await updateHierarchyNode(nodeId, projectId, orgId, parsed.data)

    if (error || !node) {
      return NextResponse.json({ error: error ?? 'Failed to update hierarchy node' }, { status: 400 })
    }

    return NextResponse.json({ node })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * DELETE /api/projects/[projectId]/hierarchy/[nodeId]
 * Safely deletes a node ONLY if it has 0 children and 0 associated inventory items.
 * Accessible by managers, admins, and owners.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId, nodeId } = await params

    const authResult = await authorizeProjectAccess(projectId, ['owner', 'admin', 'manager'])
    if (!authResult.success) {
      return authResult.response
    }

    const { orgId } = authResult.context
    const { success, error } = await safeDeleteHierarchyNode(nodeId, projectId, orgId)

    if (!success || error) {
      return NextResponse.json(
        { error: error ?? 'Failed to delete hierarchy node' },
        { status: 400 }
      )
    }

    return NextResponse.json({ success: true, deleted_node_id: nodeId })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
