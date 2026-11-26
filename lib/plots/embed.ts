// lib/plots/embed.ts — which websites may show a public plot map in a frame (pure). A workspace lists up to 10 of its
// own sites; each is stored as an https origin. The public map page (/m/<token>) is then sent with
// `Content-Security-Policy: frame-ancestors 'self' <origins>` (proxy.ts), so no other site can frame it.

export const MAX_EMBED_DOMAINS = 10
const HOST = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/

/** "www.example.com", "https://example.com/plots" → "https://www.example.com" / "https://example.com"; else null.
 *  https only, no IP addresses, no wildcards, no ports. */
export function normaliseEmbedDomain(input: string): string | null {
  let s = input.trim().toLowerCase()
  if (!s) return null
  if (!/^[a-z][a-z0-9+.-]*:\/\//.test(s)) s = `https://${s}`
  let url: URL
  try { url = new URL(s) } catch { return null }
  if (url.protocol !== 'https:' || url.port || url.username || url.password) return null
  const host = url.hostname.replace(/\.$/, '')
  return HOST.test(host) ? `https://${host}` : null
}

/** Normalised, de-duplicated list, or the first entry that is not a usable domain. */
export function parseEmbedDomains(inputs: string[]): { ok: true; origins: string[] } | { ok: false; error: string } {
  const out: string[] = []
  for (const raw of inputs) {
    if (!raw.trim()) continue
    const o = normaliseEmbedDomain(raw)
    if (!o) return { ok: false, error: `“${raw.trim().slice(0, 60)}” is not a website address (use e.g. www.yoursite.com).` }
    if (!out.includes(o)) out.push(o)
  }
  if (out.length > MAX_EMBED_DOMAINS) return { ok: false, error: `Up to ${MAX_EMBED_DOMAINS} websites.` }
  return { ok: true, origins: out }
}

/** The frame-ancestors directive for a public map: RE itself plus the listed sites that are still valid. */
export function frameAncestors(origins: readonly string[] | null | undefined): string {
  const ok = (origins ?? []).filter((o) => normaliseEmbedDomain(o) === o).slice(0, MAX_EMBED_DOMAINS)
  return ["frame-ancestors 'self'", ...ok].join(' ')
}
