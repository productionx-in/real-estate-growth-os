// app/api/team/invitations/revoke/route.ts
import { NextResponse, type NextRequest } from 'next/server'
import { authenticateCaller } from '@/lib/auth/tenant'
import { createServiceClient } from '@/lib/supabase/server'
import { revokeEmployeeInvitation } from '@/lib/dal/invitations'
import { z } from 'zod'

const RevokeSchema = z.object({
  orgSlug: z.string().optional(),
  orgId: z.string().uuid().optional(),
  invitationId: z.string().uuid(),
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
    const parsed = RevokeSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { orgSlug, orgId, invitationId } = parsed.data
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

    const result = await revokeEmployeeInvitation(targetOrgId, invitationId, auth.profile.id)
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({ success: true, message: 'Invitation revoked and seat released.' }, { status: 200 })
  } catch (err) {
    console.error('Error revoking invitation:', err)
    return NextResponse.json({ error: 'Failed to revoke invitation' }, { status: 500 })
  }
}
