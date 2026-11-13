// app/api/inventory/[inventoryId]/route.ts
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getInventoryById, getInventoryStatusHistory } from '@/lib/dal/inventory'
import { InventoryItemSchema } from '@/lib/validations/inventory'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ inventoryId: string }> }
) {
  try {
    const { inventoryId } = await params
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
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const body = await request.json()
    const parsed = InventoryItemSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
    }

    const { data: profile } = await supabase
      .from('profiles').select('id').eq('auth_user_id', user.id).single()
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 403 })

    const { data: current } = await supabase
      .from('inventory_items').select('org_id').eq('id', inventoryId).single()
    if (!current) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

    const { data: membership } = await supabase
      .from('org_members').select('role').eq('org_id', current.org_id).eq('profile_id', profile.id).single()

    if (!membership || !['owner', 'admin', 'manager'].includes(membership.role)) {
      return NextResponse.json({ error: 'Manager or above required' }, { status: 403 })
    }

    const { data: updated, error: updateError } = await supabase
      .from('inventory_items')
      .update({
        unit_number: parsed.data.unit_number.trim(),
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
        internal_notes: parsed.data.internal_notes || null,
      })
      .eq('id', inventoryId)
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
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles').select('id').eq('auth_user_id', user.id).single()
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 403 })

    const { data: item } = await supabase
      .from('inventory_items').select('org_id').eq('id', inventoryId).single()
    if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

    const { data: membership } = await supabase
      .from('org_members').select('role').eq('org_id', item.org_id).eq('profile_id', profile.id).single()

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Admin authorization required' }, { status: 403 })
    }

    const { error: delError } = await supabase.from('inventory_items').delete().eq('id', inventoryId)
    if (delError) return NextResponse.json({ error: delError.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
