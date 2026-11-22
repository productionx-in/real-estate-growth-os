// lib/team/targets.ts — monthly targets per salesperson and progress against them. Pure: the API, the team page
// and the tests share one definition. Months are India-time calendar months, stored as their first day.

export interface Targets { siteVisits: number | null; bookings: number | null; bookingValue: number | null }
export interface Progress { siteVisits: number; bookings: number; bookingValue: number }

const IST = 330 * 60_000

/** "2026-11-01" for the India-time month containing `at`. */
export function monthKey(at: Date = new Date()): string {
  const d = new Date(at.getTime() + IST)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
}

/** The month's start and end as real instants (India midnight). */
export function monthRange(key: string): { from: Date; to: Date } {
  const [y, m] = key.split('-').map(Number)
  return { from: new Date(Date.UTC(y, m - 1, 1) - IST), to: new Date(Date.UTC(y, m, 1) - IST) }
}

/** The first day of the following month, "2026-12-01". */
export function nextMonthKey(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
}

export function isMonthKey(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])-01$/.test(v)) return false
  const y = Number(v.slice(0, 4))
  return y >= 2020 && y <= 2100
}

/** Blank → no target; otherwise a whole number in range. */
export function normaliseTargets(input: Partial<Record<keyof Targets, unknown>>): { value: Targets; errors: Record<string, string> } {
  const errors: Record<string, string> = {}
  const read = (k: keyof Targets, max: number, label: string): number | null => {
    const v = input[k]
    if (v === null || v === undefined || v === '') return null
    const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d+$/.test(v.trim()) ? Number(v) : NaN
    if (!Number.isInteger(n) || n < 0 || n > max) { errors[k] = `${label}: a whole number from 0 to ${max.toLocaleString('en-IN')}.`; return null }
    return n
  }
  return {
    value: { siteVisits: read('siteVisits', 1000, 'Site visits'), bookings: read('bookings', 1000, 'Bookings'), bookingValue: read('bookingValue', 1e13, 'Booking value') },
    errors,
  }
}

/** 0–100 (capped), or null when there is no target. */
export function percent(done: number, target: number | null): number | null {
  if (target === null) return null
  if (target === 0) return 100
  return Math.min(100, Math.round((done / target) * 100))
}

/** Where the month should be by now, 0–100: "on track" compares progress with this. */
export function expectedByNow(key: string, now: Date = new Date()): number {
  const { from, to } = monthRange(key)
  if (now <= from) return 0
  if (now >= to) return 100
  return Math.round(((now.getTime() - from.getTime()) / (to.getTime() - from.getTime())) * 100)
}
