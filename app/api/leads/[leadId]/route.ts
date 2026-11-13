// app/api/leads/[leadId]/route.ts
// Handles PUT (update) and DELETE for a single lead with tenant isolation and project scoping
import { NextResponse, type NextRequest } from 'next/server'
import { LeadSchema } from '@/lib/validations/lead'
import { authorizeLeadAccess } from '@/lib/auth/tenant'
import { createServiceClient } from '@/lib/supabase/server'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  try {
    const { leadId } = await params

    const body = await request.json()
    const parsed = LeadSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    // Authorize caller has access to this lead (non-readonly)
    const authResult = await authorizeLeadAccess(leadId, [
      'owner',
      'admin',
      'manager',
      'sales_exec',
    ])
    if (!authResult.success) {
      return authResult.response
    }

    const { context } = authResult
    const service = createServiceClient()

    // If caller is sales_exec, ensure they are assigned to this lead or it's unassigned
    if (context.role === 'sales_exec' && context.lead.assigned_to && context.lead.assigned_to !== context.profile.id) {
      return NextResponse.json(
        { error: 'Sales executives can only update leads assigned to them' },
        { status: 403 }
      )
    }

    // Cross-tenant scope verification: If project_id provided, verify it belongs to the lead's org
    if (parsed.data.project_id) {
      const { data: project } = await service
        .from('projects')
        .select('id, org_id')
        .eq('id', parsed.data.project_id)
        .maybeSingle()

      if (!project || project.org_id !== context.orgId) {
        return NextResponse.json(
          { error: 'Project does not exist in this organisation' },
          { status: 400 }
        )
      }
    }

    const { data: updated, error: updateError } = await service
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
      .eq('org_id', context.orgId)
      .select()
      .single()

    if (updateError || !updated) {
      return NextResponse.json(
        { error: updateError?.message ?? 'Failed to update lead' },
        { status: 500 }
      )
    }

    // Log activity
    await service.from('lead_activities').insert({
      lead_id: leadId,
      actor_id: context.profile.id,
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

    // Require admin or owner to delete a lead
    const authResult = await authorizeLeadAccess(leadId, ['owner', 'admin'])
    if (!authResult.success) {
      return authResult.response
    }

    const service = createServiceClient()
    const { error: delError } = await service
      .from('leads')
      .delete()
      .eq('id', leadId)
      .eq('org_id', authResult.context.orgId)

    if (delError) {
      return NextResponse.json({ error: delError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
