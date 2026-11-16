// app/api/leads/import/route.ts
// Handles batch CSV lead imports (up to 500 leads) with tenant isolation and validation.
import { NextResponse, type NextRequest } from 'next/server'
import { authenticateCaller } from '@/lib/auth/tenant'
import { createServiceClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { normaliseName } from '@/lib/import/crm-mapping'

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
        created_at: z.string().datetime().optional().nullable(),
        status: z.enum(['new', 'contacted', 'qualified', 'site_visit_scheduled', 'site_visited', 'negotiation', 'booked', 'lost', 'junk']).default('new'),
        owner: z.string().max(200).optional().nullable(),
        project_name: z.string().max(200).optional().nullable(),
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
    const url = new URL(request.url)
    let requestedOrgId = (
      parsed.data.orgId ||
      body.orgId ||
      body.org_id ||
      url.searchParams.get('orgId') ||
      url.searchParams.get('org_id')
    ) as string | undefined
    const { leads, projectId } = parsed.data

    if (!requestedOrgId) {
      const requestedOrgSlug = (
        body.orgSlug ||
        body.org_slug ||
        url.searchParams.get('orgSlug') ||
        url.searchParams.get('org_slug')
      ) as string | undefined
      if (requestedOrgSlug) {
        const { data: org } = await service
          .from('organisations')
          .select('id')
          .eq('slug', requestedOrgSlug)
          .maybeSingle()
        if (org) requestedOrgId = org.id
      }
    }

    if (!requestedOrgId) {
      const referer = request.headers.get('referer')
      if (referer) {
        try {
          const refPath = new URL(referer).pathname
          const match = refPath.match(/^\/([^/]+)\/leads/)
          if (match && match[1] && match[1] !== 'leads' && match[1] !== 'api') {
            const { data: org } = await service
              .from('organisations')
              .select('id')
              .eq('slug', match[1])
              .maybeSingle()
            if (org) requestedOrgId = org.id
          }
        } catch {
          // ignore
        }
      }
    }

    let targetOrgId: string

    if (requestedOrgId) {
      const { data: membership } = await service
        .from('org_members')
        .select('role')
        .eq('status', 'active')
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
        .eq('status', 'active')
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

    // Match salespeople (by name or email) to ACTIVE members of this organisation, and projects by name.
    // Unmatched values are kept on the lead (custom_fields) and reported back, never guessed.
    const ownerKeys = new Map<string, string>()
    if (leads.some((l) => l.owner)) {
      const { data: members } = await service.from('org_members')
        .select('profile_id, role, profile:profiles!org_members_profile_id_fkey(full_name, auth_user_id)')
        .eq('org_id', targetOrgId).eq('status', 'active').neq('role', 'readonly')
      const authIds = new Map<string, string>()
      for (const m of members ?? []) {
        if (m.profile?.full_name) ownerKeys.set(normaliseName(m.profile.full_name), m.profile_id)
        if (m.profile?.auth_user_id) authIds.set(m.profile.auth_user_id, m.profile_id)
      }
      if (leads.some((l) => l.owner?.includes('@')) && authIds.size > 0) {
        for (let page = 1; page <= 10; page++) {
          const { data } = await service.auth.admin.listUsers({ page, perPage: 1000 })
          for (const u of data?.users ?? []) {
            const pid = authIds.get(u.id)
            if (pid && u.email) ownerKeys.set(normaliseName(u.email), pid)
          }
          if (!data || data.users.length < 1000) break
        }
      }
    }
    const projectKeys = new Map<string, string>()
    if (leads.some((l) => l.project_name)) {
      const { data: projects } = await service.from('projects').select('id, name').eq('org_id', targetOrgId)
      for (const p of projects ?? []) projectKeys.set(normaliseName(p.name), p.id)
    }

    const unmatchedOwners = new Set<string>()
    const unmatchedProjects = new Set<string>()
    const importedAt = new Date().toISOString()

    // Prepare insert records
    const insertPayload = leads.map((lead) => {
      const ownerId = lead.owner ? ownerKeys.get(normaliseName(lead.owner)) ?? null : null
      if (lead.owner && !ownerId) unmatchedOwners.add(lead.owner)
      const rowProject = lead.project_name ? projectKeys.get(normaliseName(lead.project_name)) ?? null : null
      if (lead.project_name && !rowProject) unmatchedProjects.add(lead.project_name)
      return {
        org_id: targetOrgId,
        project_id: rowProject ?? projectId ?? null,
        name: lead.name,
        phone: lead.phone,
        email: lead.email || null,
        source: lead.source,
        priority: lead.priority,
        budget_min: lead.budget_min ?? null,
        budget_max: lead.budget_max ?? null,
        notes: lead.notes || null,
        status: lead.status,
        ...(lead.created_at ? { created_at: lead.created_at } : {}),
        ...(ownerId ? { assigned_to: ownerId } : {}),
        // imported_at keeps bulk imports quiet: no per-lead alerts or response clocks (migration 20260041).
        custom_fields: {
          imported_at: importedAt,
          ...(lead.owner && !ownerId ? { original_owner: lead.owner } : {}),
          ...(lead.project_name && !rowProject ? { original_project: lead.project_name } : {}),
        },
      }
    })

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
        unmatchedOwners: [...unmatchedOwners].slice(0, 50),
        unmatchedProjects: [...unmatchedProjects].slice(0, 50),
        message: `Successfully imported ${importedCount} leads.`,
      },
      { status: 201 }
    )
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
