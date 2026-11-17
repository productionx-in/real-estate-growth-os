// lib/dal/website-capture.ts
// The organisation's website connection: which domains may send enquiries (capture script and hosted form),
// whether it is switched on, and whether enquiries are arriving. Callers authorise first (managers and above,
// integrations module on); every query is scoped by organisation.
import { createServiceClient } from '@/lib/supabase/server'
import type { DalResult } from '@/lib/dal/routing'
import type { Json } from '@/types/database'

export interface WebsiteStatus {
  connectionId: string | null
  enabled: boolean
  domains: string[]
  lastEnquiryAt: string | null
  enquiries30d: number
}

export async function getWebsiteStatus(orgId: string): Promise<WebsiteStatus> {
  const db = createServiceClient()
  const { data: conn } = await db.from('integration_connections').select('id, status, metadata')
    .eq('org_id', orgId).eq('provider', 'website_webhook').order('created_at', { ascending: true }).limit(1).maybeSingle()
  if (!conn) return { connectionId: null, enabled: false, domains: [], lastEnquiryAt: null, enquiries30d: 0 }
  const meta = (conn.metadata ?? {}) as Record<string, unknown>
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const [{ data: last }, { count }] = await Promise.all([
    db.from('leads').select('created_at').eq('org_id', orgId).eq('connection_id', conn.id)
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),
    db.from('leads').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('connection_id', conn.id).gte('created_at', since),
  ])
  return {
    connectionId: conn.id,
    enabled: conn.status === 'connected',
    domains: Array.isArray(meta.allowedDomains) ? (meta.allowedDomains as unknown[]).filter((d): d is string => typeof d === 'string') : [],
    lastEnquiryAt: last?.created_at ?? null,
    enquiries30d: count ?? 0,
  }
}

/**
 * Saves the allowed domains and switches the website connection on or off, creating it the first time.
 * A website connection needs no third-party sign-in: listing the customer's own domains is what makes it
 * safe to switch on, so it can only be on while at least one domain is listed.
 */
export async function saveWebsiteSettings(
  orgId: string, actorId: string, input: { domains: string[]; enabled: boolean }
): Promise<DalResult<WebsiteStatus>> {
  if (input.enabled && input.domains.length === 0) {
    return { success: false, error: 'Add at least one website domain before switching website enquiries on.', status: 400 }
  }
  const db = createServiceClient()
  const { data: existing } = await db.from('integration_connections').select('id, metadata')
    .eq('org_id', orgId).eq('provider', 'website_webhook').order('created_at', { ascending: true }).limit(1).maybeSingle()
  const status = input.enabled ? 'connected' : 'disabled'
  const now = new Date().toISOString()

  if (existing) {
    const metadata = { ...((existing.metadata ?? {}) as Record<string, unknown>), allowedDomains: input.domains, settings_updated_at: now }
    const { error } = await db.from('integration_connections')
      .update({ status, metadata: metadata as Json, updated_at: now })
      .eq('id', existing.id).eq('org_id', orgId)
    if (error) return { success: false, error: 'Could not save the website settings.', status: 500 }
  } else {
    const { error } = await db.from('integration_connections').insert({
      org_id: orgId,
      provider: 'website_webhook',
      name: 'Website',
      status,
      connected_by: actorId,
      metadata: { allowedDomains: input.domains, settings_updated_at: now } as Json,
    })
    if (error) return { success: false, error: 'Could not save the website settings.', status: 500 }
  }
  return { success: true, data: await getWebsiteStatus(orgId) }
}
