// app/api/inventory/[inventoryId]/status/route.ts
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { InventoryStatusChangeSchema } from '@/lib/validations/inventory'
import { transitionInventoryStatus } from '@/lib/dal/inventory'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ inventoryId: string }> }
) {
  try {
    const { inventoryId } = await params
    const supabase = await createClient()

    // 1. Auth check
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    // 2. Validate payload
    const body = await request.json()
    const parsed = InventoryStatusChangeSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    // 3. User profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()

    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 403 })

    // 4. Verify item exists & caller belongs to same org
    const { data: item } = await supabase
      .from('inventory_items')
      .select('id, org_id, status')
      .eq('id', inventoryId)
      .single()

    if (!item) return NextResponse.json({ error: 'Inventory item not found' }, { status: 404 })

    const { data: membership } = await supabase
      .from('org_members')
      .select('role')
      .eq('org_id', item.org_id)
      .eq('profile_id', profile.id)
      .single()

    if (!membership || membership.role === 'readonly') {
      return NextResponse.json(
        { error: 'Readonly accounts cannot alter inventory status' },
        { status: 403 }
      )
    }

    // Note: Booked or Sold changes require manager or admin
    if (['booked', 'sold', 'blocked'].includes(parsed.data.new_status)) {
      if (!['owner', 'admin', 'manager'].includes(membership.role)) {
        return NextResponse.json(
          { error: `Manager authorization required to mark unit as '${parsed.data.new_status}'` },
          { status: 403 }
        )
      }
    }

    const result = await transitionInventoryStatus(
      inventoryId,
      parsed.data,
      profile.id
    )

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({ success: true, item: result.item })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
