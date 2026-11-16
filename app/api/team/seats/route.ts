// app/api/team/seats/route.ts
import { NextResponse, type NextRequest } from 'next/server'
import { authenticateCaller } from '@/lib/auth/tenant'
import { createServiceClient } from '@/lib/supabase/server'
import { getSubscriptionAndSeatUsage } from '@/lib/dal/subscriptions'
import { isActiveMembership } from '@/lib/auth/permissions'

export async function GET(request: NextRequest) {
  try {
    const authResult = await authenticateCaller()
    if (!authResult.success) {
      return authResult.response
    }

    const { auth } = authResult
    const service = createServiceClient()

    const { searchParams } = new URL(request.url)
    const orgSlug = searchParams.get('orgSlug')
    const orgId = searchParams.get('orgId')

    let targetOrgId = orgId

    if (!targetOrgId && orgSlug) {
      const { data: org } = await service
        .from('organisations')
        .select('id')
        .eq('slug', orgSlug)
        .maybeSingle()

      if (org) targetOrgId = org.id
    }

    if (!targetOrgId) {
      return NextResponse.json({ error: 'Organisation identifier required' }, { status: 400 })
    }

    // Verify caller is a member
    const { data: membership } = await service
      .from('org_members')
      .select('role, status')
      .eq('status', 'active')
      .eq('org_id', targetOrgId)
      .eq('profile_id', auth.profile.id)
      .maybeSingle()

    if (!membership || !isActiveMembership(membership.status)) {
      return NextResponse.json({ error: 'Unauthorised for this organisation' }, { status: 403 })
    }

    const seatUsage = await getSubscriptionAndSeatUsage(targetOrgId)
    return NextResponse.json({ seatUsage }, { status: 200 })
  } catch (err) {
    console.error('Error fetching seat usage:', err)
    return NextResponse.json({ error: 'Failed to fetch subscription seats' }, { status: 500 })
  }
}
