// app/api/integrations/connections/route.ts
// Tenant-isolated API for listing and creating CRM integration connections
import { NextResponse, type NextRequest } from 'next/server'
import { authenticateCaller } from '@/lib/auth/tenant'
import { createServiceClient } from '@/lib/supabase/server'
import {
  getIntegrationConnections,
  createIntegrationConnection,
  getProjectMappings,
  createProjectMapping,
} from '@/lib/dal/integrations'
import { z } from 'zod'

const CreateConnectionSchema = z.object({
  orgId: z.string().uuid().optional(),
  orgSlug: z.string().optional(),
  provider: z.enum([
    'meta_ads',
    'google_ads',
    'website_webhook',
    'whatsapp_cloud',
    'property_portal_99acres',
    'property_portal_magicbricks',
    'property_portal_housing',
    'manual',
    'other',
  ]),
  name: z.string().min(2, 'Connection name must be at least 2 characters').max(100),
  externalAccountId: z.string().optional().nullable(),
  status: z.enum(['not_connected', 'connected', 'error', 'disabled']).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  initialMappings: z
    .array(
      z.object({
        projectId: z.string().uuid(),
        externalIdentifierType: z.enum(['campaign_id', 'form_id', 'page_id', 'account_default']),
        externalIdentifierValue: z.string().min(1),
        description: z.string().optional().nullable(),
      })
    )
    .optional(),
})

async function resolveTenantOrg(
  request: NextRequest,
  profileId: string,
  explicitOrgId?: string,
  explicitOrgSlug?: string
): Promise<{ orgId: string; role: string } | null> {
  const service = createServiceClient()
  const { searchParams } = new URL(request.url)
  const reqOrgId = explicitOrgId || searchParams.get('orgId') || searchParams.get('org_id')
  const reqOrgSlug = explicitOrgSlug || searchParams.get('orgSlug')

  let targetOrgId = reqOrgId

  if (!targetOrgId && reqOrgSlug) {
    const { data: org } = await service
      .from('organisations')
      .select('id')
      .eq('slug', reqOrgSlug)
      .maybeSingle()
    if (org) targetOrgId = org.id
  }

  if (targetOrgId) {
    const { data: membership } = await service
      .from('org_members')
      .select('role')
      .eq('org_id', targetOrgId)
      .eq('profile_id', profileId)
      .maybeSingle()

    if (!membership) return null
    return { orgId: targetOrgId, role: membership.role }
  }

  // Fallback to first active membership
  const { data: membership } = await service
    .from('org_members')
    .select('org_id, role')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!membership) return null
  return { orgId: membership.org_id, role: membership.role }
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await authenticateCaller()
    if (!authResult.success) return authResult.response

    const tenant = await resolveTenantOrg(request, authResult.auth.profile.id)
    if (!tenant) {
      return NextResponse.json(
        { error: 'Forbidden. You do not belong to this organisation.' },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const providerFilter = searchParams.get('provider')

    const connections = await getIntegrationConnections(tenant.orgId)
    const mappings = await getProjectMappings(tenant.orgId)

    // Filter by provider if specified
    const filtered = providerFilter
      ? connections.filter((c) => c.provider === providerFilter)
      : connections

    // Attach mapping summaries to connections for client convenience
    const enriched = filtered.map((conn) => {
      const connMappings = mappings.filter((m) => m.connection_id === conn.id)
      return {
        ...conn,
        mappingsCount: connMappings.length,
        mappings: connMappings,
      }
    })

    return NextResponse.json({ connections: enriched, orgId: tenant.orgId })
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
    const parsed = CreateConnectionSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const tenant = await resolveTenantOrg(
      request,
      authResult.auth.profile.id,
      parsed.data.orgId,
      parsed.data.orgSlug
    )
    if (!tenant) {
      return NextResponse.json(
        { error: 'Forbidden. You do not belong to this organisation.' },
        { status: 403 }
      )
    }

    if (!['owner', 'admin', 'manager'].includes(tenant.role)) {
      return NextResponse.json(
        { error: 'Forbidden. Only managers and administrators can manage integrations.' },
        { status: 403 }
      )
    }

    // Create the connection
    const { connection, error: createError } = await createIntegrationConnection(tenant.orgId, {
      provider: parsed.data.provider,
      name: parsed.data.name,
      external_account_id: parsed.data.externalAccountId ?? null,
      status: parsed.data.status ?? 'not_connected',
      connected_by: authResult.auth.profile.id,
      metadata: parsed.data.metadata ?? {},
    })

    if (createError || !connection) {
      return NextResponse.json({ error: createError ?? 'Failed to create connection' }, { status: 400 })
    }

    // Process initial mappings if provided
    const createdMappings = []
    if (parsed.data.initialMappings && parsed.data.initialMappings.length > 0) {
      for (const m of parsed.data.initialMappings) {
        const { mapping } = await createProjectMapping(tenant.orgId, {
          connection_id: connection.id,
          project_id: m.projectId,
          external_identifier_type: m.externalIdentifierType,
          external_identifier_value: m.externalIdentifierValue,
          description: m.description,
        })
        if (mapping) createdMappings.push(mapping)
      }
    }

    return NextResponse.json(
      {
        connection: {
          ...connection,
          mappingsCount: createdMappings.length,
          mappings: createdMappings,
        },
      },
      { status: 201 }
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
