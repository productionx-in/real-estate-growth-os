// app/api/leads/[leadId]/tasks/route.ts — GET follow-ups for a lead; POST schedule a follow-up.
import { type NextRequest, NextResponse } from 'next/server'
import { TaskCreateSchema } from '@/lib/validations/follow-ups'
import { authorizeLeadWork } from '@/lib/follow-ups/auth'
import { authorizeLeadAccess } from '@/lib/auth/tenant'
import { createTask, listLeadTasks } from '@/lib/dal/follow-ups'
import { parseJson, respond, serverError } from '@/lib/routing/http'

type Ctx = { params: Promise<{ leadId: string }> }

export async function GET(_request: NextRequest, { params }: Ctx) {
  try {
    const { leadId } = await params
    const auth = await authorizeLeadAccess(leadId)
    if (!auth.success) return auth.response
    const { context } = auth
    if (context.role === 'sales_exec' && context.lead.assigned_to !== context.profile.id) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }
    return NextResponse.json({ data: await listLeadTasks(context.orgId, leadId) })
  } catch (err) {
    return serverError('list tasks', err)
  }
}

export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const { leadId } = await params
    const input = await parseJson(request, TaskCreateSchema)
    if (!input.ok) return input.response
    const auth = await authorizeLeadWork(leadId)
    if (!auth.success) return auth.response
    return respond(await createTask(auth.work, auth.context.lead.assigned_to, input.data), 201)
  } catch (err) {
    return serverError('create task', err)
  }
}
