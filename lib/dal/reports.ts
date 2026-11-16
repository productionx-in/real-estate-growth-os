// lib/dal/reports.ts
// Speed-to-lead and source-quality report (M3). Wraps lead_response_report() (service role only);
// callers must have checked the viewer may see organisation-wide figures.
import { createServiceClient } from '@/lib/supabase/server'

export interface ReportRow {
  key: string | null
  label: string | null
  leads: number
  contacted: number
  never_contacted: number
  median_min: number | null
  p90_min: number | null
  within_target: number
  missed: number
  timed: number
  junk: number
  qualified_plus: number
  site_visits: number
  booked: number
}

export interface ResponseReport {
  from: string
  to: string
  timezone: string
  overall: ReportRow
  by_rep: ReportRow[]
  by_source: ReportRow[]
  by_project: ReportRow[]
  by_hour: { hour: number; leads: number; median_min: number | null }[]
}

export const REPORT_PERIODS = { '7d': 7, '30d': 30, '90d': 90 } as const
export type ReportPeriod = keyof typeof REPORT_PERIODS

export async function getResponseReport(orgId: string, period: ReportPeriod): Promise<ResponseReport> {
  const to = new Date()
  const from = new Date(to.getTime() - REPORT_PERIODS[period] * 86_400_000)
  const { data, error } = await createServiceClient().rpc('lead_response_report', {
    p_org: orgId, p_from: from.toISOString(), p_to: to.toISOString(),
  })
  if (error) throw new Error(`response report: ${error.message}`)
  return data as unknown as ResponseReport
}

/** Share of timed leads contacted within the target, 0–100, or null when nothing was timed. */
export function withinTargetPct(r: Pick<ReportRow, 'within_target' | 'timed'>): number | null {
  return r.timed > 0 ? Math.round((r.within_target / r.timed) * 100) : null
}

export function pct(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null
}
