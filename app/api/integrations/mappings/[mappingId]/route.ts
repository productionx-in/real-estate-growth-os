// app/api/integrations/mappings/[mappingId]/route.ts
// Tenant-isolated API for updating or deleting an individual project mapping
import { NextResponse, type NextRequest } from 'next/server'
import { authenticateCaller } from '@/lib/auth/tenant'
import { createServiceClient } from '@/lib/supabase/server'
import { updateProjectMapping, deleteProjectMapping } from '@/lib/dal/integrations'
import { z } from 'zod'

interface RouteContext {
  params: Promise<{ mappingId: string }>
}

const UpdateMappingSchema = z.object({
  projectId: z.string().uuid().optional(),
  description: z.string().optional().nullable(),
})

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const authResult = await authenticateCaller()
    if (!authResult.success) return authResult.response

    const { mappingId } = await params
    const service = createServiceClient()

    // Find mapping to verify org ownership
    const { data: existingMapping } = await service
      .from('integration_project_mappings')
      .select('id, org_id')
      .eq('id', mappingId)
      .maybeSingle()

    if (!existingMapping) {
      return NextResponse.json({ error: 'Project mapping not found' }, { status: 404 })
    }

    // RBAC: Verify manager/admin/owner
    const { data: membership } = await service
      .from('org_members')
      .select('role')
      .eq('org_id', existingMapping.org_id)
      .eq('profile_id', authResult.auth.profile.id)
      .maybeSingle()

    if (!membership || !['owner', 'admin', 'manager'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'Forbidden. Only managers and administrators can edit project mappings.' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const parsed = UpdateMappingSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    // If changing project, verify target project belongs to the SAME organisation
    if (parsed.data.projectId) {
      const { data: proj } = await service
        .from('projects')
        .select('id, org_id')
        .eq('id', parsed.data.projectId)
        .eq('org_id', existingMapping.org_id)
        .maybeSingle()

      if (!proj) {
        return NextResponse.json(
          { error: 'Target project does not belong to this organisation.' },
          { status: 400 }
        )
      }
    }

    const { mapping, error } = await updateProjectMapping(mappingId, existingMapping.org_id, {
      project_id: parsed.data.projectId,
      description: parsed.data.description,
    })

    if (error || !mapping) {
      return NextResponse.json({ error: error ?? 'Failed to update mapping' }, { status: 400 })
    }

    return NextResponse.json({ mapping })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const authResult = await authenticateCaller()
    if (!authResult.success) return authResult.response

    const { mappingId } = await params
    const service = createServiceClient()

    const { data: existingMapping } = await service
      .from('integration_project_mappings')
      .select('id, org_id')
      .eq('id', mappingId)
      .maybeSingle()

    if (!existingMapping) {
      return NextResponse.json({ error: 'Project mapping not found' }, { status: 404 })
    }

    const { data: membership } = await service
      .from('org_members')
      .select('role')
      .eq('org_id', existingMapping.org_id)
      .eq('profile_id', authResult.auth.profile.id)
      .maybeSingle()

    if (!membership || !['owner', 'admin', 'manager'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'Forbidden. Only managers and administrators can delete project mappings.' },
        { status: 403 }
      )
    }

    const { success, error } = await deleteProjectMapping(mappingId, existingMapping.org_id)
    if (!success) {
      return NextResponse.json({ error: error ?? 'Failed to delete mapping' }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      message: 'Mapping deleted. Historical leads previously mapped remain unaffected.',
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
