// lib/reports/periods.ts — the periods reports offer: rolling ("Last 30 days") and calendar ("This month", "This
// quarter", "This financial year"), the calendar ones following the workspace's report settings (financial year
// start, first day of the week). Boundaries are midnight India time (IST, UTC+5:30, no daylight saving).
import type { ReportSettings } from '@/lib/settings/workspace'

export const PERIODS = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  week: 'This week',
  month: 'This month',
  quarter: 'This quarter',
  fy: 'This financial year',
} as const
export type PeriodKey = keyof typeof PERIODS

const IST_MS = 330 * 60_000
const DAY = 86_400_000

export function isPeriod(v: unknown): v is PeriodKey {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(PERIODS, v)
}

/** Midnight IST on the given IST calendar date, as a real instant. */
function istMidnight(y: number, m0: number, d: number): Date {
  return new Date(Date.UTC(y, m0, d) - IST_MS)
}

/** From/to instants for a period ending now, plus a label such as "This quarter · Oct–Dec 2026". */
export function resolvePeriod(key: PeriodKey, settings: ReportSettings, now: Date = new Date()): { from: Date; to: Date; label: string } {
  const to = now
  const days = key === '7d' ? 7 : key === '30d' ? 30 : key === '90d' ? 90 : 0
  if (days) return { from: new Date(now.getTime() - days * DAY), to, label: PERIODS[key] }

  // Today's date in India.
  const ist = new Date(now.getTime() + IST_MS)
  const y = ist.getUTCFullYear(), m = ist.getUTCMonth(), d = ist.getUTCDate()
  const month = (i: number) => new Date(Date.UTC(2000, ((i % 12) + 12) % 12, 1)).toLocaleString('en-IN', { month: 'short', timeZone: 'UTC' })

  if (key === 'week') {
    const back = (ist.getUTCDay() - settings.weekStartsOn + 7) % 7
    const start = istMidnight(y, m, d - back)
    return { from: start, to, label: `This week · from ${new Date(start.getTime() + IST_MS).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })}` }
  }
  if (key === 'month') return { from: istMidnight(y, m, 1), to, label: `This month · ${month(m)} ${y}` }

  // Months since the financial year began (0–11), and the calendar year it began in.
  const fy0 = settings.fyStartMonth - 1
  const into = (m - fy0 + 12) % 12
  const fyYear = m >= fy0 ? y : y - 1
  if (key === 'quarter') {
    const startIdx = fy0 + Math.floor(into / 3) * 3 // may exceed 11: Date.UTC rolls into the next year
    const start = istMidnight(fyYear, startIdx, 1)
    const q = Math.floor(into / 3) + 1
    return { from: start, to, label: `This quarter · Q${q} (${month(startIdx)}–${month(startIdx + 2)})` }
  }
  const start = istMidnight(fyYear, fy0, 1)
  const fyLabel = fy0 === 0 ? `${fyYear}` : `${fyYear}–${String((fyYear + 1) % 100).padStart(2, '0')}`
  return { from: start, to, label: `This financial year · FY ${fyLabel}` }
}
