// lib/integrations/google/config.ts
// Central REGrow Google Developer App & Google Ads Configuration.
// REGrow operates a central Google Cloud OAuth client for customer tenants.
// Manages OAuth endpoints, app credentials, Google Ads scopes, and webhook parameters.
import { appUrl } from '@/lib/site/urls'

export interface GoogleAppConfig {
  isConfigured: boolean
  clientId: string | null
  clientSecret: string | null
  developerToken: string | null
  webhookKey: string | null
  missing: string[]
}

/**
 * Required permissions for Google Ads Lead Form integration:
 * - https://www.googleapis.com/auth/adwords: Manage and retrieve Google Ads campaigns, customer accounts, and lead form assets
 * - openid: User identity verification
 * - email: Associate user email with connection metadata
 * - profile: Read basic profile info of authorized manager
 */
export const GOOGLE_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/adwords',
  'openid',
  'email',
  'profile',
] as const

/**
 * Returns the central Google app configuration and checks for missing variables.
 * Safe for server-side evaluation.
 */
export function getGoogleAppConfig(): GoogleAppConfig {
  const clientId = process.env.GOOGLE_CLIENT_ID || null
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || null
  const developerToken = process.env.GOOGLE_DEVELOPER_TOKEN || null
  const webhookKey = process.env.GOOGLE_WEBHOOK_KEY || null

  const missing: string[] = []
  if (!clientId || clientId.startsWith('YOUR_')) missing.push('GOOGLE_CLIENT_ID')
  if (!clientSecret || clientSecret.startsWith('YOUR_')) missing.push('GOOGLE_CLIENT_SECRET')

  return {
    isConfigured: missing.length === 0,
    clientId,
    clientSecret,
    developerToken,
    webhookKey,
    missing,
  }
}

/**
 * Derives the Google OAuth callback redirect URI.
 */
export function getGoogleOAuthRedirectUri(requestOrigin?: string): string {
  const configured = process.env.GOOGLE_REDIRECT_URI
  if (configured && !configured.startsWith('YOUR_')) return configured

  // The configured app URL wins over the request's host, so the redirect URI always matches the one registered with
  // Google (a preview or alternate host would otherwise produce a redirect_uri_mismatch). Never a guessed localhost.
  const baseUrl = appUrl(requestOrigin) ?? 'http://localhost:3000'
  return `${baseUrl}/api/integrations/google/callback`
}
