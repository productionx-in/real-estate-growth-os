// lib/integrations/google/oauth.ts
// Secure Google OAuth 2.0 handshake, HMAC state signing/validation, and token lifecycle.

import crypto from 'node:crypto'
import { devOnlyFallback } from '@/lib/security/dev-fallback'
import { getGoogleAppConfig, GOOGLE_OAUTH_SCOPES } from './config'

export interface GoogleOAuthStatePayload {
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
    process.env.GOOGLE_CLIENT_SECRET ||
    process.env.ENCRYPTION_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    devOnlyFallback('OAuth state signing secret (GOOGLE_CLIENT_SECRET or ENCRYPTION_KEY)', 'real-estate-growth-os-oauth-state-secret-2026')
  )
}

/**
 * Creates a cryptographically signed, URL-safe base64 state parameter for Google OAuth initiation.
 * Prevents Cross-Site Request Forgery (CSRF).
 */
export function createGoogleOAuthState(
  payload: Omit<GoogleOAuthStatePayload, 'nonce' | 'timestamp'>
): string {
  const fullPayload: GoogleOAuthStatePayload = {
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
 * Validates a received Google OAuth state parameter.
 * Confirms cryptographic HMAC signature and ensures state has not expired.
 */
export function verifyGoogleOAuthState(state: string | null | undefined): {
  valid: boolean
  payload?: GoogleOAuthStatePayload
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
    const payload = JSON.parse(jsonStr) as GoogleOAuthStatePayload

    if (Date.now() - payload.timestamp > STATE_TTL_MS) {
      return { valid: false, error: 'OAuth state has expired. Please initiate the connection again.' }
    }

    return { valid: true, payload }
  } catch {
    return { valid: false, error: 'Failed to decode state payload' }
  }
}

/**
 * Constructs the official Google OAuth 2.0 authorization URL.
 * Requests offline access and consent prompt to ensure a refresh token is returned.
 */
export function getGoogleAuthorizationUrl(state: string, redirectUri: string): string {
  const config = getGoogleAppConfig()
  if (!config.clientId) {
    throw new Error('Google OAuth client ID is not configured')
  }

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', GOOGLE_OAUTH_SCOPES.join(' '))
  url.searchParams.set('state', state)
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('prompt', 'consent')
  url.searchParams.set('include_granted_scopes', 'true')

  return url.toString()
}

export interface GoogleTokenResponse {
  accessToken: string
  refreshToken?: string
  expiresIn: number
  idToken?: string
  scope?: string
  tokenType: string
}

/**
 * Exchanges the Google authorization code for access and refresh tokens.
 */
export async function exchangeGoogleCodeForTokens(
  code: string,
  redirectUri: string
): Promise<GoogleTokenResponse> {
  const config = getGoogleAppConfig()
  if (!config.clientId || !config.clientSecret) {
    throw new Error('Google OAuth credentials are not configured')
  }

  const bodyParams = new URLSearchParams({
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  })

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: bodyParams.toString(),
  })

  const data = (await res.json()) as Record<string, unknown>

  if (!res.ok || data.error) {
    const errorDesc = typeof data.error_description === 'string' ? data.error_description : String(data.error || 'Token exchange failed')
    throw new Error(`Google token exchange error: ${errorDesc}`)
  }

  return {
    accessToken: String(data.access_token),
    refreshToken: data.refresh_token ? String(data.refresh_token) : undefined,
    expiresIn: Number(data.expires_in ?? 3600),
    idToken: data.id_token ? String(data.id_token) : undefined,
    scope: data.scope ? String(data.scope) : undefined,
    tokenType: String(data.token_type ?? 'Bearer'),
  }
}

/**
 * Refreshes an expired Google access token using the stored refresh token.
 */
export async function refreshGoogleAccessToken(refreshToken: string): Promise<{
  accessToken: string
  expiresIn: number
}> {
  const config = getGoogleAppConfig()
  if (!config.clientId || !config.clientSecret) {
    throw new Error('Google OAuth credentials are not configured')
  }

  const bodyParams = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  })

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: bodyParams.toString(),
  })

  const data = (await res.json()) as Record<string, unknown>

  if (!res.ok || data.error) {
    const errorDesc = typeof data.error_description === 'string' ? data.error_description : String(data.error || 'Token refresh failed')
    throw new Error(`Google token refresh error: ${errorDesc}`)
  }

  return {
    accessToken: String(data.access_token),
    expiresIn: Number(data.expires_in ?? 3600),
  }
}

/**
 * Revokes a Google token during disconnect lifecycle.
 */
export async function revokeGoogleToken(token: string): Promise<boolean> {
  try {
    const url = new URL('https://oauth2.googleapis.com/revoke')
    url.searchParams.set('token', token)

    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })

    return res.ok
  } catch (err) {
    console.warn('Google token revocation request failed (non-blocking):', err)
    return false
  }
}
