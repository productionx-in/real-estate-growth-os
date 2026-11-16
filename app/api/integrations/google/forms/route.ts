// app/api/integrations/google/forms/route.ts
// Retrieves Google Ads Lead Forms for a connected integration to support project mapping.

import { NextResponse, type NextRequest } from 'next/server'
import { authenticateCaller } from '@/lib/auth/tenant'
import { createServiceClient } from '@/lib/supabase/server'
import { fetchGoogleLeadForms } from '@/lib/integrations/google/client'
import { decryptCredential } from '@/lib/integrations/crypto'

export async function GET(request: NextRequest) {
  try {
    const authResult = await authenticateCaller()
    if (!authResult.success) return authResult.response

    const searchParams = request.nextUrl.searchParams
    const connectionId = searchParams.get('connectionId')

    if (!connectionId) {
      return NextResponse.json({ error: 'connectionId query parameter is required' }, { status: 400 })
    }

    const service = createServiceClient()

    // 1. Fetch connection and verify ownership
    const { data: conn } = await service
      .from('integration_connections')
      .select('id, org_id, provider, status, external_account_id, credential_ref, metadata')
      .eq('id', connectionId)
      .eq('provider', 'google_ads')
      .maybeSingle()

    if (!conn) {
      return NextResponse.json({ error: 'Google Ads connection not found' }, { status: 404 })
    }

    // 2. Verify caller membership in the connection's organisation
    const { data: membership } = await service
      .from('org_members')
      .select('role')
      .eq('status', 'active')
      .eq('org_id', conn.org_id)
      .eq('profile_id', authResult.auth.profile.id)
      .maybeSingle()

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden. You do not belong to this organisation.' }, { status: 403 })
    }

    if (conn.status !== 'connected' || !conn.credential_ref) {
      return NextResponse.json(
        { forms: [], message: 'Connection is not active or authorized.' },
        { status: 200 }
      )
    }

    const customerId = conn.external_account_id
    if (!customerId) {
      return NextResponse.json(
        { forms: [], message: 'No Google Ads customer account selected.' },
        { status: 200 }
      )
    }

    try {
      const decryptedToken = decryptCredential(conn.credential_ref)
      const forms = await fetchGoogleLeadForms(customerId, decryptedToken)
      return NextResponse.json({ forms })
    } catch {
      // Return empty list gracefully if developer token or API call is in deferred mode
      return NextResponse.json({
        forms: [],
        deferredMode: true,
        message: 'Google Ads Lead Forms retrieval requires active Google Developer Token approval.',
      })
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
