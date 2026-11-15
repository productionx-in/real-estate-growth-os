// app/api/invitations/validate/route.ts
import { NextResponse, type NextRequest } from 'next/server'
import { validateInvitationToken } from '@/lib/dal/invitations'
import { z } from 'zod'

const ValidateSchema = z.object({
  token: z.string().min(10, 'Invalid token'),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = ValidateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid invitation token parameter' }, { status: 400 })
    }

    const invitation = await validateInvitationToken(parsed.data.token)
    if (!invitation) {
      return NextResponse.json(
        { error: 'This invitation is invalid, has expired, or has already been accepted.' },
        { status: 404 }
      )
    }

    return NextResponse.json({ invitation }, { status: 200 })
  } catch (err) {
    console.error('Error validating invitation token:', err)
    return NextResponse.json({ error: 'Failed to validate invitation' }, { status: 500 })
  }
}
