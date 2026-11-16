// app/api/leads/[leadId]/contact/route.ts — record a tap on Call / WhatsApp (counts as first action).
import { type NextRequest } from 'next/server'
import { ContactActionSchema } from '@/lib/validations/follow-ups'
import { authorizeLeadWork } from '@/lib/follow-ups/auth'
import { logContactAttempt } from '@/lib/dal/follow-ups'
import { parseJson, respond, serverError } from '@/lib/routing/http'

type Ctx = { params: Promise<{ leadId: string }> }

export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const { leadId } = await params
    const input = await parseJson(request, ContactActionSchema)
    if (!input.ok) return input.response
    const auth = await authorizeLeadWork(leadId)
    if (!auth.success) return auth.response
    return respond(await logContactAttempt(auth.work, input.data.channel))
  } catch (err) {
    return serverError('log contact', err)
  }
}
