// lib/dal/follow-ups.ts
// Call outcomes, tap-to-contact logging, follow-up tasks, "My day" lists and response settings (M2).
// Callers authorise first (lib/follow-ups/auth.ts); every query is additionally scoped by organisation.
import { createServiceClient } from '@/lib/supabase/server'
import { OUTCOME_RULES, nextStatus, type Outcome } from '@/lib/follow-ups/outcomes'
import type { DispositionInput, ResponseSettingsInput, TaskCreateInput, TaskUpdateInput } from '@/lib/validations/follow-ups'
import type { LeadStatus } from '@/types/database'
import type { DalResult } from '@/lib/dal/routing'

export interface LeadWorkContext {
  orgId: string
  leadId: string
  actorId: string
  status: LeadStatus
}

function failure(error: { code?: string; message?: string } | null, fallback: string): { success: false; error: string; status: number } {
  if (/lead_task_integrity/.test(error?.message ?? '')) return { success: false, error: 'Invalid assignee for this lead', status: 400 }
  return { success: false, error: fallback, status: 500 }
}

export async function logOutcome(ctx: LeadWorkContext, input: DispositionInput): Promise<DalResult<{ status: LeadStatus; taskId: string | null }>> {
  const rule = OUTCOME_RULES[input.outcome as Outcome]
  const status = nextStatus(ctx.status, input.outcome as Outcome)
  const { data, error } = await createServiceClient().rpc('log_lead_outcome', {
    p_lead: ctx.leadId,
    p_actor: ctx.actorId,
    p_outcome: input.outcome,
    p_new_status: status,
    p_note: input.note ?? null,
    p_follow_up_at: rule.requiresFollowUp ? input.followUpAt ?? null : null,
    p_follow_up_kind: rule.followUpKind,
  })
  if (error) return failure(error, 'Could not save the outcome')
  const result = (data ?? {}) as { task_id?: string | null }
  return { success: true, data: { status, taskId: result.task_id ?? null } }
}

/** A tap on Call / WhatsApp counts as the first action on the lead (stops the response clock). */
export async function logContactAttempt(ctx: LeadWorkContext, channel: 'call' | 'whatsapp'): Promise<DalResult<{ logged: true }>> {
  const { error } = await createServiceClient().from('lead_activities').insert({
    lead_id: ctx.leadId,
    actor_id: ctx.actorId,
    type: channel === 'call' ? 'call_logged' : 'whatsapp_logged',
    note: null,
    metadata: { via: 'tap', channel },
  })
  if (error) return failure(error, 'Could not log the contact')
  return { success: true, data: { logged: true } }
}

export async function createTask(ctx: LeadWorkContext, assignee: string | null, input: TaskCreateInput): Promise<DalResult<{ id: string }>> {
  const db = createServiceClient()
  const { data, error } = await db.from('lead_tasks').insert({
    org_id: ctx.orgId, lead_id: ctx.leadId, assigned_to: assignee ?? ctx.actorId, kind: input.kind,
    due_at: input.dueAt, note: input.note ?? null, created_by: ctx.actorId,
  }).select('id').single()
  if (error || !data) return failure(error, 'Could not schedule the follow-up')
  await db.from('lead_activities').insert({
    lead_id: ctx.leadId, actor_id: ctx.actorId, type: 'follow_up_scheduled', note: input.note ?? null,
    metadata: { task_id: data.id, due_at: input.dueAt, kind: input.kind },
  })
  return { success: true, data }
}

export async function updateTask(ctx: LeadWorkContext, taskId: string, input: TaskUpdateInput): Promise<DalResult<{ id: string }>> {
  const db = createServiceClient()
  const patch: { status?: 'done' | 'cancelled'; completed_at?: string; due_at?: string; reminded_at?: null; overdue_alerted_at?: null } = {}
  if (input.status) { patch.status = input.status; patch.completed_at = new Date().toISOString() }
  if (input.dueAt) { patch.due_at = input.dueAt; patch.reminded_at = null; patch.overdue_alerted_at = null }
  const { data, error } = await db.from('lead_tasks').update(patch)
    .eq('id', taskId).eq('lead_id', ctx.leadId).eq('org_id', ctx.orgId).eq('status', 'open').select('id').maybeSingle()
  if (error) return failure(error, 'Could not update the follow-up')
  if (!data) return { success: false, error: 'Follow-up not found or already closed', status: 404 }
  if (input.status === 'done') {
    await db.from('lead_activities').insert({ lead_id: ctx.leadId, actor_id: ctx.actorId, type: 'follow_up_completed', note: null, metadata: { task_id: taskId } })
  }
  return { success: true, data }
}

