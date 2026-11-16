// lib/audit/leakage.ts
// Lead-leakage audit: turns any CRM's lead export (Sell.Do, LeadSquared, a spreadsheet) into the numbers a
// developer cares about — how fast leads were first contacted, how many never were, which sources leak, and the
// ad spend that went to leads nobody reached in time. Pure functions: runs in the browser, nothing is uploaded.

export type FieldKey = 'createdAt' | 'firstContactAt' | 'source' | 'status' | 'owner'

export const FIELD_LABELS: Record<FieldKey, string> = {
  createdAt: 'Lead created (date/time)',
  firstContactAt: 'First call / first activity (date/time)',
  source: 'Source',
  status: 'Status / stage',
  owner: 'Salesperson',
}

const GUESSES: Record<FieldKey, RegExp[]> = {
  createdAt: [/^(lead\s*)?created(\s*(at|on|date|time))?$/i, /^(enquiry|inquiry|lead)\s*(date|time)/i, /date\s*created/i, /^created/i, /received/i],
  firstContactAt: [/first\s*(call|contact|activity|response|touch)/i, /first.*(at|date|time)/i, /contacted\s*(at|on)/i, /last\s*(call|activity)/i],
  source: [/^(lead\s*)?source$/i, /source/i, /channel/i, /medium/i, /campaign/i],
  status: [/^(lead\s*)?(status|stage)$/i, /status|stage/i],
  owner: [/sales\s*(person|exec|rep)|owner|assigned|agent|executive/i],
}

/** Best-effort column mapping from header names; the user can correct it. */
export function guessMapping(headers: string[]): Partial<Record<FieldKey, string>> {
  const used = new Set<string>()
  const out: Partial<Record<FieldKey, string>> = {}
  for (const key of Object.keys(GUESSES) as FieldKey[]) {
    for (const re of GUESSES[key]) {
      const h = headers.find((x) => !used.has(x) && re.test(x.trim()))
      if (h) { out[key] = h; used.add(h); break }
    }
  }
  return out
}

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 }

/**
 * Parse the date formats Indian CRMs export: ISO, "16/11/2026 14:05", "16-11-2026 2:05 PM", "16 Nov 2026 14:05",
 * Excel serial numbers. Day-first for slash/dash dates (India). Returns epoch ms or null.
 */
export function parseDate(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    if (raw > 20000 && raw < 80000) return Math.round((raw - 25569) * 86_400_000) // Excel serial (local time treated as UTC)
    return null
  }
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw.getTime()
  const s = String(raw).trim()
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}([ T]\d{1,2}:\d{2}(:\d{2})?(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/.test(s)) {
    const t = Date.parse(s.includes('T') || s.length === 10 ? s : s.replace(' ', 'T'))
    return Number.isNaN(t) ? null : t
  }
  const time = (rest: string) => {
    const m = rest.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]\.?m\.?)?/i)
    if (!m) return 0
    let h = Number(m[1])
    const ap = m[4]?.toLowerCase().replace(/\./g, '')
    if (ap === 'pm' && h < 12) h += 12
    if (ap === 'am' && h === 12) h = 0
    return ((h * 60 + Number(m[2])) * 60 + Number(m[3] ?? 0)) * 1000
  }
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(.*)$/)
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
    const t = Date.UTC(y, Number(m[2]) - 1, Number(m[1])) + time(m[4])
    return Number(m[2]) >= 1 && Number(m[2]) <= 12 && Number(m[1]) <= 31 ? t : null
  }
  m = s.match(/^(\d{1,2})[\s-]([A-Za-z]{3,9})[\s-,]*(\d{4})(.*)$/)
  if (m) {
    const month = MONTHS[m[2].slice(0, 4).toLowerCase()] ?? MONTHS[m[2].slice(0, 3).toLowerCase()]
    if (month !== undefined) return Date.UTC(Number(m[3]), month, Number(m[1])) + time(m[4])
  }
  const t = Date.parse(s)
  return Number.isNaN(t) ? null : t
}

const NEVER_CONTACTED_STATUS = /^(new|fresh|open|untouched|not\s*contacted|pending|unattended|yet to (call|contact))$/i
const JUNK_STATUS = /junk|spam|invalid|wrong|fake|duplicate|test/i

export interface AuditRow {
  createdAt: number | null
  firstContactAt: number | null
  source: string
  status: string
  owner: string
}

