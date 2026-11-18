// app/api/inventory/[inventoryId]/buyers/route.ts — open leads this unit suits (property matching).
// Any active member; a sales executive only gets leads assigned to them. Inventory module on.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { requireModule } from '@/lib/auth/entitlements'
import { matchLeadsForUnit } from '@/lib/dal/matching'
import { resolveLeadViewer } from '@/lib/dal/viewer'

export async function GET(request: NextRequest, { params }: { params: Promise<{ inventoryId: string }> }) {
  const { inventoryId } = await params
  const orgId = z.string().uuid().safeParse(new URL(request.url).searchParams.get('orgId'))
  if (!orgId.success || !z.string().uuid().safeParse(inventoryId).success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const access = await authorizeOrgAccess(orgId.data)
  if (!access.success) return access.response
  { const gate = await requireModule(orgId.data, 'inventory'); if (gate) return gate }
  const buyers = await matchLeadsForUnit(orgId.data, inventoryId, await resolveLeadViewer(orgId.data, access.context.role, access.context.profile.id))
  if (!buyers) return NextResponse.json({ error: 'Unit not found.' }, { status: 404 })
  return NextResponse.json({ buyers })
}
