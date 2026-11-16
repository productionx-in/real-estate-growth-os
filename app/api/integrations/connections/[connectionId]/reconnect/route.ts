// app/api/integrations/connections/[connectionId]/reconnect/route.ts
// Initiates re-authentication for an expired, error, or disabled integration connection.
// Returns a real Meta OAuth initiation URL linked to the specific connection record.

import { NextResponse, type NextRequest } from 'next/server'
import { authenticateCaller } from '@/lib/auth/tenant'
import { createServiceClient } from '@/lib/supabase/server'
import { getMetaAppConfig, getMetaOAuthRedirectUri } from '@/lib/integrations/meta/config'
import { createOAuthState, getMetaAuthorizationUrl } from '@/lib/integrations/meta/oauth'
import { getGoogleAppConfig, getGoogleOAuthRedirectUri } from '@/lib/integrations/google/config'
import { createGoogleOAuthState, getGoogleAuthorizationUrl } from '@/lib/integrations/google/oauth'
import type { Json } from '@/types/database'

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
      .select('id, org_id, provider, status, metadata')
      .eq('id', connectionId)
      .maybeSingle()

    if (!conn) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
    }

    const { data: membership } = await service
      .from('org_members')
      .select('role')
      .eq('status', 'active')
      .eq('org_id', conn.org_id)
      .eq('profile_id', authResult.auth.profile.id)
      .maybeSingle()

    if (!membership || !['owner', 'admin', 'manager'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'Forbidden. Only managers and administrators can reconnect integrations.' },
        { status: 403 }
      )
    }

    // Provider: WhatsApp Business Cloud API
    if (conn.provider === 'whatsapp_cloud') {
      await service
        .from('integration_connections')
        .update({
          metadata: {
            ...((conn.metadata || {}) as Record<string, unknown>),
            reconnect_initiated_at: new Date().toISOString(),
            reconnect_initiated_by: authResult.auth.profile.id,
          } as unknown as Json,
        })
        .eq('id', conn.id)

      return NextResponse.json({
        success: true,
        provider: 'whatsapp_cloud',
        reconnectAvailable: true,
        connectionId: conn.id,
        message:
          'To re-authorize WhatsApp Business Cloud API, generate a new System User Access Token in Meta Business Manager and update the connection credentials in the WhatsApp Wizard.',
      })
    }

    // Provider: Google Ads
    if (conn.provider === 'google_ads') {
      const gConfig = getGoogleAppConfig()
      if (!gConfig.isConfigured) {
        return NextResponse.json(
          {
            error: 'google_app_not_configured',
            reconnectAvailable: false,
            message:
              'Central Google Cloud OAuth credentials are not configured in environment variables (' +
              gConfig.missing.join(', ') +
              '). Reconnection cannot be completed until the Google app is registered.',
            missing: gConfig.missing,
          },
          { status: 400 }
        )
      }

      const gState = createGoogleOAuthState({
        orgId: conn.org_id,
        connectionId: conn.id,
        userId: authResult.auth.profile.id,
      })

      const requestOrigin = request.nextUrl.origin
      const redirectUri = getGoogleOAuthRedirectUri(requestOrigin)
      const authorizationUrl = getGoogleAuthorizationUrl(gState, redirectUri)

      return NextResponse.json({
        success: true,
        provider: 'google_ads',
        reconnectAvailable: true,
        authorizationUrl,
        connectionId: conn.id,
      })
    }

    // Provider: Meta Lead Ads
    const config = getMetaAppConfig()
    if (!config.isConfigured) {
      return NextResponse.json(
        {
          error: 'meta_app_not_configured',
          reconnectAvailable: false,
          message:
            'Central Production X Meta Developer App credentials are not configured in environment variables (' +
            config.missing.join(', ') +
            '). The connection cannot be re-authorized until the developer app is set up.',
          missing: config.missing,
        },
        { status: 400 }
      )
    }

    // Generate signed HMAC CSRF state bound to this specific connectionId
    const state = createOAuthState({
      orgId: conn.org_id,
      connectionId: conn.id,
      userId: authResult.auth.profile.id,
    })

    const requestOrigin = request.nextUrl.origin
    const redirectUri = getMetaOAuthRedirectUri(requestOrigin)
    const authorizationUrl = getMetaAuthorizationUrl(state, redirectUri)

    // Update metadata noting reconnection initiated
    await service
      .from('integration_connections')
      .update({
        metadata: {
          ...((conn.metadata || {}) as Record<string, unknown>),
          reconnect_initiated_at: new Date().toISOString(),
          reconnect_initiated_by: authResult.auth.profile.id,
        } as unknown as Json,
      })
      .eq('id', conn.id)

    return NextResponse.json({
      success: true,
      provider: 'meta_ads',
      reconnectAvailable: true,
      authorizationUrl,
      connectionId: conn.id,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
