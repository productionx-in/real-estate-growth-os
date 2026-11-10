// app/api/leads/[leadId]/status/route.ts
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { updateLeadStatus } from '@/lib/dal/leads'
import type { LeadStatus } from '@/types/database'

const StatusSchema = z.object({
  status: z.enum([
    'new', 'contacted', 'qualified', 'site_visit_scheduled',
    'site_visited', 'negotiation', 'booked', 'lost', 'junk',
  ]),
  note: z.string().max(500).optional(),
})

// Allowed transitions — mirrors the client-side config
const ALLOWED: Partial<Record<LeadStatus, LeadStatus[]>> = {
  new: ['contacted', 'junk'],
  contacted: ['qualified', 'junk'],
  qualified: ['site_visit_scheduled', 'lost'],
  site_visit_scheduled: ['site_visited', 'lost'],
  site_visited: ['negotiation', 'lost'],
  negotiation: ['booked', 'lost'],
}

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
    const allowed = ALLOWED[lead.status as LeadStatus] ?? []
    if (!allowed.includes(parsed.data.status as LeadStatus)) {
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
      .eq('org_id', lead.org_id)
      .eq('profile_id', profile.id)
      .single()

    if (!membership || membership.role === 'readonly') {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const { error } = await updateLeadStatus(
      leadId,
      parsed.data.status as LeadStatus,
      profile.id,
      parsed.data.note
    )

    if (error) return NextResponse.json({ error }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
