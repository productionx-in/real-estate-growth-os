// app/api/integrations/connections/[connectionId]/route.ts
// Tenant-isolated API for retrieving, updating, or disconnecting a specific connection
import { NextResponse, type NextRequest } from 'next/server'
import { authenticateCaller } from '@/lib/auth/tenant'
import { createServiceClient } from '@/lib/supabase/server'
import {
  getIntegrationConnectionById,
  updateIntegrationConnection,
  disconnectIntegrationConnection,
  getProjectMappings,
} from '@/lib/dal/integrations'
import { z } from 'zod'

const UpdateConnectionSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  status: z.enum(['not_connected', 'connected', 'error', 'disabled']).optional(),
  externalAccountId: z.string().optional().nullable(),
  metadata: z.record(z.string(), z.any()).optional(),
})

interface RouteContext {
  params: Promise<{ connectionId: string }>
}

async function verifyConnectionAccess(
  connectionId: string,
  profileId: string,
  requiredRoles?: string[]
): Promise<
  | { success: true; connection: Record<string, unknown>; orgId: string; role: string }
  | { success: false; response: NextResponse }
> {
  const service = createServiceClient()

  // First fetch connection to know its org_id
  const { data: conn, error: connErr } = await service
    .from('integration_connections')
    .select('*')
    .eq('id', connectionId)
    .maybeSingle()

  if (connErr || !conn) {
    return {
      success: false,
      response: NextResponse.json({ error: 'Integration connection not found' }, { status: 404 }),
    }
  }

  // Check user membership in this organisation
  const { data: membership } = await service
    .from('org_members')
    .select('role')
    .eq('org_id', conn.org_id)
    .eq('profile_id', profileId)
    .maybeSingle()

  if (!membership) {
    return {
      success: false,
      response: NextResponse.json(
        { error: 'Forbidden. You do not belong to this organisation.' },
        { status: 403 }
      ),
    }
  }

  if (requiredRoles && !requiredRoles.includes(membership.role)) {
    return {
      success: false,
      response: NextResponse.json(
        { error: 'Forbidden. Insufficient permissions for this action.' },
        { status: 403 }
      ),
    }
  }

  return { success: true, connection: conn, orgId: conn.org_id, role: membership.role }
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const authResult = await authenticateCaller()
    if (!authResult.success) return authResult.response

    const { connectionId } = await params
    const access = await verifyConnectionAccess(connectionId, authResult.auth.profile.id)
    if (!access.success) return access.response

    const connection = await getIntegrationConnectionById(connectionId, access.orgId)
    if (!connection) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
    }

    const mappingsRes = await getProjectMappings(access.orgId, connectionId)
    const mappings = mappingsRes.mappings

    return NextResponse.json({
      connection: {
        ...connection,
        mappingsCount: mappings.length,
        mappings,
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const authResult = await authenticateCaller()
    if (!authResult.success) return authResult.response

    const { connectionId } = await params
    const access = await verifyConnectionAccess(connectionId, authResult.auth.profile.id, [
      'owner',
      'admin',
      'manager',
    ])
    if (!access.success) return access.response

    const body = await request.json()
    const parsed = UpdateConnectionSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { connection, error } = await updateIntegrationConnection(connectionId, access.orgId, {
      name: parsed.data.name,
      status: parsed.data.status,
      external_account_id: parsed.data.externalAccountId,
      metadata: parsed.data.metadata,
    })

    if (error || !connection) {
      return NextResponse.json({ error: error ?? 'Failed to update connection' }, { status: 400 })
    }

    const mappingsRes = await getProjectMappings(access.orgId, connectionId)
    const mappings = mappingsRes.mappings

    return NextResponse.json({
      connection: {
        ...connection,
        mappingsCount: mappings.length,
        mappings,
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const authResult = await authenticateCaller()
    if (!authResult.success) return authResult.response

    const { connectionId } = await params
    const access = await verifyConnectionAccess(connectionId, authResult.auth.profile.id, [
      'owner',
      'admin',
      'manager',
    ])
    if (!access.success) return access.response

    // Safe disconnect preserving historical leads
    const { success, error } = await disconnectIntegrationConnection(connectionId, access.orgId)
    if (!success) {
      return NextResponse.json({ error: error ?? 'Failed to disconnect connection' }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      message: 'Integration disconnected successfully. Historical leads and attribution preserved.',
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
