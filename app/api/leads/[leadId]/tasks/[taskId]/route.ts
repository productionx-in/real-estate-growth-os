// app/api/leads/[leadId]/tasks/[taskId]/route.ts — PATCH: mark a follow-up done / cancelled, or reschedule it.
import { type NextRequest } from 'next/server'
import { TaskUpdateSchema } from '@/lib/validations/follow-ups'
import { authorizeLeadWork } from '@/lib/follow-ups/auth'
import { updateTask } from '@/lib/dal/follow-ups'
import { parseJson, respond, serverError } from '@/lib/routing/http'

type Ctx = { params: Promise<{ leadId: string; taskId: string }> }

export async function PATCH(request: NextRequest, { params }: Ctx) {
  try {
    const { leadId, taskId } = await params
    const input = await parseJson(request, TaskUpdateSchema)
    if (!input.ok) return input.response
    const auth = await authorizeLeadWork(leadId)
    if (!auth.success) return auth.response
    return respond(await updateTask(auth.work, taskId, input.data))
  } catch (err) {
    return serverError('update task', err)
  }
}
