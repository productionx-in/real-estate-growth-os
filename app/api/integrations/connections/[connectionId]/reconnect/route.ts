// app/api/integrations/connections/[connectionId]/reconnect/route.ts
// Customer-facing reconnect endpoint for refreshing expired or disabled connections
import { NextResponse, type NextRequest } from 'next/server'
import { authenticateCaller } from '@/lib/auth/tenant'
import { createServiceClient } from '@/lib/supabase/server'

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

    // STRICT SAFETY RULE: Reconnect must NOT report success simply by clearing an error
    // or changing a status. Until live Meta OAuth is implemented in Stage 4B,
    // re-authorisation is not available and disabled connections cannot be falsely marked active.
    return NextResponse.json(
      {
        error:
          'Live provider re-authorisation is not yet available. Reconnecting requires official Meta OAuth verification, which is scheduled for Stage 4B. The connection cannot be marked active without verified provider authorization.',
        reconnectAvailable: false,
      },
      { status: 400 }
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
