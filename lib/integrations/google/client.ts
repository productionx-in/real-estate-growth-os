// lib/integrations/google/client.ts
// Server-side Google Ads API client for discovering customer accounts,
// lead form assets/extensions, and user profile information.

import type { GoogleAdsCustomerAccountAsset, GoogleLeadFormAsset } from '@/lib/integrations/types'
import { getGoogleAppConfig } from './config'

/**
 * Fetches basic profile information for the authorized Google user.
 */
export async function fetchGoogleUserInfo(accessToken: string): Promise<{ email?: string; name?: string }> {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) return {}
    const data = (await res.json()) as { email?: string; name?: string }
    return { email: data.email, name: data.name }
  } catch (err) {
    console.warn('Failed to fetch Google user info:', err)
    return {}
  }
}

/**
 * Discovers accessible Google Ads Customer Accounts for the authenticated user.
 */
export async function fetchGoogleAdsCustomerAccounts(
  accessToken: string,
  developerTokenOverride?: string
): Promise<GoogleAdsCustomerAccountAsset[]> {
  const config = getGoogleAppConfig()
  const devToken = developerTokenOverride || config.developerToken

  if (!devToken || devToken.startsWith('YOUR_')) {
    // If developer token is deferred, return initial placeholder account structure
    return [
      {
        id: 'google_ads_pending_dev_token',
        name: 'Google Ads Account (Pending Developer Token)',
        isManager: false,
      },
    ]
  }

  const res = await fetch('https://googleads.googleapis.com/v18/customers:listAccessibleCustomers', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'developer-token': devToken,
      'Content-Type': 'application/json',
    },
  })

  const json = (await res.json()) as Record<string, unknown>

  if (!res.ok || json.error) {
    const errObj = (json.error || {}) as Record<string, unknown>
    throw new Error(String(errObj.message || 'Failed to list Google Ads customer accounts'))
  }

  const resourceNames = Array.isArray(json.resourceNames) ? (json.resourceNames as string[]) : []

  return resourceNames.map((rn) => {
    // Resource name format: "customers/1234567890"
    const customerId = rn.replace('customers/', '')
    return {
      id: customerId,
      name: `Google Ads Account ${customerId}`,
      isManager: false,
    }
  })
}

/**
 * Discovers Lead Form assets for a specific Google Ads customer account.
 */
export async function fetchGoogleLeadForms(
  customerId: string,
  accessToken: string,
  developerTokenOverride?: string
): Promise<GoogleLeadFormAsset[]> {
  const config = getGoogleAppConfig()
  const devToken = developerTokenOverride || config.developerToken

  if (!devToken || devToken.startsWith('YOUR_')) {
    // Graceful fallback for deferred developer mode
    return []
  }

  const cleanCustomerId = customerId.replace(/\D/g, '')
  const query = `
    SELECT
      asset.id,
      asset.name,
      asset.lead_form_asset.business_name,
      asset.lead_form_asset.headline,
      asset.lead_form_asset.description,
      asset.lead_form_asset.fields
    FROM asset
    WHERE asset.type = 'LEAD_FORM'
    LIMIT 50
  `

  const res = await fetch(
    `https://googleads.googleapis.com/v18/customers/${cleanCustomerId}/googleAds:searchStream`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'developer-token': devToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    }
  )

  const json = (await res.json()) as Array<{ results?: Array<Record<string, unknown>> }>

  if (!res.ok) {
    throw new Error(`Failed to query Google Ads lead forms for customer ${customerId}`)
  }

  const forms: GoogleLeadFormAsset[] = []
  if (Array.isArray(json)) {
    for (const chunk of json) {
      const results = chunk.results || []
      for (const row of results) {
        const asset = (row.asset || {}) as Record<string, unknown>
        const leadForm = (asset.lead_form_asset || {}) as Record<string, unknown>
        const fields = Array.isArray(leadForm.fields) ? leadForm.fields : []

        forms.push({
          id: String(asset.id),
          name: String(asset.name || `Lead Form ${asset.id}`),
          businessName: typeof leadForm.business_name === 'string' ? leadForm.business_name : undefined,
          headline: typeof leadForm.headline === 'string' ? leadForm.headline : undefined,
          description: typeof leadForm.description === 'string' ? leadForm.description : undefined,
          fieldsCount: fields.length,
        })
      }
    }
  }

  return forms
}
