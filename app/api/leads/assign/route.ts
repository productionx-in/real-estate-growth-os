// app/api/leads/assign/route.ts
// Assigns (or unassigns) a lead. Managers and above may give any lead to anyone who can take leads; a team
// lead only their team's leads, only to themselves or a teammate (lib/auth/permissions.ts canAssignTo).
// Everything is checked here on the server; the database triggers check assignee eligibility again.
import { assignableRolesFor } from '@/lib/dal/sales-structure'
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeLeadAccess } from '@/lib/auth/tenant'
import { ASSIGNABLE_ROLES, canAssignLeads, canAssignTo, canWorkLead } from '@/lib/auth/permissions'
import { createServiceClient } from '@/lib/supabase/server'
import type { MemberRole } from '@/types/database'

const AssignLeadSchema = z.object({
  leadId: z.string().uuid(),
  assignToProfileId: z.string().uuid().nullable(), // null = unassign
})

export async function POST(request: NextRequest) {
  try {
    const parsed = AssignLeadSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 })
    }
    const { leadId, assignToProfileId } = parsed.data

    // Lead exists, caller is an active member of its organisation and can see it.
    const auth = await authorizeLeadAccess(leadId)
    if (!auth.success) return auth.response
    const { context } = auth
    const { viewer, lead } = context

    if (!canAssignLeads(context.role)) {
      return NextResponse.json({ error: 'Only managers and team leads can assign leads.' }, { status: 403 })
    }
    if (context.role === 'team_lead') {
      // Only the team's leads (theirs, a teammate's), and a team lead never unassigns into the shared pool.
      if (!lead.assigned_to || !canWorkLead(viewer, lead)) {
        return NextResponse.json({ error: 'You can only reassign leads in your team.' }, { status: 403 })
      }
      if (!assignToProfileId) {
        return NextResponse.json({ error: 'Pick someone in your team.' }, { status: 403 })
      }
    }

    const service = createServiceClient()
    if (assignToProfileId) {
      if (!canAssignTo(viewer, assignToProfileId)) {
        return NextResponse.json({ error: 'You can only assign leads within your team.' }, { status: 403 })
      }
      const { data: target } = await service.from('org_members').select('role')
        .eq('org_id', context.orgId).eq('profile_id', assignToProfileId).eq('status', 'active').maybeSingle()
      if (!target || !(await assignableRolesFor(context.orgId)).includes(target.role as MemberRole)) {
        return NextResponse.json({ error: 'That person cannot be given leads in this workspace.' }, { status: 400 })
      }
    }

    const { error: updateError } = await service.from('leads')
      .update({ assigned_to: assignToProfileId })
      .eq('id', leadId).eq('org_id', context.orgId)
    if (updateError) return NextResponse.json({ error: 'Failed to update lead' }, { status: 500 })

    await service.from('lead_activities').insert({
      lead_id: leadId,
      actor_id: context.profile.id,
      type: 'assigned',
      note: assignToProfileId ? 'Lead assigned' : 'Lead unassigned',
      metadata: { previous_assignee: lead.assigned_to, new_assignee: assignToProfileId },
    })
    if (assignToProfileId) {
      await service.from('lead_assignments').insert({ lead_id: leadId, assigned_to: assignToProfileId, assigned_by: context.profile.id })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
