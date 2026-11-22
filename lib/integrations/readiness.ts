// lib/integrations/readiness.ts — is the platform configured for each integration?
// REGrow runs ONE central Meta app (Lead Ads + WhatsApp Cloud API) and ONE Google Cloud app for every workspace;
// customers only authorise their own assets. This reports, per integration, which platform settings are present.
// It returns setting NAMES and yes/no only — never a value — so it is safe to show to Platform staff.
// Pure: pass the environment in (tests pass a fake one).

type Env = Record<string, string | undefined>

export interface Requirement {
  /** Environment variable name. */
  name: string
  /** What it is for, in plain words. */
  purpose: string
  /** Optional settings do not block the integration. */
  optional?: boolean
}

export interface IntegrationReadiness {
  key: 'platform' | 'meta_lead_ads' | 'whatsapp_cloud' | 'google_ads' | 'website' | 'portals'
  label: string
  ready: boolean
  /** Required settings that are missing (names only). */
  missing: string[]
  requirements: (Requirement & { present: boolean })[]
  /** Founder actions outside the code that the integration also needs. */
  outsideSteps: string[]
}

const set = (env: Env, name: string) => {
  const v = env[name]
  return typeof v === 'string' && v.trim() !== '' && !v.startsWith('YOUR_')
}

function build(env: Env, key: IntegrationReadiness['key'], label: string, reqs: Requirement[], outsideSteps: string[]): IntegrationReadiness {
  const requirements = reqs.map((r) => ({ ...r, present: set(env, r.name) }))
  const missing = requirements.filter((r) => !r.optional && !r.present).map((r) => r.name)
  return { key, label, ready: missing.length === 0, missing, requirements, outsideSteps }
}

export function integrationReadiness(env: Env = process.env): IntegrationReadiness[] {
  return [
    build(env, 'platform', 'Platform (all integrations)', [
      { name: 'ENCRYPTION_KEY', purpose: 'Encrypts every stored access token. Set it once, before the first connection, and never change it — tokens encrypted with another key cannot be read.' },
      { name: 'NEXT_PUBLIC_APP_URL', purpose: 'The app address used for OAuth redirect and webhook URLs (Vercel’s production domain is used when unset).', optional: true },
    ], []),
    build(env, 'meta_lead_ads', 'Meta Lead Ads (Facebook & Instagram)', [
      { name: 'META_APP_ID', purpose: 'The central REGrow Meta app.' },
      { name: 'META_APP_SECRET', purpose: 'Verifies webhook signatures and exchanges login codes.' },
      { name: 'META_WEBHOOK_VERIFY_TOKEN', purpose: 'Answers Meta’s webhook verification; any long random string, entered in both places.' },
      { name: 'META_API_VERSION', purpose: 'Graph API version (defaults to v21.0).', optional: true },
    ], [
      'Add the Facebook Login for Business and Webhooks products to the app.',
      'Webhooks → Page → subscribe to “leadgen” with the callback URL below.',
      'App Review: pages_show_list, pages_read_engagement, pages_manage_metadata, pages_manage_ads, leads_retrieval, ads_read, ads_management.',
      'Business verification of the business portfolio that owns the app.',
    ]),
    build(env, 'whatsapp_cloud', 'WhatsApp Cloud API (Embedded Signup)', [
      { name: 'META_APP_ID', purpose: 'The same central Meta app.' },
      { name: 'META_APP_SECRET', purpose: 'Verifies webhook signatures and exchanges the signup code for the customer’s token.' },
      { name: 'META_WEBHOOK_VERIFY_TOKEN', purpose: 'Answers Meta’s webhook verification.' },
      { name: 'META_WA_CONFIG_ID', purpose: 'The Embedded Signup configuration (Facebook Login for Business → Configurations).' },
    ], [
      'Add the WhatsApp product to the app and become a Tech Provider.',
      'Facebook Login for Business → create a configuration for WhatsApp Embedded Signup; copy its ID.',
      'Allowed domains: add the app domain for the JavaScript SDK.',
      'Webhooks → WhatsApp Business Account → subscribe to “messages” with the callback URL below.',
      'App Review: whatsapp_business_management, whatsapp_business_messaging, business_management.',
    ]),
    build(env, 'google_ads', 'Google Ads lead forms', [
      { name: 'GOOGLE_CLIENT_ID', purpose: 'The central Google Cloud OAuth client.' },
      { name: 'GOOGLE_CLIENT_SECRET', purpose: 'Exchanges login codes.' },
      { name: 'GOOGLE_DEVELOPER_TOKEN', purpose: 'Google Ads API access.' },
      { name: 'GOOGLE_WEBHOOK_KEY', purpose: 'Fallback key for lead-form webhooks (each connection has its own).', optional: true },
    ], [
      'Google Cloud: OAuth consent screen (verified) and a web OAuth client with the redirect URI below.',
      'Google Ads API Center: apply for a Basic access developer token.',
    ]),
    build(env, 'website', 'Website forms and inbound webhooks', [], [
      'Nothing to configure: each workspace creates its own form key in the Integration Centre.',
    ]),
    build(env, 'portals', 'Property portals (99acres, MagicBricks, Housing)', [], [
      'Each portal sends leads to the workspace’s own webhook URL; the portal account manager enables lead push.',
    ]),
  ]
}

/** The URLs to register with Meta and Google, from the configured app address. */
export function integrationUrls(baseUrl: string | null) {
  const b = baseUrl ?? 'https://<your app address>'
  return {
    metaOAuthRedirect: `${b}/api/integrations/meta/callback`,
    metaLeadWebhook: `${b}/api/webhooks/meta`,
    whatsappWebhook: `${b}/api/webhooks/whatsapp`,
    googleOAuthRedirect: `${b}/api/integrations/google/callback`,
  }
}

/** Whether a workspace can start WhatsApp Embedded Signup right now (no secret is exposed: the app id is public). */
export function embeddedSignupConfig(env: Env = process.env): { available: boolean; appId: string | null; configId: string | null; apiVersion: string } {
  const wa = integrationReadiness(env).find((r) => r.key === 'whatsapp_cloud')!
  const platform = integrationReadiness(env).find((r) => r.key === 'platform')!
  return {
    available: wa.ready && platform.requirements.find((r) => r.name === 'ENCRYPTION_KEY')!.present,
    appId: set(env, 'META_APP_ID') ? env.META_APP_ID!.trim() : null,
    configId: set(env, 'META_WA_CONFIG_ID') ? env.META_WA_CONFIG_ID!.trim() : null,
    apiVersion: env.META_API_VERSION?.trim() || 'v21.0',
  }
}
