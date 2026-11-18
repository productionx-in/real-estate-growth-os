// app/api/whatsapp/conversations/[conversationId]/read/route.ts — mark a conversation as read.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { markRead } from '@/lib/dal/whatsapp-inbox'
import { resolveLeadViewer } from '@/lib/dal/viewer'

export async function POST(request: NextRequest, { params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await params
  const body = z.object({ orgId: z.string().uuid() }).safeParse(await request.json().catch(() => null))
  if (!z.string().uuid().safeParse(conversationId).success || !body.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
  const access = await authorizeOrgAccess(body.data.orgId)
  if (!access.success) return access.response
  const ok = await markRead(body.data.orgId, conversationId, await resolveLeadViewer(body.data.orgId, access.context.role, access.context.profile.id))
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Conversation not found.' }, { status: 404 })
}
