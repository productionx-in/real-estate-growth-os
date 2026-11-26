// lib/integrations/dns-verify.ts — proving a workspace owns a domain, and checking its e-mail records, in plain steps
// (20260103). One TXT record proves ownership: _regrow-verify.<domain> = regrow-verify=<token>. For e-mail we also
// look for SPF and DMARC records and say, in plain words, what is missing. The DNS lookup is passed in, so tests run
// without a network. Safe in the browser too (the dashboard shows DNS_HELP); tokens are made on the server
// (lib/dal/domains.ts).
import { normalizeDomain } from '@/lib/integrations/website/domains'

export type DomainPurpose = 'website' | 'email'
export interface DnsRecord { type: 'TXT' | 'MX' | 'CNAME'; host: string; value: string; priority?: number; why: string; required: boolean }
export interface DnsProviderRecord { type: 'TXT' | 'MX' | 'CNAME'; name: string; value: string; priority?: number; why: string }
export type TxtResolver = (host: string) => Promise<string[][]>

/** A bare domain ("example.com"); no wildcards, no subpaths. */
export function cleanDomain(input: string): string | null {
  const d = normalizeDomain(input)
  return d && !d.startsWith('*.') ? d : null
}

export const VERIFY_HOST = (domain: string) => `_regrow-verify.${domain}`
export const VERIFY_VALUE = (token: string) => `regrow-verify=${token}`

/** The records to add, in the order to add them. Sending records (DKIM, SPF, MX on a "send" subdomain) come from the
 * e-mail provider when the domain is registered with it (lib/email/domains.ts) and are passed in as `provider`. */
export function recordsFor(purpose: DomainPurpose, domain: string, token: string, provider: DnsProviderRecord[] = []): DnsRecord[] {
  const own: DnsRecord = { type: 'TXT', host: VERIFY_HOST(domain), value: VERIFY_VALUE(token), why: 'Proves this domain is yours. It changes nothing else.', required: true }
  if (purpose === 'website') return [own]
  return [
    own,
    ...provider.map((r) => ({ type: r.type, host: r.name, value: r.value, priority: r.priority, why: r.why, required: true }) as DnsRecord),
    { type: 'TXT', host: `_dmarc.${domain}`, value: 'v=DMARC1; p=none;', why: 'Tells inboxes what to do with mail that fails the checks. Recommended; skip it if you already have one.', required: false },
  ]
}

export interface CheckResult { verified: boolean; dmarc: boolean; problems: string[] }

/** Looks the ownership (and, for e-mail, DMARC) records up. Never throws: a failed lookup counts as "not found yet". */
export async function checkDomain(purpose: DomainPurpose, domain: string, token: string, resolveTxt: TxtResolver): Promise<CheckResult> {
  const txt = async (host: string) => (await resolveTxt(host).catch(() => [] as string[][])).map((chunks) => chunks.join(''))
  const [own, dmarc] = await Promise.all([txt(VERIFY_HOST(domain)), purpose === 'email' ? txt(`_dmarc.${domain}`) : Promise.resolve([])])
  const verified = own.some((v) => v.trim() === VERIFY_VALUE(token))
  const hasDmarc = dmarc.some((v) => /^v=DMARC1\b/i.test(v.trim()))
  const problems: string[] = []
  if (!verified) problems.push(own.length ? 'The verification record is there but its value does not match. Copy it again exactly.' : 'We can’t see the verification record yet. DNS changes can take a few minutes, sometimes up to a few hours.')
  if (purpose === 'email' && !hasDmarc) problems.push('No DMARC record yet — recommended, not required.')
  return { verified, dmarc: hasDmarc, problems }
}

/** Where to add DNS records at popular providers, in one line each. */
export const DNS_HELP: { name: string; where: string }[] = [
  { name: 'GoDaddy', where: 'My Products → your domain → DNS → Add New Record' },
  { name: 'Hostinger', where: 'Domains → Manage → DNS / Nameservers → Add Record' },
  { name: 'Google / Squarespace Domains', where: 'DNS → Custom records → Manage custom records' },
  { name: 'Cloudflare', where: 'your site → DNS → Records → Add record' },
  { name: 'BigRock / Namecheap', where: 'Domain list → Manage → Advanced DNS → Add new record' },
]
