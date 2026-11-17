// lib/integrations/website/domains.ts
// The websites a customer allows to send enquiries (the capture script and the hosted form).
// Accepts what people paste — "https://www.example.com/contact", "*.example.in" — and keeps hostnames only.

export const MAX_DOMAINS = 20

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

/** One allowed-domain entry in canonical form ("example.com" or "*.example.com"), or null if it is not one. */
export function normalizeDomain(input: string): string | null {
  let s = input.trim().toLowerCase()
  if (!s) return null
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').split(/[/?#]/)[0].replace(/:\d+$/, '').replace(/\.$/, '')
  const wildcard = s.startsWith('*.')
  const host = wildcard ? s.slice(2) : s
  const labels = host.split('.')
  if (labels.length < 2 || host.length > 253) return null // a bare word, "localhost" or "*" is not a website
  if (!labels.every((l) => LABEL.test(l))) return null
  if (/^\d+$/.test(labels[labels.length - 1])) return null // IP addresses are not accepted
  return wildcard ? `*.${host}` : host
}

/** Splits a pasted list (commas, spaces or new lines), keeps valid unique domains, reports the rest. */
export function parseDomainList(input: string | string[]): { domains: string[]; invalid: string[] } {
  const parts = (Array.isArray(input) ? input : input.split(/[\s,;]+/)).map((p) => p.trim()).filter(Boolean)
  const domains: string[] = []
  const invalid: string[] = []
  for (const p of parts) {
    const d = normalizeDomain(p)
    if (!d) invalid.push(p)
    else if (!domains.includes(d)) domains.push(d)
  }
  return { domains, invalid }
}
