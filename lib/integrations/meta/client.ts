// lib/integrations/meta/client.ts
// Server-side Meta Graph API client for fetching pages, ad accounts, lead forms,
// subscribing to leadgen webhooks, and retrieving lead details.

import { getMetaAppConfig } from './config'
import type { MetaPageAsset, MetaAdAccountAsset, MetaLeadFormAsset } from '@/lib/integrations/types'

export interface RawMetaLeadData {
  id: string
  created_time: string
  ad_id?: string
  ad_name?: string
  adset_id?: string
  adset_name?: string
  campaign_id?: string
  campaign_name?: string
  form_id?: string
  page_id?: string
  field_data: Array<{
    name: string
    values: string[]
  }>
}

/**
 * Fetches the user's managed Facebook Pages and Page Access Tokens.
 */
export async function fetchUserPages(
  userAccessToken: string
): Promise<Array<MetaPageAsset & { accessToken?: string }>> {
  const config = getMetaAppConfig()
  const url = new URL(`https://graph.facebook.com/${config.apiVersion}/me/accounts`)
  url.searchParams.set('fields', 'id,name,category,access_token,tasks')
  url.searchParams.set('access_token', userAccessToken)

  const res = await fetch(url.toString(), { method: 'GET' })
  const json = await res.json()

  if (!res.ok || json.error) {
    throw new Error(json.error?.message || 'Failed to fetch Facebook Pages')
  }

  const items = Array.isArray(json.data) ? json.data : []
  return items.map((item: { id: string; name: string; category?: string; access_token?: string }) => ({
    id: item.id,
    name: item.name,
    category: item.category,
    accessStatus: 'active' as const,
    accessToken: item.access_token,
  }))
}

/**
 * Fetches the user's accessible Ad Accounts.
 */
export async function fetchUserAdAccounts(userAccessToken: string): Promise<MetaAdAccountAsset[]> {
  const config = getMetaAppConfig()
  const url = new URL(`https://graph.facebook.com/${config.apiVersion}/me/adaccounts`)
  url.searchParams.set('fields', 'id,account_id,name,account_status')
  url.searchParams.set('access_token', userAccessToken)

  const res = await fetch(url.toString(), { method: 'GET' })
  const json = await res.json()

  if (!res.ok || json.error) {
    throw new Error(json.error?.message || 'Failed to fetch Meta Ad Accounts')
  }

  const items = Array.isArray(json.data) ? json.data : []
  return items.map((item: { id: string; name: string; account_status?: number | string }) => ({
    id: item.id,
    name: item.name || `Ad Account ${item.id}`,
    accountStatus: String(item.account_status ?? 'ACTIVE'),
  }))
}

/**
 * Fetches Lead Gen Forms for a specific Facebook Page.
 */
export async function fetchPageLeadForms(
  pageId: string,
  pageAccessToken: string
): Promise<MetaLeadFormAsset[]> {
  const config = getMetaAppConfig()
  const url = new URL(`https://graph.facebook.com/${config.apiVersion}/${pageId}/leadgen_forms`)
  url.searchParams.set('fields', 'id,name,status,leads_count,created_time')
  url.searchParams.set('access_token', pageAccessToken)

  const res = await fetch(url.toString(), { method: 'GET' })
  const json = await res.json()

  if (!res.ok || json.error) {
    throw new Error(json.error?.message || `Failed to fetch lead forms for Page ${pageId}`)
  }

  const items = Array.isArray(json.data) ? json.data : []
  return items.map((item: { id: string; name: string; status?: string; leads_count?: number; created_time?: string }) => ({
    id: item.id,
    name: item.name,
    status: (item.status as 'ACTIVE' | 'ARCHIVED' | 'PAUSED') || 'ACTIVE',
    leadsCount: item.leads_count ?? 0,
    createdTime: item.created_time,
  }))
}

/**
 * Subscribes a Facebook Page to the central Meta app's 'leadgen' webhook events.
 * Required so Meta sends webhooks to /api/webhooks/meta when a user submits a lead form.
 */
export async function subscribePageToLeadGenWebhook(
  pageId: string,
  pageAccessToken: string
): Promise<{ success: boolean }> {
  const config = getMetaAppConfig()
  const url = new URL(`https://graph.facebook.com/${config.apiVersion}/${pageId}/subscribed_apps`)
  url.searchParams.set('subscribed_fields', 'leadgen')
  url.searchParams.set('access_token', pageAccessToken)

  const res = await fetch(url.toString(), { method: 'POST' })
  const json = await res.json()

  if (!res.ok || json.error || !json.success) {
    console.warn(`[Meta Webhook Subscription] Failed for page ${pageId}:`, json.error?.message || json)
    return { success: false }
  }

  return { success: true }
}

/**
 * Retrieves the full lead submission details from Meta Graph API using the leadgen_id.
 */
export async function fetchMetaLead(
  leadgenId: string,
  pageAccessToken: string
): Promise<RawMetaLeadData> {
  const config = getMetaAppConfig()
  const url = new URL(`https://graph.facebook.com/${config.apiVersion}/${leadgenId}`)
  url.searchParams.set(
    'fields',
    'id,created_time,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,page_id,field_data'
  )
  url.searchParams.set('access_token', pageAccessToken)

  const res = await fetch(url.toString(), { method: 'GET' })
  const json = await res.json()

  if (!res.ok || json.error) {
    throw new Error(json.error?.message || `Failed to fetch Meta lead ${leadgenId}`)
  }

  return json as RawMetaLeadData
}
