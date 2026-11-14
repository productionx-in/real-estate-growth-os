// lib/integrations/meta/oauth.ts
// Secure Meta OAuth 2.0 handshake, HMAC state signing/validation, and token lifecycle.

import crypto from 'node:crypto'
import { getMetaAppConfig, META_OAUTH_SCOPES } from './config'

export interface OAuthStatePayload {
  orgId: string
  connectionId?: string
  userId: string
  returnUrl?: string
  nonce: string
  timestamp: number
}

const STATE_TTL_MS = 15 * 60 * 1000 // 15 minutes

function getStateSigningSecret(): string {
  return (
    process.env.META_APP_SECRET ||
    process.env.ENCRYPTION_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    'real-estate-growth-os-oauth-state-secret-2026'
  )
}

/**
 * Creates a cryptographically signed, URL-safe base64 state parameter for OAuth initiation.
 * Prevents Cross-Site Request Forgery (CSRF).
 */
export function createOAuthState(payload: Omit<OAuthStatePayload, 'nonce' | 'timestamp'>): string {
  const fullPayload: OAuthStatePayload = {
    ...payload,
    nonce: crypto.randomBytes(16).toString('hex'),
    timestamp: Date.now(),
  }

  const jsonStr = JSON.stringify(fullPayload)
  const encodedPayload = Buffer.from(jsonStr).toString('base64url')

  const signature = crypto
    .createHmac('sha256', getStateSigningSecret())
    .update(encodedPayload)
    .digest('base64url')

  return `${encodedPayload}.${signature}`
}

/**
 * Validates a received OAuth state parameter.
 * Confirms cryptographic HMAC signature and ensures state has not expired.
 */
export function verifyOAuthState(state: string | null | undefined): {
  valid: boolean
  payload?: OAuthStatePayload
  error?: string
} {
  if (!state || typeof state !== 'string') {
    return { valid: false, error: 'Missing or empty state parameter' }
  }

  const parts = state.split('.')
  if (parts.length !== 2) {
    return { valid: false, error: 'Malformed state parameter structure' }
  }

  const [encodedPayload, signature] = parts

  const expectedSignature = crypto
    .createHmac('sha256', getStateSigningSecret())
    .update(encodedPayload)
    .digest('base64url')

  const sigBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expectedSignature)

  if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    return { valid: false, error: 'Invalid state signature: potential CSRF detected' }
  }

  try {
    const jsonStr = Buffer.from(encodedPayload, 'base64url').toString('utf8')
    const payload = JSON.parse(jsonStr) as OAuthStatePayload

    if (Date.now() - payload.timestamp > STATE_TTL_MS) {
      return { valid: false, error: 'OAuth state has expired. Please initiate the connection again.' }
    }

    return { valid: true, payload }
  } catch {
    return { valid: false, error: 'Failed to decode state payload' }
  }
}

/**
 * Constructs the official Meta OAuth authorization URL.
 */
export function getMetaAuthorizationUrl(state: string, redirectUri: string): string {
  const config = getMetaAppConfig()
  if (!config.appId) {
    throw new Error('Meta App ID is not configured in environment variables')
  }

  const params = new URLSearchParams({
    client_id: config.appId,
    redirect_uri: redirectUri,
    state,
    response_type: 'code',
    scope: META_OAUTH_SCOPES.join(','),
  })

  return `https://www.facebook.com/${config.apiVersion}/dialog/oauth?${params.toString()}`
}

/**
 * Exchanges the temporary authorization code for a short-lived user access token.
 */
export async function exchangeCodeForToken(
  code: string,
  redirectUri: string
): Promise<{ accessToken: string; expiresIn: number }> {
  const config = getMetaAppConfig()
  if (!config.appId || !config.appSecret) {
    throw new Error('Meta App ID or App Secret is not configured')
  }

  const tokenUrl = new URL(`https://graph.facebook.com/${config.apiVersion}/oauth/access_token`)
  tokenUrl.searchParams.set('client_id', config.appId)
  tokenUrl.searchParams.set('client_secret', config.appSecret)
  tokenUrl.searchParams.set('redirect_uri', redirectUri)
  tokenUrl.searchParams.set('code', code)

  const res = await fetch(tokenUrl.toString(), { method: 'GET' })
  const json = await res.json()

  if (!res.ok || json.error) {
    throw new Error(json.error?.message || `Meta token exchange failed with status ${res.status}`)
  }

  return {
    accessToken: json.access_token,
    expiresIn: json.expires_in ?? 3600,
  }
}

/**
 * Exchanges a short-lived user access token for a 60-day Long-Lived User Access Token.
 * Required for reliable backend lead retrieval and persistent webhook processing.
 */
export async function exchangeForLongLivedToken(
  shortLivedToken: string
): Promise<{ accessToken: string; expiresIn: number }> {
  const config = getMetaAppConfig()
  if (!config.appId || !config.appSecret) {
    throw new Error('Meta App ID or App Secret is not configured')
  }

  const tokenUrl = new URL(`https://graph.facebook.com/${config.apiVersion}/oauth/access_token`)
  tokenUrl.searchParams.set('grant_type', 'fb_exchange_token')
  tokenUrl.searchParams.set('client_id', config.appId)
  tokenUrl.searchParams.set('client_secret', config.appSecret)
  tokenUrl.searchParams.set('fb_exchange_token', shortLivedToken)

  const res = await fetch(tokenUrl.toString(), { method: 'GET' })
  const json = await res.json()

  if (!res.ok || json.error) {
    throw new Error(json.error?.message || 'Meta long-lived token exchange failed')
  }

  return {
    accessToken: json.access_token,
    // Typically ~5184000 seconds (60 days)
    expiresIn: json.expires_in ?? 60 * 24 * 60 * 60,
  }
}

/**
 * Queries Meta's /debug_token endpoint to verify token validity, user ID, and granted permissions.
 */
export async function debugToken(accessToken: string): Promise<{
  userId: string
  appId: string
  isValid: boolean
  scopes: string[]
  expiresAt: number
}> {
  const config = getMetaAppConfig()
  if (!config.appId || !config.appSecret) {
    throw new Error('Meta App ID or App Secret is not configured')
  }

  const appToken = `${config.appId}|${config.appSecret}`
  const debugUrl = new URL(`https://graph.facebook.com/${config.apiVersion}/debug_token`)
  debugUrl.searchParams.set('input_token', accessToken)
  debugUrl.searchParams.set('access_token', appToken)

  const res = await fetch(debugUrl.toString(), { method: 'GET' })
  const json = await res.json()

  if (!res.ok || json.error || !json.data) {
    throw new Error(json.error?.message || 'Meta debug_token validation failed')
  }

  return {
    userId: json.data.user_id,
    appId: json.data.app_id,
    isValid: Boolean(json.data.is_valid),
    scopes: Array.isArray(json.data.scopes) ? json.data.scopes : [],
    expiresAt: json.data.expires_at ? json.data.expires_at * 1000 : Date.now() + 60 * 24 * 60 * 60 * 1000,
  }
}
