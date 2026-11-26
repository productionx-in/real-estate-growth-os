// lib/integrations/meta/config.ts
// Central RE Meta Developer App Configuration.
// RE operates ONE verified Meta developer app across all customer tenants.
// Manages OAuth endpoints, app credentials, permissions, and webhook parameters.
import { appUrl } from '@/lib/site/urls'

export interface MetaAppConfig {
  isConfigured: boolean
  appId: string | null
  appSecret: string | null
  webhookVerifyToken: string | null
  apiVersion: string
  missing: string[]
}

const DEFAULT_API_VERSION = 'v21.0'

/**
 * Required permissions for Meta Lead Ads integration:
 * - pages_show_list: View user's managed Facebook Pages
 * - pages_read_engagement: Read page metadata and notifications
 * - pages_manage_metadata: Subscribe pages to app leadgen webhooks
 * - pages_manage_ads: Access lead generation forms and ads
 * - leads_retrieval: Fetch lead contact info submitted to leadgen forms
 * - ads_management: Access ad campaigns and ads for project routing
 * - ads_read: Read campaign names, ad set names, and ad attribution
 */
export const META_OAUTH_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_metadata',
  'pages_manage_ads',
  'leads_retrieval',
  'ads_management',
  'ads_read',
] as const

/**
 * Returns the central Meta app configuration and checks for missing variables.
 * Safe for server-side evaluation.
 */
export function getMetaAppConfig(): MetaAppConfig {
  const appId = process.env.META_APP_ID || null
  const appSecret = process.env.META_APP_SECRET || null
  const webhookVerifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN || null
  const apiVersion = process.env.META_API_VERSION || DEFAULT_API_VERSION

  const missing: string[] = []
  if (!appId || appId.startsWith('YOUR_')) missing.push('META_APP_ID')
  if (!appSecret || appSecret.startsWith('YOUR_')) missing.push('META_APP_SECRET')
  if (!webhookVerifyToken || webhookVerifyToken.startsWith('YOUR_')) missing.push('META_WEBHOOK_VERIFY_TOKEN')

  return {
    isConfigured: missing.length === 0,
    appId,
    appSecret,
    webhookVerifyToken,
    apiVersion,
    missing,
  }
}

/**
 * Resolves the OAuth callback redirect URI based on application host.
 */
export function getMetaOAuthRedirectUri(requestOrigin?: string): string {
  // Configured app URL first (lib/site/urls.ts), so the redirect URI matches the one registered with Meta whatever host
  // served the request; the request's own origin only when nothing is configured (local development).
  const baseUrl = appUrl(requestOrigin) ?? 'http://localhost:3000'
  return `${baseUrl}/api/integrations/meta/callback`
}
