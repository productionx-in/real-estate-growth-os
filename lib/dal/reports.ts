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

// ── Lead pipeline timing ──────────────────────────────────────────────────────────────────────────
// Each step a lead goes through, measured separately (seconds): the source → our server, our server → saved,
// saved → assigned, assigned → first action. Only leads that carry both timestamps of a step count for it.
export type PipelineStage = 'submit_to_receipt' | 'receipt_to_saved' | 'saved_to_assigned' | 'assigned_to_first_action'
export interface PipelineTiming {
  leads: number
  stages: Partial<Record<PipelineStage, { n: number; p50: number; p90: number }>>
  saved_within_30s: number
  saved_measured: number
  assigned_within_5s: number
  assigned_measured: number
}

export const PIPELINE_STAGES: { key: PipelineStage; label: string; hint: string }[] = [
  { key: 'submit_to_receipt', label: 'Buyer submits → we receive', hint: 'Depends on the source (e.g. Meta). Only where the source sends its own time.' },
  { key: 'receipt_to_saved', label: 'Received → saved', hint: 'Our processing. Target: 95% within 30 seconds.' },
  { key: 'saved_to_assigned', label: 'Saved → assigned', hint: 'Routing. Target: within 5 seconds.' },
  { key: 'assigned_to_first_action', label: 'Assigned → first call or message', hint: 'Your team’s response.' },
]

export async function getPipelineTiming(orgId: string, period: ReportPeriod): Promise<PipelineTiming> {
  const to = new Date()
  const from = new Date(to.getTime() - REPORT_PERIODS[period] * 86_400_000)
  const { data, error } = await createServiceClient().rpc('lead_pipeline_timing', { p_org: orgId, p_from: from.toISOString(), p_to: to.toISOString() })
  if (error) throw new Error(`pipeline timing: ${error.message}`)
  return data as unknown as PipelineTiming
}

/** "4 s", "2 min 5 s", "3 h 10 min" — durations people can read at a glance. */
export function duration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return '—'
  const s = Math.round(seconds)
  if (s < 60) return `${s} s`
  if (s < 3600) return `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ''}`
  const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60)
  return h < 48 ? `${h} h${m ? ` ${m} min` : ''}` : `${Math.round(h / 24)} days`
}
