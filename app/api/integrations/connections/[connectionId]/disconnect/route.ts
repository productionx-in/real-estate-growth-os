// app/api/integrations/connections/[connectionId]/disconnect/route.ts
// Customer-facing disconnect endpoint that preserves all historical CRM leads and attribution
import { NextResponse, type NextRequest } from 'next/server'
import { authenticateCaller } from '@/lib/auth/tenant'
import { createServiceClient } from '@/lib/supabase/server'
import { disconnectIntegrationConnection } from '@/lib/dal/integrations'
import { auditMember } from '@/lib/dal/org-audit'
import { requireModule } from '@/lib/auth/entitlements'

interface RouteContext {
  params: Promise<{ connectionId: string }>
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const authResult = await authenticateCaller()
    if (!authResult.success) return authResult.response

    const { connectionId } = await params
    const service = createServiceClient()

    // Find connection to identify org
    const { data: conn } = await service
      .from('integration_connections')
      .select('id, org_id')
      .eq('id', connectionId)
      .maybeSingle()

    if (!conn) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
    }

    // RBAC: Verify user is manager/admin/owner in this organisation
    const { data: membership } = await service
      .from('org_members')
      .select('role')
      .eq('status', 'active')
      .eq('org_id', conn.org_id)
      .eq('profile_id', authResult.auth.profile.id)
      .maybeSingle()

    if (!membership || !['owner', 'admin', 'manager'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'Forbidden. Only managers and administrators can disconnect integrations.' },
        { status: 403 }
      )
    }
    { const gate = await requireModule(conn.org_id, 'integrations'); if (gate) return gate }

    const { success, error } = await disconnectIntegrationConnection(connectionId, conn.org_id)
    if (!success) {
      return NextResponse.json({ error: error ?? 'Failed to disconnect integration' }, { status: 400 })
    }
    await auditMember(request, authResult.auth, conn.org_id, 'integration.disconnected', { type: 'integration', id: connectionId })

    return NextResponse.json({
      success: true,
      message: 'Integration disconnected successfully. All historical leads and project attributions remain preserved.',
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
