// app/api/integrations/meta/forms/route.ts
// Retrieves active Lead Gen forms for a specific Facebook Page associated with a connected integration.
// Enables customers to map specific forms to internal projects in Stage 4B.

import { NextResponse, type NextRequest } from 'next/server'
import { authenticateCaller } from '@/lib/auth/tenant'
import { createServiceClient } from '@/lib/supabase/server'
import { decryptCredential } from '@/lib/integrations/crypto'
import { fetchPageLeadForms } from '@/lib/integrations/meta/client'

export async function GET(request: NextRequest) {
  try {
    const authResult = await authenticateCaller()
    if (!authResult.success) return authResult.response

    const searchParams = request.nextUrl.searchParams
    const connectionId = searchParams.get('connectionId')
    const pageId = searchParams.get('pageId')

    if (!connectionId || !pageId) {
      return NextResponse.json(
        { error: 'connectionId and pageId query parameters are required' },
        { status: 400 }
      )
    }

    const service = createServiceClient()

    const { data: conn } = await service
      .from('integration_connections')
      .select('id, org_id, status, metadata')
      .eq('id', connectionId)
      .maybeSingle()

    if (!conn) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
    }

    // RBAC: Verify user has manager, admin, or owner role in the organisation
    const { data: membership } = await service
      .from('org_members')
      .select('role')
      .eq('status', 'active')
      .eq('org_id', conn.org_id)
      .eq('profile_id', authResult.auth.profile.id)
      .maybeSingle()

    if (!membership || !['owner', 'admin', 'manager'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'Forbidden. Only managers and administrators can view integration forms.' },
        { status: 403 }
      )
    }

    if (conn.status !== 'connected') {
      return NextResponse.json(
        { error: 'Connection is not active. Please connect via Meta OAuth first.' },
        { status: 400 }
      )
    }

    const metadata = (conn.metadata || {}) as Record<string, unknown>
    const encryptedPageTokens = (metadata.encryptedPageTokens || {}) as Record<string, string>
    const encryptedToken = encryptedPageTokens[pageId]

    if (!encryptedToken) {
      return NextResponse.json(
        { error: `No encrypted access token found for Page ${pageId}. Reconnection may be required.` },
        { status: 404 }
      )
    }

    // Decrypt page token in memory; NEVER send token to client
    const pageAccessToken = decryptCredential(encryptedToken)
    const forms = await fetchPageLeadForms(pageId, pageAccessToken)

    return NextResponse.json({
      success: true,
      pageId,
      forms,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
