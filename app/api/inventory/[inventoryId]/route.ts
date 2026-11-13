// app/api/inventory/[inventoryId]/route.ts
// Secure Inventory item detail routes: Enforces authentication, tenant isolation, and RBAC.
import { NextResponse, type NextRequest } from 'next/server'
import { getInventoryById, getInventoryStatusHistory } from '@/lib/dal/inventory'
import { InventoryItemSchema } from '@/lib/validations/inventory'
import { authorizeInventoryAccess } from '@/lib/auth/tenant'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ inventoryId: string }> }
) {
  try {
    const { inventoryId } = await params

    // Verify authentication and tenant access
    const authResult = await authorizeInventoryAccess(inventoryId)
    if (!authResult.success) {
      return authResult.response
    }

    const item = await getInventoryById(inventoryId)
    if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

    const history = await getInventoryStatusHistory(inventoryId)
    return NextResponse.json({ item, history })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ inventoryId: string }> }
) {
  try {
    const { inventoryId } = await params

    // Require manager, admin, or owner in this item's organisation
    const authResult = await authorizeInventoryAccess(inventoryId, ['owner', 'admin', 'manager'])
    if (!authResult.success) {
      return authResult.response
    }

    const body = await request.json()
    const parsed = InventoryItemSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const service = createServiceClient()

    // Tenant consistency: Verify hierarchy node belongs to this project if provided
    if (parsed.data.hierarchy_node_id) {
      const { data: node } = await service
        .from('project_hierarchy_nodes')
        .select('id, project_id, org_id')
        .eq('id', parsed.data.hierarchy_node_id)
        .maybeSingle()

      if (!node || node.project_id !== authResult.context.item.project_id || node.org_id !== authResult.context.orgId) {
        return NextResponse.json(
          { error: 'Invalid hierarchy node for this project and organisation.' },
          { status: 400 }
        )
      }
    }

    const { data: updated, error: updateError } = await service
      .from('inventory_items')
      .update({
        unit_number: parsed.data.unit_number,
        category: parsed.data.category,
        area_value: parsed.data.area_value,
        area_unit: parsed.data.area_unit,
        carpet_area: parsed.data.carpet_area ?? null,
        built_up_area: parsed.data.built_up_area ?? null,
        super_built_up_area: parsed.data.super_built_up_area ?? null,
        plot_area: parsed.data.plot_area ?? null,
        plot_dimensions: parsed.data.plot_dimensions || null,
        road_width_ft: parsed.data.road_width_ft ?? null,
        is_corner_plot: parsed.data.is_corner_plot,
        facing: parsed.data.facing || null,
        bhk_config: parsed.data.bhk_config || null,
        floor_number: parsed.data.floor_number ?? null,
        tower_name: parsed.data.tower_name || null,
        commercial_asset_type: parsed.data.commercial_asset_type || null,
        bedrooms: parsed.data.bedrooms ?? null,
        bathrooms: parsed.data.bathrooms ?? null,
        balconies: parsed.data.balconies ?? null,
        parking_spaces: parsed.data.parking_spaces,
        furnishing_status: parsed.data.furnishing_status,
        base_rate: parsed.data.base_rate ?? null,
        total_price: parsed.data.total_price ?? null,
        pricing_breakup: parsed.data.pricing_breakup,
        internal_notes: parsed.data.internal_notes || null,
        hierarchy_node_id: parsed.data.hierarchy_node_id || null,
      })
      .eq('id', inventoryId)
      .eq('org_id', authResult.context.orgId)
      .select()
      .single()

    if (updateError || !updated) {
      return NextResponse.json({ error: updateError?.message ?? 'Update failed' }, { status: 500 })
    }

    return NextResponse.json({ item: updated })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ inventoryId: string }> }
) {
  try {
    const { inventoryId } = await params

    // Require admin or owner in this item's organisation
    const authResult = await authorizeInventoryAccess(inventoryId, ['owner', 'admin'])
    if (!authResult.success) {
      return authResult.response
    }

    const service = createServiceClient()
    const { error: delError } = await service
      .from('inventory_items')
      .delete()
      .eq('id', inventoryId)
      .eq('org_id', authResult.context.orgId)

    if (delError) return NextResponse.json({ error: delError.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
