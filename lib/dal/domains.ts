// lib/dal/domains.ts — workspace domains for websites and e-mail (20260103; rules in lib/integrations/dns-verify.ts).
// Adding a domain creates its ownership token (and, for e-mail, registers it with the e-mail provider); checking it
// looks the records up in DNS from the server. Every query is scoped by organisation.
import { randomBytes } from 'node:crypto'
import { promises as dns } from 'node:dns'
import { createServiceClient } from '@/lib/supabase/server'
import { checkDomain, recordsFor, type DnsProviderRecord, type DnsRecord, type DomainPurpose } from '@/lib/integrations/dns-verify'
import { refreshDomain, registerDomain } from '@/lib/email/domains'

// domain_verifications is not in the generated types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createServiceClient() as unknown as { from: (t: string) => any }

export const MAX_DOMAINS_PER_PURPOSE = 5
export const newToken = () => randomBytes(16).toString('hex')

export interface DomainView {
  id: string; purpose: DomainPurpose; domain: string; status: 'pending' | 'verified'; sendAs: string | null
  providerStatus: string | null; dmarc: boolean; lastCheckedAt: string | null; verifiedAt: string | null
  records: DnsRecord[]
  /** E-mail can go out from this domain: ownership and the provider's sending records are both verified. */
  sending: boolean
}

interface Row { id: string; purpose: DomainPurpose; domain: string; token: string; status: 'pending' | 'verified'; send_as: string | null; provider_domain_id: string | null; provider_records: DnsProviderRecord[]; provider_status: string | null; dmarc: boolean; last_checked_at: string | null; verified_at: string | null }
const COLS = 'id, purpose, domain, token, status, send_as, provider_domain_id, provider_records, provider_status, dmarc, last_checked_at, verified_at'

const view = (r: Row): DomainView => ({
  id: r.id, purpose: r.purpose, domain: r.domain, status: r.status, sendAs: r.send_as, providerStatus: r.provider_status, dmarc: r.dmarc,
  lastCheckedAt: r.last_checked_at, verifiedAt: r.verified_at, records: recordsFor(r.purpose, r.domain, r.token, r.provider_records ?? []),
  sending: r.purpose === 'email' && r.status === 'verified' && r.provider_status === 'verified' && !!r.send_as,
})

export async function listDomains(orgId: string): Promise<DomainView[]> {
  const { data } = await db().from('domain_verifications').select(COLS).eq('org_id', orgId).order('created_at')
  return ((data ?? []) as Row[]).map(view)
}

export async function addDomain(orgId: string, purpose: DomainPurpose, domain: string, sendAs: string | null, by: string):
  Promise<{ ok: true; domain: DomainView } | { ok: false; status: number; error: string }> {
  const { count } = await db().from('domain_verifications').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('purpose', purpose)
  if ((count ?? 0) >= MAX_DOMAINS_PER_PURPOSE) return { ok: false, status: 409, error: `Up to ${MAX_DOMAINS_PER_PURPOSE} domains each for websites and e-mail.` }
  const provider = purpose === 'email' ? await registerDomain(domain) : null
  const { data, error } = await db().from('domain_verifications').insert({
    org_id: orgId, purpose, domain, token: newToken(), send_as: purpose === 'email' ? sendAs : null, created_by: by,
    ...(provider ? { provider_domain_id: provider.id, provider_records: provider.records, provider_status: provider.status } : {}),
  }).select(COLS).single()
  if (error) return { ok: false, status: String(error.message).includes('duplicate') ? 409 : 400, error: String(error.message).includes('duplicate') ? 'That domain is already added.' : 'The domain could not be added.' }
  return { ok: true, domain: view(data as Row) }
}

/** Looks the records up now (DNS from the server; the e-mail provider for its records) and saves the result. */
export async function checkDomainNow(orgId: string, id: string): Promise<{ ok: true; domain: DomainView; problems: string[] } | { ok: false; status: number; error: string }> {
  const { data } = await db().from('domain_verifications').select(COLS).eq('org_id', orgId).eq('id', id).maybeSingle()
  if (!data) return { ok: false, status: 404, error: 'Domain not found.' }
  const r = data as Row
  const result = await checkDomain(r.purpose, r.domain, r.token, (h) => dns.resolveTxt(h))
  const provider = r.purpose === 'email' && r.provider_domain_id ? await refreshDomain(r.provider_domain_id, r.domain) : null
  const now = new Date().toISOString()
  const patch = {
    last_checked_at: now, dmarc: result.dmarc,
    ...(result.verified ? { status: 'verified', verified_at: r.verified_at ?? now } : {}),
    ...(provider ? { provider_status: provider.status, provider_records: provider.records.length ? provider.records : r.provider_records } : {}),
  }
  const { data: saved } = await db().from('domain_verifications').update(patch).eq('org_id', orgId).eq('id', id).select(COLS).single()
  const problems = [...result.problems]
  if (r.purpose === 'email' && provider && provider.status !== 'verified') problems.push('The sending records aren’t confirmed by the mail service yet — add them exactly as shown, then check again.')
  return { ok: true, domain: view(saved as Row), problems }
}

export async function removeDomain(orgId: string, id: string): Promise<boolean> {
  const { data } = await db().from('domain_verifications').delete().eq('org_id', orgId).eq('id', id).select('id')
  return (data ?? []).length > 0
}

/** "Seaview Developers <sales@seaview.in>" when this workspace can send from its own domain, else null. */
export async function orgSender(client: { from: (t: string) => unknown }, orgId: string): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = client as any
  const [{ data: d }, { data: org }] = await Promise.all([
    c.from('domain_verifications').select('domain, send_as').eq('org_id', orgId).eq('purpose', 'email').eq('status', 'verified').eq('provider_status', 'verified').not('send_as', 'is', null).order('verified_at').limit(1).maybeSingle(),
    c.from('organisations').select('name').eq('id', orgId).maybeSingle(),
  ])
  if (!d?.domain || !d?.send_as) return null
  const name = String(org?.name ?? '').replace(/["<>\r\n]/g, '').trim().slice(0, 80)
  return name ? `${name} <${d.send_as}@${d.domain}>` : `${d.send_as}@${d.domain}`
}
