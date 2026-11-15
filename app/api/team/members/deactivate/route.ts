// app/api/team/members/deactivate/route.ts
import { NextResponse, type NextRequest } from 'next/server'
import { authenticateCaller } from '@/lib/auth/tenant'
import { createServiceClient } from '@/lib/supabase/server'
import { deactivateMember } from '@/lib/dal/invitations'
import { z } from 'zod'

const DeactivateSchema = z.object({
  orgSlug: z.string().optional(),
  orgId: z.string().uuid().optional(),
  memberId: z.string().uuid(),
  reassignmentMode: z.enum(['reassign_to_member', 'unassigned']).default('unassigned'),
  targetProfileId: z.string().uuid().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const authResult = await authenticateCaller()
    if (!authResult.success) {
      return authResult.response
    }

    const { auth } = authResult
    const service = createServiceClient()

    const body = await request.json()
    const parsed = DeactivateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { orgSlug, orgId, memberId, reassignmentMode, targetProfileId } = parsed.data
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

    const result = await deactivateMember({
      orgId: targetOrgId,
      memberId,
      actorProfileId: auth.profile.id,
      reassignmentMode,
      targetProfileId,
    })

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Member deactivated and access revoked. Historical activities preserved.',
        reassignedCount: result.reassignedCount ?? 0,
      },
      { status: 200 }
    )
  } catch (err) {
    console.error('Error deactivating member:', err)
    return NextResponse.json({ error: 'Failed to deactivate member' }, { status: 500 })
  }
}
