// lib/leads/tags.ts — lead tags: short lowercase labels ("nri", "hot", "investor"). The database enforces the
// same shape (regrow_valid_tags): up to 10 per lead, 1–30 characters, letters, digits, spaces and hyphens.
export const MAX_TAGS = 10
export const TAG_RE = /^[a-z0-9][a-z0-9 -]{0,29}$/

/** "  Hot Buyer!! " → "hot buyer"; null when nothing usable is left. */
export function normalizeTag(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const t = raw.toLowerCase().normalize('NFKD').replace(/[^a-z0-9 -]/g, '').replace(/\s+/g, ' ').trim().slice(0, 30).trim()
  return TAG_RE.test(t) ? t : null
}

/** Cleaned, de-duplicated, in the order given, at most 10. */
export function normalizeTags(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : []
  const out: string[] = []
  for (const r of list) {
    const t = normalizeTag(r)
    if (t && !out.includes(t)) out.push(t)
    if (out.length === MAX_TAGS) break
  }
  return out
}

/** The workspace's tags, most used first (for suggestions and the filter). */
export function rankTags(rows: { tags: string[] | null }[], limit = 50): string[] {
  const n = new Map<string, number>()
  for (const r of rows) for (const t of r.tags ?? []) n.set(t, (n.get(t) ?? 0) + 1)
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([t]) => t)
}
