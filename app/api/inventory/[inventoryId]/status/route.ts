// app/api/inventory/[inventoryId]/status/route.ts
// Secure Inventory status transitions: Enforces state machine, audit logging, and RBAC.
import { NextResponse, type NextRequest } from 'next/server'
import { InventoryStatusChangeSchema } from '@/lib/validations/inventory'
import { transitionInventoryStatus } from '@/lib/dal/inventory'
import { authorizeInventoryAccess } from '@/lib/auth/tenant'
import type { MemberRole } from '@/types/database'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ inventoryId: string }> }
) {
  try {
    const { inventoryId } = await params

    const body = await request.json()
    const parsed = InventoryStatusChangeSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    // Role check: Minimum role required
    const requiredRoles: MemberRole[] = ['booked', 'sold', 'blocked'].includes(parsed.data.new_status)
      ? ['owner', 'admin', 'manager']
      : ['owner', 'admin', 'manager', 'sales_exec']

    const authResult = await authorizeInventoryAccess(inventoryId, requiredRoles)
    if (!authResult.success) {
      return authResult.response
    }

    const result = await transitionInventoryStatus(
      inventoryId,
      parsed.data,
      authResult.context.user.id
    )

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({ success: true, item: result.item })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
