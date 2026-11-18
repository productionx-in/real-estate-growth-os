// app/api/whatsapp/conversations/[conversationId]/messages/route.ts — reply to a buyer from the inbox.
// Any active member who can see the conversation, except read-only members. Meta's rules (opt-out, the
// 24-hour window, approved templates) and a per-person send limit are enforced in lib/dal/whatsapp-inbox.ts.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { sendReply } from '@/lib/dal/whatsapp-inbox'
import { MAX_TEMPLATE_PARAM, MAX_TEXT } from '@/lib/integrations/whatsapp/inbox-rules'

const Schema = z.discriminatedUnion('kind', [
  z.object({ orgId: z.string().uuid(), kind: z.literal('text'), text: z.string().max(MAX_TEXT) }),
  z.object({
    orgId: z.string().uuid(), kind: z.literal('template'),
    name: z.string().min(1).max(512), language: z.string().min(2).max(15),
    params: z.array(z.string().max(MAX_TEMPLATE_PARAM)).max(20).default([]),
  }),
])

export async function POST(request: NextRequest, { params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await params
  const parsed = Schema.safeParse(await request.json().catch(() => null))
  if (!z.string().uuid().safeParse(conversationId).success || !parsed.success) {
    return NextResponse.json({ error: 'Invalid message' }, { status: 400 })
  }
  const { orgId, ...input } = parsed.data

  const access = await authorizeOrgAccess(orgId)
  if (!access.success) return access.response
  const { context } = access

  const result = await sendReply(orgId, conversationId, { role: context.role, profileId: context.profile.id }, input)
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true }, { status: 201 })
}
