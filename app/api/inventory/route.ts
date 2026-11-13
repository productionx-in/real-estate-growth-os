// app/api/inventory/route.ts
// Secure Inventory collection routes: Enforces authentication, project scoping, and RBAC.
import { NextResponse, type NextRequest } from 'next/server'
import { InventoryItemSchema } from '@/lib/validations/inventory'
import { createInventoryItem, getPaginatedInventoryByProject, type InventoryFilterParams } from '@/lib/dal/inventory'
import { authorizeProjectAccess } from '@/lib/auth/tenant'
import { createServiceClient } from '@/lib/supabase/server'
import type { InventoryStatus, ProjectCategory } from '@/types/database'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }

    // Tenant isolation: Authenticate caller and verify membership in project's organisation
    const authResult = await authorizeProjectAccess(projectId)
    if (!authResult.success) {
      return authResult.response
    }

    const minPriceParam = searchParams.get('minPrice')
    const maxPriceParam = searchParams.get('maxPrice')
    const minAreaParam = searchParams.get('minArea')
    const maxAreaParam = searchParams.get('maxArea')
    const floorParam = searchParams.get('floor')
    const pageParam = searchParams.get('page')
    const pageSizeParam = searchParams.get('pageSize')
    const sortByParam = searchParams.get('sortBy')
    const sortOrderParam = searchParams.get('sortOrder')

    const filters: InventoryFilterParams = {
      status: (searchParams.get('status') as InventoryStatus) || undefined,
      category: (searchParams.get('category') as ProjectCategory) || undefined,
      bhk: searchParams.get('bhk') || undefined,
      search: searchParams.get('search') || undefined,
      tower: searchParams.get('tower') || undefined,
      floor: floorParam ? parseInt(floorParam, 10) : undefined,
      hierarchyNodeId: searchParams.get('hierarchyNodeId') || undefined,
      facing: searchParams.get('facing') || undefined,
      minPrice: minPriceParam ? parseFloat(minPriceParam) : undefined,
      maxPrice: maxPriceParam ? parseFloat(maxPriceParam) : undefined,
      minArea: minAreaParam ? parseFloat(minAreaParam) : undefined,
      maxArea: maxAreaParam ? parseFloat(maxAreaParam) : undefined,
      sortBy: (sortByParam as InventoryFilterParams['sortBy']) || undefined,
      sortOrder: (sortOrderParam as 'asc' | 'desc') || undefined,
      page: pageParam ? parseInt(pageParam, 10) : undefined,
      pageSize: pageSizeParam ? parseInt(pageSizeParam) : undefined,
    }

    const result = await getPaginatedInventoryByProject(projectId, filters)

    // Security: Only internal team roles can view internal notes
    const isInternalUser = ['owner', 'admin', 'manager', 'sales_agent'].includes(
      authResult.context.role
    )
    if (!isInternalUser) {
      for (const item of result.items) {
        item.internal_notes = null
      }
    }

    return NextResponse.json({
      items: result.items,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      totalPages: result.totalPages,
    })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = InventoryItemSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    // Tenant isolation: Verify caller is manager, admin, or owner in this project's organisation
    const authResult = await authorizeProjectAccess(parsed.data.project_id, [
      'owner',
      'admin',
      'manager',
    ])
    if (!authResult.success) {
      return authResult.response
    }

    const service = createServiceClient()

    // Hierarchy consistency: If hierarchy_node_id provided, verify it belongs to this project & org
    if (parsed.data.hierarchy_node_id) {
      const { data: node } = await service
        .from('project_hierarchy_nodes')
        .select('id, project_id, org_id')
        .eq('id', parsed.data.hierarchy_node_id)
        .maybeSingle()

      if (!node || node.project_id !== parsed.data.project_id || node.org_id !== authResult.context.orgId) {
        return NextResponse.json(
          { error: 'Hierarchy node does not belong to this project and organisation.' },
          { status: 400 }
        )
      }
    }

    const { item, error, isDuplicate } = await createInventoryItem(
      authResult.context.orgId,
      parsed.data
    )

    if (error || !item) {
      const status = isDuplicate ? 409 : 400
      return NextResponse.json({ error: error ?? 'Failed to create inventory' }, { status })
    }

    return NextResponse.json({ item }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
