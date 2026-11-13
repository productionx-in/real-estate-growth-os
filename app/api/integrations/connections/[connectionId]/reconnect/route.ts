// app/api/integrations/connections/[connectionId]/reconnect/route.ts
// Customer-facing reconnect endpoint for refreshing expired or disabled connections
import { NextResponse, type NextRequest } from 'next/server'
import { authenticateCaller } from '@/lib/auth/tenant'
import { createServiceClient } from '@/lib/supabase/server'
import { reconnectIntegrationConnection, getProjectMappings } from '@/lib/dal/integrations'

interface RouteContext {
  params: Promise<{ connectionId: string }>
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const authResult = await authenticateCaller()
    if (!authResult.success) return authResult.response

    const { connectionId } = await params
    const service = createServiceClient()

    const { data: conn } = await service
      .from('integration_connections')
      .select('id, org_id, metadata')
      .eq('id', connectionId)
      .maybeSingle()

    if (!conn) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
    }

    const { data: membership } = await service
      .from('org_members')
      .select('role')
      .eq('org_id', conn.org_id)
      .eq('profile_id', authResult.auth.profile.id)
      .maybeSingle()

    if (!membership || !['owner', 'admin', 'manager'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'Forbidden. Only managers and administrators can reconnect integrations.' },
        { status: 403 }
      )
    }

    let bodyData: { metadata?: Record<string, unknown> } = {}
    try {
      bodyData = (await request.json()) as { metadata?: Record<string, unknown> }
    } catch {
      // Body is optional
    }

    const updatedMetadata = {
      ...((conn.metadata as Record<string, unknown>) || {}),
      ...(bodyData?.metadata || {}),
      healthStatus: 'healthy',
      lastReconnectedAt: new Date().toISOString(),
    }

    const { connection, error } = await reconnectIntegrationConnection(
      connectionId,
      conn.org_id,
      updatedMetadata
    )

    if (error || !connection) {
      return NextResponse.json({ error: error ?? 'Failed to reconnect integration' }, { status: 400 })
    }

    const mappings = await getProjectMappings(conn.org_id, connectionId)

    return NextResponse.json({
      connection: {
        ...connection,
        mappingsCount: mappings.length,
        mappings,
      },
      message: 'Integration reconnected successfully. Incoming enquiries will sync as normal.',
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
