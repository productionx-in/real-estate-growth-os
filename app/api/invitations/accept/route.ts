// app/api/invitations/accept/route.ts
import { NextResponse, type NextRequest } from 'next/server'
import { authenticateCaller } from '@/lib/auth/tenant'
import { acceptEmployeeInvitation } from '@/lib/dal/invitations'
import { z } from 'zod'

const AcceptSchema = z.object({
  token: z.string().min(10, 'Invalid token'),
})

export async function POST(request: NextRequest) {
  try {
    const authResult = await authenticateCaller()
    if (!authResult.success) {
      return authResult.response
    }

    const { auth } = authResult

    const body = await request.json()
    const parsed = AcceptSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid invitation token parameter' }, { status: 400 })
    }

    const result = await acceptEmployeeInvitation(parsed.data.token, auth.profile.id, auth.user.id)
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: result.status ?? 400 })
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Successfully joined organisation workspace.',
        orgSlug: result.orgSlug,
      },
      { status: 200 }
    )
  } catch (err) {
    console.error('Error accepting invitation:', err)
    return NextResponse.json({ error: 'Failed to accept invitation' }, { status: 500 })
  }
}
