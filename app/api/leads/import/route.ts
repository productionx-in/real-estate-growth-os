// app/api/leads/import/route.ts
// Handles batch CSV lead import.
// Role-gated to managers, admins, and owners.
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const ImportPayloadSchema = z.object({
  projectId: z.string().uuid().optional().nullable(),
  leads: z
    .array(
      z.object({
        name: z.string().min(2).max(120),
        phone: z.string().min(7).max(20),
        email: z.string().email().optional().nullable(),
        source: z
          .enum([
            'website',
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
    const parsed = ImportPayloadSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    // 3. Resolve profile & membership
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()

    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 403 })

    const { data: membership } = await supabase
      .from('org_members')
      .select('org_id, role')
      .eq('profile_id', profile.id)
      .single()

    if (!membership) return NextResponse.json({ error: 'Organisation not found' }, { status: 403 })

    if (!['owner', 'admin', 'manager'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'Only managers, admins, and owners can import leads' },
        { status: 403 }
      )
    }

    const orgId = membership.org_id
    const { leads, projectId } = parsed.data

    // If projectId was supplied, confirm it belongs to this org
    if (projectId) {
      const { data: proj } = await supabase
        .from('projects')
        .select('id')
        .eq('id', projectId)
        .eq('org_id', orgId)
        .single()

      if (!proj) {
        return NextResponse.json({ error: 'Selected project does not exist in your organisation' }, { status: 400 })
      }
    }

    // 4. Prepare insert records
    const insertPayload = leads.map((lead) => ({
      org_id: orgId,
      project_id: projectId || null,
      name: lead.name,
      phone: lead.phone,
      email: lead.email || null,
      source: lead.source,
      status: 'new' as const,
      priority: lead.priority,
      budget_min: lead.budget_min ?? null,
      budget_max: lead.budget_max ?? null,
      notes: lead.notes || null,
      custom_fields: {},
    }))

    // 5. Batch insert leads
    const { data: insertedLeads, error: insertError } = await supabase
      .from('leads')
      .insert(insertPayload)
      .select('id')

    if (insertError || !insertedLeads) {
      return NextResponse.json(
        { error: insertError?.message ?? 'Failed to import leads' },
        { status: 500 }
      )
    }

    // 6. Log activities in bulk
    const activityPayload = insertedLeads.map((l) => ({
      lead_id: l.id,
      actor_id: profile.id,
      type: 'created' as const,
      note: 'Imported via CSV file',
      metadata: { source: 'csv_import' },
    }))

    await supabase.from('lead_activities').insert(activityPayload)

    return NextResponse.json({
      success: true,
      importedCount: insertedLeads.length,
    })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
