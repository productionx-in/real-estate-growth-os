// lib/validations/follow-ups.ts
import { z } from 'zod'
import { OUTCOMES, OUTCOME_RULES } from '@/lib/follow-ups/outcomes'

const futureDate = z.string().datetime({ offset: true }).refine((v) => new Date(v).getTime() > Date.now() - 60_000, {
  message: 'Follow-up time must be in the future',
}).refine((v) => new Date(v).getTime() < Date.now() + 366 * 86_400_000, { message: 'Follow-up is too far ahead' })

export const DispositionSchema = z.object({
  outcome: z.enum(OUTCOMES),
  note: z.string().trim().max(1000).optional().nullable(),
  followUpAt: futureDate.optional().nullable(),
}).superRefine((v, ctx) => {
  if (OUTCOME_RULES[v.outcome].requiresFollowUp && !v.followUpAt) {
    ctx.addIssue({ code: 'custom', path: ['followUpAt'], message: 'Choose when to follow up next' })
  }
})

export const ContactActionSchema = z.object({ channel: z.enum(['call', 'whatsapp']) })

export const TaskCreateSchema = z.object({
  kind: z.enum(['call', 'whatsapp', 'meeting', 'site_visit', 'other']).default('call'),
  dueAt: futureDate,
  note: z.string().trim().max(1000).optional().nullable(),
})

export const TaskUpdateSchema = z.object({
  status: z.enum(['done', 'cancelled']).optional(),
  dueAt: futureDate.optional(),
}).refine((v) => v.status || v.dueAt, { message: 'Nothing to update' })

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM')
export const ResponseSettingsSchema = z.object({
  orgId: z.string().uuid(),
  firstResponseMinutes: z.number().int().min(1).max(240),
  nudgeMinutes: z.number().int().min(1).max(239),
  reassignOnBreach: z.boolean(),
  workdayStart: hhmm,
  workdayEnd: hhmm,
}).refine((v) => v.nudgeMinutes < v.firstResponseMinutes, { path: ['nudgeMinutes'], message: 'Nudge must come before the deadline' })
  .refine((v) => v.workdayStart < v.workdayEnd, { path: ['workdayEnd'], message: 'Working day must end after it starts' })

export type DispositionInput = z.infer<typeof DispositionSchema>
export type TaskCreateInput = z.infer<typeof TaskCreateSchema>
export type TaskUpdateInput = z.infer<typeof TaskUpdateSchema>
export type ResponseSettingsInput = z.infer<typeof ResponseSettingsSchema>