export function toAuditRows(records: Record<string, unknown>[], mapping: Partial<Record<FieldKey, string>>): AuditRow[] {
  const get = (r: Record<string, unknown>, k: FieldKey) => (mapping[k] ? r[mapping[k]!] : undefined)
  return records.map((r) => ({
    createdAt: parseDate(get(r, 'createdAt')),
    firstContactAt: parseDate(get(r, 'firstContactAt')),
    source: String(get(r, 'source') ?? '').trim() || 'Unknown',
    status: String(get(r, 'status') ?? '').trim(),
    owner: String(get(r, 'owner') ?? '').trim() || 'Unassigned',
  }))
}

export interface GroupStats {
  name: string
  leads: number
  contacted: number
  neverContacted: number
  within5: number
  medianMin: number | null
  junk: number
}

export interface AuditResult {
  totalRows: number
  analysedLeads: number
  skippedNoDate: number
  periodStart: number | null
  periodEnd: number | null
  contacted: number
  neverContacted: number
  medianMin: number | null
  p90Min: number | null
  within5: number
  within60: number
  over24h: number
  junk: number
  bySource: GroupStats[]
  byOwner: GroupStats[]
  /** Leads never reached + leads reached after 60 minutes: the "leaked" set the money estimate uses. */
  leaked: number
}

function quantile(sorted: number[], q: number): number | null {
  if (!sorted.length) return null
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos), hi = Math.ceil(pos)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

function minutesOf(r: AuditRow): number | null {
  if (r.createdAt === null || r.firstContactAt === null) return null
  const m = (r.firstContactAt - r.createdAt) / 60_000
  return m >= 0 ? m : null // activity before creation = bad data, not a response
}

function isNeverContacted(r: AuditRow): boolean {
  if (JUNK_STATUS.test(r.status)) return false
  if (r.firstContactAt !== null) return false
  // Without a first-contact column, fall back to "still in a new/untouched stage".
  return r.status === '' ? true : NEVER_CONTACTED_STATUS.test(r.status)
}

function group(rows: AuditRow[], by: (r: AuditRow) => string): GroupStats[] {
  const map = new Map<string, AuditRow[]>()
  for (const r of rows) map.set(by(r), [...(map.get(by(r)) ?? []), r])
  return [...map.entries()].map(([name, rs]) => {
    const mins = rs.map(minutesOf).filter((x): x is number => x !== null).sort((a, b) => a - b)
    return {
      name,
      leads: rs.length,
      contacted: mins.length,
      neverContacted: rs.filter(isNeverContacted).length,
      within5: mins.filter((m) => m <= 5).length,
      medianMin: quantile(mins, 0.5),
      junk: rs.filter((r) => JUNK_STATUS.test(r.status)).length,
    }
  }).sort((a, b) => b.leads - a.leads)
}

export function analyse(rows: AuditRow[], options: { hasFirstContact: boolean }): AuditResult {
  const dated = rows.filter((r) => r.createdAt !== null)
  const mins = dated.map(minutesOf).filter((x): x is number => x !== null).sort((a, b) => a - b)
  const never = dated.filter((r) => (options.hasFirstContact ? isNeverContacted(r) : NEVER_CONTACTED_STATUS.test(r.status)))
  const times = dated.map((r) => r.createdAt!).sort((a, b) => a - b)
  return {
    totalRows: rows.length,
    analysedLeads: dated.length,
    skippedNoDate: rows.length - dated.length,
    periodStart: times[0] ?? null,
    periodEnd: times.at(-1) ?? null,
    contacted: mins.length,
    neverContacted: never.length,
    medianMin: quantile(mins, 0.5),
    p90Min: quantile(mins, 0.9),
    within5: mins.filter((m) => m <= 5).length,
    within60: mins.filter((m) => m <= 60).length,
    over24h: mins.filter((m) => m > 24 * 60).length,
    junk: dated.filter((r) => JUNK_STATUS.test(r.status)).length,
    bySource: group(dated, (r) => r.source),
    byOwner: group(dated, (r) => r.owner),
    leaked: never.length + mins.filter((m) => m > 60).length,
  }
}

/** Illustrative: spend attributed to leads never reached or reached after an hour, at the average cost per lead. */
export function wastedSpend(result: AuditResult, monthlySpendInr: number): { costPerLead: number; wasted: number } | null {
  if (!monthlySpendInr || !result.analysedLeads || result.periodStart === null || result.periodEnd === null) return null
  const months = Math.max(1, (result.periodEnd - result.periodStart) / (30 * 86_400_000))
  const costPerLead = (monthlySpendInr * months) / result.analysedLeads
  return { costPerLead, wasted: (result.leaked / months) * costPerLead }
}
