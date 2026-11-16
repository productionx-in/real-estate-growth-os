// app/api/leads/[leadId]/outcome/route.ts — log a call outcome (2 taps) + schedule the next follow-up.
import { type NextRequest } from 'next/server'
import { DispositionSchema } from '@/lib/validations/follow-ups'
import { authorizeLeadWork } from '@/lib/follow-ups/auth'
import { logOutcome } from '@/lib/dal/follow-ups'
import { parseJson, respond, serverError } from '@/lib/routing/http'

type Ctx = { params: Promise<{ leadId: string }> }

export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const { leadId } = await params
    const input = await parseJson(request, DispositionSchema)
    if (!input.ok) return input.response
    const auth = await authorizeLeadWork(leadId)
    if (!auth.success) return auth.response
    return respond(await logOutcome(auth.work, input.data))
  } catch (err) {
    return serverError('log outcome', err)
  }
}
