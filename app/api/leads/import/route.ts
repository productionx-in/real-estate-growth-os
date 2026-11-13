// app/api/leads/import/route.ts
// Handles batch CSV lead imports (up to 500 leads) with tenant isolation and validation.
import { NextResponse, type NextRequest } from 'next/server'
import { authenticateCaller } from '@/lib/auth/tenant'
import { createServiceClient } from '@/lib/supabase/server'
import { z } from 'zod'

const ImportPayloadSchema = z.object({
  orgId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional().nullable(),
  leads: z
    .array(
      z.object({
        name: z.string().min(1, 'Name is required').max(100),
        phone: z.string().min(6, 'Valid phone number required').max(20),
        email: z.string().email().optional().nullable().or(z.literal('')),
        source: z
          .enum([
            'meta_ads',
            'google_ads',
            '99acres',
            'housing',
            'magicbricks',
            'whatsapp',
            'referral',
            'walk_in',
            'csv_import',
            'other',
          ])
          .default('csv_import'),
        priority: z.enum(['low', 'medium', 'high']).default('medium'),
        budget_min: z.coerce.number().min(0).optional().nullable(),
        budget_max: z.coerce.number().min(0).optional().nullable(),
        notes: z.string().max(2000).optional().nullable(),
      })
    )
    .min(1, 'At least one lead is required')
    .max(500, 'Batch limit is 500 leads per import'),
})

export async function POST(request: NextRequest) {
  try {
    const authResult = await authenticateCaller()
    if (!authResult.success) {
      return authResult.response
    }

    const { auth } = authResult
    const service = createServiceClient()

    const body = await request.json()
    const parsed = ImportPayloadSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    // Resolve target organisation
    const { orgId: requestedOrgId, leads, projectId } = parsed.data
    let targetOrgId: string

    if (requestedOrgId) {
      const { data: membership } = await service
        .from('org_members')
        .select('role')
        .eq('org_id', requestedOrgId)
        .eq('profile_id', auth.profile.id)
        .maybeSingle()

      if (!membership || !['owner', 'admin', 'manager'].includes(membership.role)) {
        return NextResponse.json(
          { error: 'Insufficient permissions for the specified organisation' },
          { status: 403 }
        )
      }
      targetOrgId = requestedOrgId
    } else {
      const { data: memberships } = await service
        .from('org_members')
        .select('org_id, role')
        .eq('profile_id', auth.profile.id)

      if (!memberships || memberships.length === 0) {
        return NextResponse.json({ error: 'Organisation not found' }, { status: 403 })
      }

      const managerMemberships = memberships.filter((m) =>
        ['owner', 'admin', 'manager'].includes(m.role)
      )

      if (managerMemberships.length === 0) {
        return NextResponse.json(
          { error: 'Only managers, admins, and owners can import leads' },
          { status: 403 }
        )
      }

      if (managerMemberships.length > 1) {
        return NextResponse.json(
          { error: 'User belongs to multiple organisations. Please specify orgId in the request.' },
          { status: 400 }
        )
      }

      targetOrgId = managerMemberships[0].org_id
    }

    // Cross-tenant scope verification: If projectId supplied, confirm it belongs to this org
    if (projectId) {
      const { data: proj } = await service
        .from('projects')
        .select('id')
        .eq('id', projectId)
        .eq('org_id', targetOrgId)
        .maybeSingle()

      if (!proj) {
        return NextResponse.json(
          { error: 'Selected project does not exist in the target organisation' },
          { status: 400 }
        )
      }
    }

    // Prepare insert records
    const insertPayload = leads.map((lead) => ({
      org_id: targetOrgId,
      project_id: projectId || null,
      name: lead.name,
      phone: lead.phone,
      email: lead.email || null,
      source: lead.source,
      priority: lead.priority,
      budget_min: lead.budget_min ?? null,
      budget_max: lead.budget_max ?? null,
      notes: lead.notes || null,
      status: 'new' as const,
      custom_fields: { imported_at: new Date().toISOString() },
    }))

    const { data: inserted, error: insertError } = await service
      .from('leads')
      .insert(insertPayload)
      .select('id')

    if (insertError) {
      return NextResponse.json(
        { error: insertError.message ?? 'Failed to insert leads batch' },
        { status: 500 }
      )
    }

    const importedCount = inserted?.length ?? 0

    // Log batch activity
    if (importedCount > 0) {
      await service.from('lead_activities').insert({
        lead_id: inserted![0].id,
        actor_id: auth.profile.id,
        type: 'note_added',
        note: `Imported as part of a batch of ${importedCount} leads via CSV.`,
        metadata: { batch_size: importedCount },
      })
    }

    return NextResponse.json(
      {
        success: true,
        importedCount,
        message: `Successfully imported ${importedCount} leads.`,
      },
      { status: 201 }
    )
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
