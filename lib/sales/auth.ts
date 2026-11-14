// lib/sales/auth.ts
// Standardized authentication and tenant authorization helper for Sales API endpoints.

import { NextResponse } from 'next/server'
import { authenticateCaller, authorizeOrgAccess, type TenantContext } from '@/lib/auth/tenant'

export async function authorizeSalesRequest(
  orgId: string | null | undefined
): Promise<
  | { success: true; context: TenantContext }
  | { success: false; response: NextResponse }
> {
  if (!orgId) {
    return {
      success: false,
      response: NextResponse.json({ error: 'Missing required orgId' }, { status: 400 }),
    }
  }

  const authRes = await authenticateCaller()
  if (!authRes.success) return authRes

  const orgAccess = await authorizeOrgAccess(orgId)
  if (!orgAccess.success) return orgAccess

  return { success: true, context: orgAccess.context }
}
