// app/api/integrations/mappings/route.ts
// Tenant-isolated API for creating and querying project routing mappings
import { NextResponse, type NextRequest } from 'next/server'
import { authenticateCaller } from '@/lib/auth/tenant'
import { createServiceClient } from '@/lib/supabase/server'
import { getProjectMappings, createProjectMapping } from '@/lib/dal/integrations'
import { z } from 'zod'

const CreateMappingSchema = z.object({
  connectionId: z.string().uuid(),
  projectId: z.string().uuid(),
  externalIdentifierType: z.enum(['campaign_id', 'form_id', 'page_id', 'account_default']),
  externalIdentifierValue: z.string().min(1, 'Identifier value cannot be empty'),
  description: z.string().optional().nullable(),
})

export async function GET(request: NextRequest) {
  try {
    const authResult = await authenticateCaller()
    if (!authResult.success) return authResult.response

    const { searchParams } = new URL(request.url)
    const orgId = searchParams.get('orgId')
    const connectionId = searchParams.get('connectionId') ?? undefined

    if (!orgId) {
      return NextResponse.json({ error: 'orgId query parameter is required' }, { status: 400 })
    }

    // Verify caller membership in org
    const service = createServiceClient()
    const { data: membership } = await service
      .from('org_members')
      .select('role')
      .eq('org_id', orgId)
      .eq('profile_id', authResult.auth.profile.id)
      .maybeSingle()

    if (!membership) {
      return NextResponse.json(
        { error: 'Forbidden. You do not belong to this organisation.' },
        { status: 403 }
      )
    }

    const mappingsRes = await getProjectMappings(orgId, connectionId)
    if (!mappingsRes.schemaAvailable) {
      return NextResponse.json(
        {
          mappings: [],
          schemaAvailable: false,
          error:
            mappingsRes.error ||
            'Integration project mappings schema is not initialized (Migration 20260015 pending).',
        },
        { status: 503 }
      )
    }
    return NextResponse.json({ mappings: mappingsRes.mappings, schemaAvailable: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await authenticateCaller()
    if (!authResult.success) return authResult.response

    const body = await request.json()
    const parsed = CreateMappingSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const service = createServiceClient()

    // Find connection to verify org and membership
    const { data: conn } = await service
      .from('integration_connections')
      .select('id, org_id')
      .eq('id', parsed.data.connectionId)
      .maybeSingle()

    if (!conn) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
    }

    // RBAC: Verify user is manager/admin/owner in this organisation
    const { data: membership } = await service
      .from('org_members')
      .select('role')
      .eq('org_id', conn.org_id)
      .eq('profile_id', authResult.auth.profile.id)
      .maybeSingle()

    if (!membership || !['owner', 'admin', 'manager'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'Forbidden. Only managers and administrators can create project mappings.' },
        { status: 403 }
      )
    }

    // Tenant protection: Verify target project belongs to the SAME organisation
    const { data: proj } = await service
      .from('projects')
      .select('id, org_id')
      .eq('id', parsed.data.projectId)
      .eq('org_id', conn.org_id)
      .maybeSingle()

    if (!proj) {
      return NextResponse.json(
        { error: 'Target project does not belong to this organisation.' },
        { status: 400 }
      )
    }

    const { mapping, error } = await createProjectMapping(conn.org_id, {
      connection_id: parsed.data.connectionId,
      project_id: parsed.data.projectId,
      external_identifier_type: parsed.data.externalIdentifierType,
      external_identifier_value: parsed.data.externalIdentifierValue,
      description: parsed.data.description,
    })

    if (error || !mapping) {
      return NextResponse.json({ error: error ?? 'Failed to create project mapping' }, { status: 400 })
    }

    return NextResponse.json({ mapping }, { status: 201 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
