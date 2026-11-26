// lib/import/crm-mapping.ts
// Maps what other CRMs (Sell.Do, LeadSquared, TeleCRM, spreadsheets) export into RE’s vocabulary,
// so a team can move its history over without hand-editing the file.
import type { LeadSource, LeadStatus } from '@/types/database'
import { parseDate } from '@/lib/audit/leakage'

const SOURCE_RULES: [RegExp, LeadSource][] = [
  [/facebook|\bfb\b|instagram|\binsta\b|\bmeta\b|lead\s*ads?/i, 'meta_ads'],
  [/google|adwords|\bppc\b|\bsem\b|youtube/i, 'google_ads'],
  [/99\s*acres/i, '99acres'],
  [/magic\s*bricks/i, 'magicbricks'],
  [/housing/i, 'housing'],
  [/whats\s*app|\bwa\b/i, 'whatsapp'],
  [/walk[\s-]*in|site\s*office|direct\s*visit/i, 'walk_in'],
  [/referr|reference|friend|existing\s*customer|broker|channel\s*partner|\bcp\b/i, 'referral'],
  [/website|web\s*site|landing|organic|\bweb\b|microsite|chat\s*bot/i, 'website'],
]

export function mapSource(raw: string | null | undefined): LeadSource {
  const s = (raw ?? '').trim()
  if (!s) return 'csv_import'
  const exact = s.toLowerCase().replace(/\s+/g, '_')
  const known: LeadSource[] = ['website', 'meta_ads', 'google_ads', '99acres', 'housing', 'magicbricks', 'whatsapp', 'referral', 'walk_in', 'csv_import', 'other']
  if ((known as string[]).includes(exact)) return exact as LeadSource
  for (const [re, src] of SOURCE_RULES) if (re.test(s)) return src
  return 'other'
}

const STATUS_RULES: [RegExp, LeadStatus][] = [
  [/junk|spam|invalid|wrong\s*(no|number)|fake|test|duplicate/i, 'junk'],
  [/book(ed|ing)|sold|won|closed\s*won|converted/i, 'booked'],
  [/lost|not\s*interested|dead|dropped|closed\s*lost|unqualified|disqualified|cold/i, 'lost'],
  [/negotiat|hot|follow.*after.*visit|token/i, 'negotiation'],
  [/(site\s*)?visit(ed)?\s*(done|completed)|revisit|sv\s*done/i, 'site_visited'],
  [/(site\s*)?visit|sv\s*(planned|scheduled|fixed)/i, 'site_visit_scheduled'],
  [/qualified|interested|warm|prospect|opportunit/i, 'qualified'],
  [/contacted|follow|call\s*back|connected|attempted|not\s*reachable|no\s*answer|busy|in\s*progress|open/i, 'contacted'],
  [/^(new|fresh|untouched|unattended|not\s*contacted|pending|yet to)/i, 'new'],
]

/** Order matters: "Not interested" must be lost, not qualified; "Site visit done" must beat "Site visit". */
export function mapStatus(raw: string | null | undefined): LeadStatus {
  const s = (raw ?? '').trim()
  if (!s) return 'new'
  for (const [re, status] of STATUS_RULES) if (re.test(s)) return status
  return 'contacted'
}

/** ISO timestamp for a CRM date cell, or null. Future or pre-2000 dates are treated as bad data. */
export function mapCreatedAt(raw: unknown, now = Date.now()): string | null {
  const t = parseDate(raw)
  if (t === null || t > now + 86_400_000 || t < Date.UTC(2000, 0, 1)) return null
  return new Date(t).toISOString()
}

/** Normalise a person's name for matching ("  Asha  K. " → "asha k"). */
export const normaliseName = (s: string) => s.toLowerCase().replace(/[^a-z0-9@.\s]/g, ' ').replace(/\s+/g, ' ').trim()
