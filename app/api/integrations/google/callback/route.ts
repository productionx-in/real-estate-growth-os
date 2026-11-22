// app/api/integrations/google/callback/route.ts
// Handles the redirect callback from Google OAuth authorization dialog.
// Validates HMAC state, exchanges code for access & refresh tokens, encrypts credentials,
// discovers accessible customer accounts, sets up webhook keys, and updates connection state.

import { NextResponse, type NextRequest } from 'next/server'
import { safeRedirectPath } from '@/lib/auth/safe-redirect'
import crypto from 'node:crypto'
import { createServiceClient } from '@/lib/supabase/server'
import { getGoogleOAuthRedirectUri } from '@/lib/integrations/google/config'
import { verifyGoogleOAuthState, exchangeGoogleCodeForTokens } from '@/lib/integrations/google/oauth'
import { fetchGoogleAdsCustomerAccounts, fetchGoogleUserInfo } from '@/lib/integrations/google/client'
import { encryptCredential } from '@/lib/integrations/crypto'
import type { Json } from '@/types/database'
import type { GoogleConnectionMetadata } from '@/lib/integrations/types'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const errorParam = searchParams.get('error')

  // 1. Verify anti-CSRF state parameter
  const stateResult = verifyGoogleOAuthState(state)
  if (!stateResult.valid || !stateResult.payload) {
    const errorMsg = stateResult.error || 'Invalid or expired Google OAuth state'
    return NextResponse.redirect(new URL(`/select-org?error=${encodeURIComponent(errorMsg)}`, request.nextUrl.origin))
  }

  const { orgId, connectionId, returnUrl } = stateResult.payload
  const service = createServiceClient()

  // Retrieve organisation slug for safe redirect
  const { data: org } = await service.from('organisations').select('slug').eq('id', orgId).maybeSingle()
  const fallbackRedirectUrl = org ? `/${org.slug}/integrations` : '/select-org'
  // returnUrl came from the browser when the flow started: same-origin paths only.
  const redirectTarget = safeRedirectPath(returnUrl, fallbackRedirectUrl)

  // 2. Handle provider denial or cancellation
  if (errorParam) {
    if (connectionId) {
      await service
        .from('integration_connections')
        .update({
          status: 'error',
          last_error: errorParam,
          metadata: {
            authorization_status: 'failed',
            failed_at: new Date().toISOString(),
            error_details: errorParam,
          } as unknown as Json,
        })
        .eq('id', connectionId)
        .eq('org_id', orgId)
    }

    const redirectWithErr = new URL(redirectTarget, request.nextUrl.origin)
    redirectWithErr.searchParams.set('error', errorParam)
    redirectWithErr.searchParams.set('connectionId', connectionId || '')
    return NextResponse.redirect(redirectWithErr)
  }

  if (!code) {
    return NextResponse.redirect(
      new URL(`${redirectTarget}?error=${encodeURIComponent('No authorization code received from Google')}`, request.nextUrl.origin)
    )
  }

  try {
    const redirectUri = getGoogleOAuthRedirectUri(request.nextUrl.origin)

    // 3. Exchange code for access & refresh tokens
    const tokens = await exchangeGoogleCodeForTokens(code, redirectUri)

    // 4. Discover user profile info and customer accounts
    const userInfo = await fetchGoogleUserInfo(tokens.accessToken)
    const customerAccounts = await fetchGoogleAdsCustomerAccounts(tokens.accessToken).catch(() => [])

    // 5. Encrypt credentials with AES-256-GCM vault references
    // Priority: refresh_token allows perpetual background offline sync; fallback to access_token
    const credentialToStore = tokens.refreshToken || tokens.accessToken
    const encryptedVaultRef = encryptCredential(credentialToStore)

    // Generate a dedicated Google Ads Lead Form webhook key for this connection
    const webhookKey = `whsec_google_${crypto.randomBytes(20).toString('hex')}`
    const encryptedWebhookKey = encryptCredential(webhookKey)

    const tokenExpiryDate = new Date(Date.now() + tokens.expiresIn * 1000).toISOString()
    const firstAccountId = customerAccounts.length > 0 ? customerAccounts[0].id : null

    const metadata: GoogleConnectionMetadata = {
      customerAccounts,
      selectedCustomerId: firstAccountId || undefined,
      authorizedEmail: userInfo.email,
      tokenExpiry: tokenExpiryDate,
      scopes: tokens.scope ? tokens.scope.split(' ') : undefined,
      encryptedWebhookKey,
      webhookKeyPrefix: webhookKey.slice(0, 12) + '...',
      healthStatus: 'healthy',
      connected_at: new Date().toISOString(),
    }

    // 6. Update integration connection record
    if (connectionId) {
      await service
        .from('integration_connections')
        .update({
          status: 'connected',
          credential_ref: encryptedVaultRef,
          external_account_id: firstAccountId,
          last_sync_at: new Date().toISOString(),
          last_error: null,
          metadata: metadata as unknown as Json,
        })
        .eq('id', connectionId)
        .eq('org_id', orgId)

      // 7. Log audit event
      await service.from('integration_event_logs').insert({
        org_id: orgId,
        connection_id: connectionId,
        provider: 'google_ads',
        event_type: 'google_ads_connected',
        processing_status: 'processed',
        processed_at: new Date().toISOString(),
      })
    }

    const successRedirect = new URL(redirectTarget, request.nextUrl.origin)
    successRedirect.searchParams.set('success', 'google_connected')
    successRedirect.searchParams.set('connectionId', connectionId || '')
    return NextResponse.redirect(successRedirect)
  } catch (err: unknown) {
    const errorDetails = err instanceof Error ? err.message : 'Google OAuth completion failed'
    console.error('Google OAuth callback error:', err)

    if (connectionId) {
      await service
        .from('integration_connections')
        .update({
          status: 'error',
          last_error: errorDetails,
        })
        .eq('id', connectionId)
        .eq('org_id', orgId)
    }

    const redirectWithErr = new URL(redirectTarget, request.nextUrl.origin)
    redirectWithErr.searchParams.set('error', errorDetails)
    redirectWithErr.searchParams.set('connectionId', connectionId || '')
    return NextResponse.redirect(redirectWithErr)
  }
}
