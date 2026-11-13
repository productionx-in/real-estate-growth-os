// app/api/leads/[leadId]/route.ts
// Handles PUT (update) and DELETE for a single lead
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { LeadSchema } from '@/lib/validations/lead'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  try {
    const { leadId } = await params
    const supabase = await createClient()

    // 1. Auth check
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    // 2. Validate payload
    const body = await request.json()
    const parsed = LeadSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    // 3. Resolve user profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 403 })
    }

    // 4. Resolve lead
    const { data: lead } = await supabase
      .from('leads')
      .select('id, org_id, assigned_to')
      .eq('id', leadId)
      .single()

    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    // 5. Check permissions
    const { data: membership } = await supabase
      .from('org_members')
      .select('role')
      .eq('org_id', lead.org_id)
      .eq('profile_id', profile.id)
      .single()

    if (!membership || membership.role === 'readonly') {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // If sales_exec, they must be assigned to this lead
    if (membership.role === 'sales_exec' && lead.assigned_to !== profile.id) {
      return NextResponse.json({ error: 'You can only edit your assigned leads' }, { status: 403 })
    }

    // 6. Update lead record
    const { data: updated, error: updateError } = await supabase
      .from('leads')
      .update({
        name: parsed.data.name,
        phone: parsed.data.phone,
        email: parsed.data.email || null,
        source: parsed.data.source,
        status: parsed.data.status,
        priority: parsed.data.priority,
        project_id: parsed.data.project_id || null,
        budget_min: parsed.data.budget_min ?? null,
        budget_max: parsed.data.budget_max ?? null,
        notes: parsed.data.notes || null,
      })
      .eq('id', leadId)
      .select()
      .single()

    if (updateError || !updated) {
      return NextResponse.json(
        { error: updateError?.message ?? 'Failed to update lead' },
        { status: 500 }
      )
    }

    // 7. Log activity
    await supabase.from('lead_activities').insert({
      lead_id: leadId,
      actor_id: profile.id,
      type: 'note_added',
      note: 'Lead details updated',
      metadata: {},
    })

    return NextResponse.json({ lead: updated })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  try {
    const { leadId } = await params
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 403 })
    }

    const { data: lead } = await supabase
      .from('leads')
      .select('id, org_id')
      .eq('id', leadId)
      .single()

    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    // Only managers and above can delete
    const { data: membership } = await supabase
      .from('org_members')
      .select('role')
      .eq('org_id', lead.org_id)
      .eq('profile_id', profile.id)
      .single()

    if (!membership || !['owner', 'admin', 'manager'].includes(membership.role)) {
      return NextResponse.json({ error: 'Manager or above required to delete leads' }, { status: 403 })
    }

    const { error: deleteError } = await supabase.from('leads').delete().eq('id', leadId)

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
