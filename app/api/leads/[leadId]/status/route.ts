// app/api/leads/[leadId]/status/route.ts
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { updateLeadStatus } from '@/lib/dal/leads'
import type { LeadStatus } from '@/types/database'
import { canTransition } from '@/lib/leads/transitions'
import { getWorkspaceSettings } from '@/lib/dal/workspace-settings'
import { checkCloseReason } from '@/lib/settings/workspace'

const StatusSchema = z.object({
  status: z.enum([
    'new', 'contacted', 'qualified', 'site_visit_scheduled',
    'site_visited', 'negotiation', 'booked', 'lost', 'junk',
  ]),
  note: z.string().max(500).optional(),
  /** Why the lead is closed (Lost or Junk), from the workspace's list (Settings → Lead settings). */
  reason: z.string().max(80).optional(),
})


export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  try {
    const { leadId } = await params
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const body = await request.json()
    const parsed = StatusSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    // Fetch current lead status
    const { data: lead } = await supabase
      .from('leads')
      .select('status, org_id')
      .eq('id', leadId)
      .single()

    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

    // Validate transition is allowed
    if (!canTransition(lead.status as LeadStatus, parsed.data.status as LeadStatus)) {
      return NextResponse.json(
        { error: `Cannot transition from '${lead.status}' to '${parsed.data.status}'` },
        { status: 400 }
      )
    }

    // Caller profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()

    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 403 })

    // Permission check: must be a member who can edit
    const { data: membership } = await supabase
      .from('org_members')
      .select('role')
      .eq('status', 'active')
      .eq('org_id', lead.org_id)
      .eq('profile_id', profile.id)
      .single()

    if (!membership || membership.role === 'readonly') {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // Closing a lead: the reason must come from the workspace's own list (or "Other" with a note).
    let closedReason: string | null = null
    if (parsed.data.status === 'lost' || parsed.data.status === 'junk') {
      const check = checkCloseReason((await getWorkspaceSettings(lead.org_id)).leads, parsed.data.status, parsed.data.reason, parsed.data.note)
      if (!check.ok) return NextResponse.json({ error: check.error, needsReason: true }, { status: 400 })
      closedReason = check.reason
    }

    const { error } = await updateLeadStatus(
      leadId,
      parsed.data.status as LeadStatus,
      profile.id,
      parsed.data.note,
      closedReason
    )

    if (error) return NextResponse.json({ error }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
