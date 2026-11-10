// app/api/leads/assign/route.ts
// Assigns a lead to a sales exec. Only managers and above can call this.
// Validates role server-side — never trusts the client.
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const AssignLeadSchema = z.object({
  leadId: z.string().uuid(),
  assignToProfileId: z.string().uuid().nullable(), // null = unassign
})

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // 1. Auth check
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    // 2. Validate payload
    const body = await request.json()
    const parsed = AssignLeadSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 })
    }

    const { leadId, assignToProfileId } = parsed.data

    // 3. Fetch caller's profile + org membership
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 403 })
    }

    // 4. Confirm caller is a manager or above in the lead's org
    const { data: lead } = await supabase
      .from('leads')
      .select('id, org_id, assigned_to')
      .eq('id', leadId)
      .single()

    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    const { data: membership } = await supabase
      .from('org_members')
      .select('role')
      .eq('org_id', lead.org_id)
      .eq('profile_id', profile.id)
      .single()

    if (!membership || !['owner', 'admin', 'manager'].includes(membership.role)) {
      return NextResponse.json({ error: 'Insufficient permissions — manager or above required' }, { status: 403 })
    }

    // 5. If assigning to someone, verify they are a member of the same org
    if (assignToProfileId) {
      const { data: targetMember } = await supabase
        .from('org_members')
        .select('role')
        .eq('org_id', lead.org_id)
        .eq('profile_id', assignToProfileId)
        .single()

      if (!targetMember) {
        return NextResponse.json({ error: 'Target user is not a member of this organisation' }, { status: 400 })
      }
    }

    // 6. Update lead assignment
    const { error: updateError } = await supabase
      .from('leads')
      .update({ assigned_to: assignToProfileId })
      .eq('id', leadId)

    if (updateError) {
      return NextResponse.json({ error: 'Failed to update lead' }, { status: 500 })
    }

    // 7. Log assignment in lead_activities
    await supabase.from('lead_activities').insert({
      lead_id: leadId,
      actor_id: profile.id,
      type: 'assigned',
      note: assignToProfileId
        ? `Lead assigned`
        : `Lead unassigned`,
      metadata: {
        previous_assignee: lead.assigned_to,
        new_assignee: assignToProfileId,
      },
    })

    // 8. Record in lead_assignments history (only when assigning, not unassigning)
    if (assignToProfileId) {
      await supabase.from('lead_assignments').insert({
        lead_id: leadId,
        assigned_to: assignToProfileId,
        assigned_by: profile.id,
      })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
