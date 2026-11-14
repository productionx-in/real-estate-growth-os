// app/api/integrations/meta/callback/route.ts
// Handles the redirect callback from Meta OAuth authorization dialog.
// Validates HMAC state, exchanges code for long-lived tokens, encrypts credentials,
// retrieves pages/ad accounts, subscribes to leadgen webhooks, and updates connection state.

import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getMetaOAuthRedirectUri } from '@/lib/integrations/meta/config'
import { verifyOAuthState, exchangeCodeForToken, exchangeForLongLivedToken } from '@/lib/integrations/meta/oauth'
import { fetchUserPages, fetchUserAdAccounts, subscribePageToLeadGenWebhook } from '@/lib/integrations/meta/client'
import { encryptCredential } from '@/lib/integrations/crypto'
import type { Json } from '@/types/database'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const errorParam = searchParams.get('error')
  const errorReason = searchParams.get('error_reason')
  const errorDesc = searchParams.get('error_description')

  // 1. Verify state parameter
  const stateResult = verifyOAuthState(state)
  if (!stateResult.valid || !stateResult.payload) {
    const errorMsg = stateResult.error || 'Invalid or expired OAuth state'
    return NextResponse.redirect(new URL(`/select-org?error=${encodeURIComponent(errorMsg)}`, request.nextUrl.origin))
  }

  const { orgId, connectionId, userId, returnUrl } = stateResult.payload
  const service = createServiceClient()

  // Retrieve organisation slug for safe redirect
  const { data: org } = await service.from('organisations').select('slug').eq('id', orgId).maybeSingle()
  const fallbackRedirectUrl = org ? `/${org.slug}/integrations` : '/select-org'
  const redirectTarget = returnUrl || fallbackRedirectUrl

  // 2. Handle provider-side denial or error
  if (errorParam || errorDesc) {
    const errorDetails = errorDesc || errorReason || errorParam || 'User cancelled authorization'
    if (connectionId) {
      await service
        .from('integration_connections')
        .update({
          status: 'error',
          last_error: errorDetails,
          metadata: {
            authorization_status: 'failed',
            failed_at: new Date().toISOString(),
            error_details: errorDetails,
          } as unknown as Json,
        })
        .eq('id', connectionId)
        .eq('org_id', orgId)
    }

    const redirectWithErr = new URL(redirectTarget, request.nextUrl.origin)
    redirectWithErr.searchParams.set('error', errorDetails)
    redirectWithErr.searchParams.set('connectionId', connectionId || '')
    return NextResponse.redirect(redirectWithErr)
  }

  if (!code) {
    return NextResponse.redirect(
      new URL(`${redirectTarget}?error=${encodeURIComponent('No authorization code received from Meta')}`, request.nextUrl.origin)
    )
  }

  try {
    const requestOrigin = request.nextUrl.origin
    const redirectUri = getMetaOAuthRedirectUri(requestOrigin)

    // 3. Exchange code for short-lived user token
    const shortLived = await exchangeCodeForToken(code, redirectUri)

    // 4. Exchange short-lived token for 60-day Long-Lived Token
    const longLived = await exchangeForLongLivedToken(shortLived.accessToken)
    const tokenExpiryDate = new Date(Date.now() + longLived.expiresIn * 1000).toISOString()

    // 5. Query user pages and ad accounts
    const pagesWithTokens = await fetchUserPages(longLived.accessToken)
    const adAccounts = await fetchUserAdAccounts(longLived.accessToken).catch(() => [])

    // 6. Encrypt credentials: NEVER store plaintext access tokens
    const encryptedUserTokenRef = encryptCredential(longLived.accessToken)

    // Store encrypted page tokens separately so webhook receiver can look them up by pageId
    const encryptedPageTokens: Record<string, string> = {}
    const sanitizedPages = pagesWithTokens.map((p) => {
      if (p.accessToken) {
        encryptedPageTokens[p.id] = encryptCredential(p.accessToken)
      }
      return {
        id: p.id,
        name: p.name,
        category: p.category,
        accessStatus: p.accessStatus,
      }
    })

    // 7. Automatically subscribe pages to Lead Gen webhooks
    for (const page of pagesWithTokens) {
      if (page.accessToken) {
        await subscribePageToLeadGenWebhook(page.id, page.accessToken).catch((subErr) => {
          console.warn(`Could not subscribe page ${page.id} to leadgen webhook:`, subErr)
        })
      }
    }

    // 8. Update database connection record
    const primaryAccountId = pagesWithTokens[0]?.id || adAccounts[0]?.id || null

    if (connectionId) {
      await service
        .from('integration_connections')
        .update({
          status: 'connected',
          external_account_id: primaryAccountId,
          credential_ref: encryptedUserTokenRef,
          last_sync_at: new Date().toISOString(),
          last_error: null,
          connected_by: userId,
          metadata: {
            authorization_status: 'authorized',
            authorized_at: new Date().toISOString(),
            tokenExpiry: tokenExpiryDate,
            pages: sanitizedPages,
            encryptedPageTokens,
            adAccounts,
            healthStatus: 'healthy',
          } as unknown as Json,
        })
        .eq('id', connectionId)
        .eq('org_id', orgId)

      // Audit Log
      await service.from('integration_event_logs').insert({
        org_id: orgId,
        connection_id: connectionId,
        provider: 'meta_ads',
        event_type: 'oauth_connected',
        processing_status: 'processed',
        external_event_id: primaryAccountId,
      })
    }

    const successRedirect = new URL(redirectTarget, request.nextUrl.origin)
    successRedirect.searchParams.set('connectionId', connectionId || '')
    successRedirect.searchParams.set('status', 'connected')
    return NextResponse.redirect(successRedirect)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to complete Meta OAuth exchange'
    console.error('[Meta OAuth Callback Error]:', err)

    if (connectionId) {
      await service
        .from('integration_connections')
        .update({
          status: 'error',
          last_error: message,
          metadata: {
            authorization_status: 'failed',
            failed_at: new Date().toISOString(),
            error_details: message,
          } as unknown as Json,
        })
        .eq('id', connectionId)
        .eq('org_id', orgId)
    }

    const redirectWithErr = new URL(redirectTarget, request.nextUrl.origin)
    redirectWithErr.searchParams.set('error', message)
    redirectWithErr.searchParams.set('connectionId', connectionId || '')
    return NextResponse.redirect(redirectWithErr)
  }
}
