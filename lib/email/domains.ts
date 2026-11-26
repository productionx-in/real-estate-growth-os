// lib/email/domains.ts — registering a workspace's e-mail domain with RE’s e-mail provider (Resend), so buyer-facing
// e-mail can be sent from it (20260103). The provider returns the exact sending records (DKIM, SPF, MX on its "send"
// subdomain) for the customer to add; we show them in plain words and ask the provider to check them. Works only when
// the provider is configured (RESEND_API_KEY); otherwise the domain is still verified for ownership, and the card says
// sending records come later. The key is never logged or returned.
import type { DnsProviderRecord } from '@/lib/integrations/dns-verify'

const API = 'https://api.resend.com'
const key = () => process.env.RESEND_API_KEY?.trim() || null
export const providerAvailable = () => !!key()

interface ResendRecord { record?: string; name?: string; type?: string; value?: string; priority?: number; status?: string }
interface ResendDomain { id?: string; name?: string; status?: string; records?: ResendRecord[] }

const WHY: Record<string, string> = {
  DKIM: 'Signs your e-mail so inboxes know it really comes from you.',
  SPF: 'Lets RE’s mail service send for this domain without landing in spam.',
  MX: 'Lets bounces come back to the mail service (on a sub-address only — your normal inbox is not affected).',
}

/** Provider records as full host names, with a plain reason each. */
export function toRecords(domain: string, d: ResendDomain): DnsProviderRecord[] {
  return (d.records ?? []).filter((r) => r.type && r.name && r.value && ['TXT', 'MX', 'CNAME'].includes(r.type)).map((r) => ({
    type: r.type as DnsProviderRecord['type'],
    name: r.name!.endsWith(domain) ? r.name! : `${r.name}.${domain}`,
    value: r.value!,
    ...(typeof r.priority === 'number' ? { priority: r.priority } : {}),
    why: WHY[String(r.record ?? '').toUpperCase()] ?? 'Needed for sending e-mail from this domain.',
  }))
}

async function call(path: string, init: RequestInit = {}): Promise<ResendDomain | null> {
  const k = key()
  if (!k) return null
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 10_000)
  try {
    const res = await fetch(`${API}${path}`, { ...init, signal: ctl.signal, headers: { Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } })
    if (!res.ok) return null
    return (await res.json().catch(() => null)) as ResendDomain | null
  } catch { return null } finally { clearTimeout(t) }
}

/** Registers the domain (or finds it again); returns its id, status and records — or null when unavailable. */
export async function registerDomain(domain: string): Promise<{ id: string; status: string; records: DnsProviderRecord[] } | null> {
  const d = await call('/domains', { method: 'POST', body: JSON.stringify({ name: domain }) })
  if (!d?.id) return null
  return { id: d.id, status: String(d.status ?? 'not_started'), records: toRecords(domain, d) }
}

/** Asks the provider to check the records now, then reads the result. */
export async function refreshDomain(id: string, domain: string): Promise<{ status: string; records: DnsProviderRecord[] } | null> {
  if (!/^[A-Za-z0-9-]{1,100}$/.test(id)) return null
  await call(`/domains/${id}/verify`, { method: 'POST' })
  const d = await call(`/domains/${id}`)
  return d ? { status: String(d.status ?? 'pending'), records: toRecords(domain, d) } : null
}
