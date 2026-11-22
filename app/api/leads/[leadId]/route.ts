// app/api/leads/[leadId]/route.ts
// Handles PUT (update) and DELETE for a single lead with tenant isolation and project scoping
import { NextResponse, type NextRequest } from 'next/server'
import { LeadSchema } from '@/lib/validations/lead'
import { authorizeLeadAccess } from '@/lib/auth/tenant'
import { SALES_WRITE_ROLES } from '@/lib/auth/permissions'
import { createServiceClient } from '@/lib/supabase/server'
import { auditMember } from '@/lib/dal/org-audit'

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

    // Authorize: a role that may change sales records, and the lead is within the caller's scope
    // (authorizeLeadAccess: own or unassigned for a sales executive, the team's for a team lead,
    // booked customers for post-sales).
    const authResult = await authorizeLeadAccess(leadId, [...SALES_WRITE_ROLES])
    if (!authResult.success) {
      return authResult.response
    }

    const { context } = authResult
    const service = createServiceClient()

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
  request: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  try {
    const { leadId } = await params

    // Require admin or owner to delete a lead
    const authResult = await authorizeLeadAccess(leadId, ['owner', 'admin'])
    if (!authResult.success) {
      return authResult.response
    }

    // Deleting moves the lead to the Archive for 30 days (20260073): restorable as it was, then erased by a daily job.
    const service = createServiceClient()
    const { data: archived, error: delError } = await service.rpc('archive_lead' as never, {
      p_lead: leadId, p_org: authResult.context.orgId, p_actor: authResult.context.profile.id,
    } as never)

    if (delError) {
      return NextResponse.json({ error: 'Could not delete the lead.' }, { status: 500 })
    }
    if (!archived) return NextResponse.json({ error: 'Lead not found.' }, { status: 404 })

    await auditMember(request, authResult.context, authResult.context.orgId, 'lead.archived', { type: 'lead', id: leadId }, {
      status: authResult.context.lead.status,
      project_id: authResult.context.lead.project_id,
    })

    return NextResponse.json({ success: true, archived: true, restorableDays: 30 })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