export async function listLeadTasks(orgId: string, leadId: string) {
  const { data } = await createServiceClient().from('lead_tasks')
    .select('id, kind, due_at, note, status, completed_at, assigned_to')
    .eq('org_id', orgId).eq('lead_id', leadId).order('status').order('due_at')
  return data ?? []
}

export interface MyDayLead {
  id: string
  name: string
  phone: string
  status: LeadStatus
  source: string
  created_at: string
  sla_due_at: string | null
  sla_state: string | null
  next_follow_up_at: string | null
  project: { name: string } | null
  assignee: { id: string; full_name: string } | null
}

const LEAD_COLUMNS = 'id, name, phone, status, source, created_at, sla_due_at, sla_state, next_follow_up_at, project:projects(name), assignee:profiles!leads_assigned_to_fkey(id, full_name)'

/**
 * The salesperson's day: new leads waiting for a first call, overdue follow-ups, today's follow-ups.
 * `profileId` null = whole organisation (managers' team view).
 */
export async function getMyDay(orgId: string, profileId: string | null, timezone = 'Asia/Kolkata') {
  const db = createServiceClient()
  const now = new Date()
  const localDay = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  const offsetMinutes = tzOffsetMinutes(timezone, now)
  const endOfDay = new Date(Date.parse(`${localDay}T23:59:59.999Z`) - offsetMinutes * 60_000).toISOString()

  const scope = <T extends { eq: (c: string, v: string) => T }>(q: T) => (profileId ? q.eq('assigned_to', profileId) : q)
  const open = ['booked', 'lost', 'junk']

  const [waiting, overdue, today] = await Promise.all([
    scope(db.from('leads').select(LEAD_COLUMNS).eq('org_id', orgId))
      .is('first_action_at', null).not('status', 'in', `(${open.join(',')})`).not('assigned_to', 'is', null)
      .order('created_at', { ascending: true }).limit(100),
    scope(db.from('leads').select(LEAD_COLUMNS).eq('org_id', orgId))
      .lt('next_follow_up_at', now.toISOString()).order('next_follow_up_at', { ascending: true }).limit(100),
    scope(db.from('leads').select(LEAD_COLUMNS).eq('org_id', orgId))
      .gte('next_follow_up_at', now.toISOString()).lte('next_follow_up_at', endOfDay).order('next_follow_up_at', { ascending: true }).limit(100),
  ])
  const err = waiting.error || overdue.error || today.error
  if (err) throw new Error(`my day: ${err.message}`)
  return {
    waiting: (waiting.data ?? []) as unknown as MyDayLead[],
    overdue: (overdue.data ?? []) as unknown as MyDayLead[],
    today: (today.data ?? []) as unknown as MyDayLead[],
  }
}

function tzOffsetMinutes(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(at).reduce<Record<string, string>>((a, p) => ({ ...a, [p.type]: p.value }), {})
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second)
  return Math.round((asUtc - at.getTime()) / 60_000)
}

export const DEFAULT_RESPONSE_SETTINGS = {
  first_response_minutes: 5, nudge_minutes: 3, reassign_on_breach: false, workday_start: '09:00', workday_end: '21:00', timezone: 'Asia/Kolkata',
}

export async function getResponseSettings(orgId: string) {
  const { data } = await createServiceClient().from('lead_response_settings').select('*').eq('org_id', orgId).maybeSingle()
  return data ?? { org_id: orgId, ...DEFAULT_RESPONSE_SETTINGS }
}

export async function saveResponseSettings(input: ResponseSettingsInput): Promise<DalResult<{ orgId: string }>> {
  const { error } = await createServiceClient().from('lead_response_settings').upsert({
    org_id: input.orgId,
    first_response_minutes: input.firstResponseMinutes,
    nudge_minutes: input.nudgeMinutes,
    reassign_on_breach: input.reassignOnBreach,
    workday_start: input.workdayStart,
    workday_end: input.workdayEnd,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'org_id' })
  if (error) return failure(error, 'Could not save response settings')
  return { success: true, data: { orgId: input.orgId } }
}
