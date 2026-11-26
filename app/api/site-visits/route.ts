// app/api/site-visits/route.ts — book a site visit for a lead (owners/admins/managers, or the lead's salesperson).
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeLeadWork } from '@/lib/follow-ups/auth'
import { requireModule } from '@/lib/auth/entitlements'
import { canAssignLeads, canAssignTo } from '@/lib/auth/permissions'
import { scheduleVisit } from '@/lib/dal/site-visits'
import { createServiceClient } from '@/lib/supabase/server'

const Schema = z.object({
  leadId: z.string().uuid(),
  projectId: z.string().uuid(),
  assignedTo: z.string().uuid().nullable().optional(),
  scheduledAt: z.string().datetime({ offset: true }),
  visitorCount: z.number().int().min(1).max(50).optional(),
  accompaniedBy: z.string().trim().max(200).optional().nullable(),
  meetingLink: z.string().trim().url().startsWith('https://').max(500).optional().nullable().or(z.literal('')),
  notes: z.string().trim().max(2000).optional().nullable(),
})

export async function POST(request: NextRequest) {
  const parsed = Schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid visit', details: parsed.error.flatten() }, { status: 400 })
  const input = parsed.data

  const auth = await authorizeLeadWork(input.leadId)
  if (!auth.success) return auth.response
  const { context } = auth
  { const gate = await requireModule(context.orgId, 'visits'); if (gate) return gate }

  // A salesperson books visits for themselves; managers may give the visit to any active salesperson,
  // a team lead to someone in their team.
  let assignedTo = input.assignedTo ?? context.lead.assigned_to ?? context.profile.id
  if (!canAssignLeads(context.role)) assignedTo = context.profile.id
  else if (!canAssignTo(context.viewer, assignedTo)) {
    return NextResponse.json({ error: 'You can only give visits to people in your team.' }, { status: 403 })
  }
  const { data: member } = await createServiceClient().from('org_members').select('id')
    .eq('org_id', context.orgId).eq('profile_id', assignedTo).eq('status', 'active').maybeSingle()
  if (!member) return NextResponse.json({ error: 'The salesperson must be an active member of this workspace.' }, { status: 400 })

  const result = await scheduleVisit({
    orgId: context.orgId, leadId: input.leadId, projectId: input.projectId, assignedTo,
    scheduledAt: new Date(input.scheduledAt), actorId: context.profile.id, visitorCount: input.visitorCount,
    accompaniedBy: input.accompaniedBy, meetingLink: input.meetingLink || null, notes: input.notes,
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ success: true, id: result.data.id }, { status: 201 })
}
