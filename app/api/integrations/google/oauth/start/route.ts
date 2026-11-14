// app/api/integrations/google/oauth/start/route.ts
// Initiates the Google Ads OAuth 2.0 handshake.
// Generates a cryptographically signed anti-CSRF state and returns the official Google authorization URL.

import { NextResponse, type NextRequest } from 'next/server'
import { authenticateCaller } from '@/lib/auth/tenant'
import { createServiceClient } from '@/lib/supabase/server'
import { getGoogleAppConfig, getGoogleOAuthRedirectUri } from '@/lib/integrations/google/config'
import { createGoogleOAuthState, getGoogleAuthorizationUrl } from '@/lib/integrations/google/oauth'

export async function POST(request: NextRequest) {
  try {
    const authResult = await authenticateCaller()
    if (!authResult.success) return authResult.response

    const body = await request.json().catch(() => ({}))
    const orgId = body.orgId as string | undefined
    const connectionId = body.connectionId as string | undefined
    const returnUrl = body.returnUrl as string | undefined

    if (!orgId) {
      return NextResponse.json({ error: 'orgId is required to initiate OAuth' }, { status: 400 })
    }

    const service = createServiceClient()

    // Enforce Tenant Role RBAC: only owner, admin, or manager can initiate connections
    const { data: membership } = await service
      .from('org_members')
      .select('role')
      .eq('org_id', orgId)
      .eq('profile_id', authResult.auth.profile.id)
      .maybeSingle()

    if (!membership || !['owner', 'admin', 'manager'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'Forbidden. Only managers and administrators can connect integration channels.' },
        { status: 403 }
      )
    }

    // Check central Google App configuration
    const config = getGoogleAppConfig()
    if (!config.isConfigured) {
      return NextResponse.json(
        {
          error: 'google_app_not_configured',
          message:
            'Central Production X Google Developer App is not yet configured. The following environment variables must be configured on the server: ' +
            config.missing.join(', '),
          missing: config.missing,
        },
        { status: 400 }
      )
    }

    let targetConnectionId = connectionId

    // If an existing connection was provided, verify it belongs to this organisation
    if (targetConnectionId) {
      const { data: existingConn } = await service
        .from('integration_connections')
        .select('id, org_id')
        .eq('id', targetConnectionId)
        .eq('org_id', orgId)
        .maybeSingle()

      if (!existingConn) {
        return NextResponse.json({ error: 'Connection not found in this organisation' }, { status: 404 })
      }
    } else {
      // Create a draft connection in not_connected status
      const { data: newConn, error: insertError } = await service
        .from('integration_connections')
        .insert({
          org_id: orgId,
          provider: 'google_ads',
          name: 'Google Ads',
          status: 'not_connected',
          connected_by: authResult.auth.profile.id,
          metadata: {
            authorization_status: 'pending_oauth',
            initiated_at: new Date().toISOString(),
          },
        })
        .select('id')
        .single()

      if (insertError || !newConn) {
        return NextResponse.json(
          { error: insertError?.message ?? 'Failed to initialize Google Ads connection' },
          { status: 500 }
        )
      }

      targetConnectionId = newConn.id
    }

    const redirectUri = getGoogleOAuthRedirectUri(request.nextUrl.origin)

    // Generate cryptographically signed anti-CSRF state
    const state = createGoogleOAuthState({
      orgId,
      connectionId: targetConnectionId,
      userId: authResult.auth.profile.id,
      returnUrl,
    })

    const authUrl = getGoogleAuthorizationUrl(state, redirectUri)

    return NextResponse.json({
      url: authUrl,
      state,
      connectionId: targetConnectionId,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error'
    console.error('Google OAuth initiation error:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
