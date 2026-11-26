// lib/validations/routing.ts
// Input validation for teams, team membership, routing rules and on-duty status (RE by PX Lead Engine, M1).
import { z } from 'zod'

export const LEAD_SOURCES = [
  'website', 'meta_ads', 'google_ads', '99acres', 'housing', 'magicbricks',
  'whatsapp', 'referral', 'walk_in', 'csv_import', 'other',
] as const

export const ROUTING_STRATEGIES = ['round_robin', 'least_open'] as const

const orgId = z.string().uuid()
const shortText = (max: number) => z.string().trim().min(1).max(max)

export const TeamCreateSchema = z.object({
  orgId,
  name: shortText(80),
  description: z.string().trim().max(500).optional().nullable(),
  timezone: z.string().trim().min(1).max(64).default('Asia/Kolkata'),
})

export const TeamUpdateSchema = z.object({
  orgId,
  name: shortText(80).optional(),
  description: z.string().trim().max(500).optional().nullable(),
  timezone: z.string().trim().min(1).max(64).optional(),
  isActive: z.boolean().optional(),
}).refine((v) => Object.keys(v).length > 1, { message: 'Nothing to update' })

export const TeamMemberUpsertSchema = z.object({
  orgId,
  profileId: z.string().uuid(),
  weight: z.number().int().min(1).max(10).default(1),
  dailyCapacity: z.number().int().positive().max(1000).nullable().default(null),
  isOnDuty: z.boolean().default(true),
})

const ruleFields = {
  name: shortText(120),
  priority: z.number().int().min(0).max(100000).default(100),
  teamId: z.string().uuid(),
  strategy: z.enum(ROUTING_STRATEGIES).default('round_robin'),
  stickyDays: z.number().int().min(0).max(365).default(90),
  isActive: z.boolean().default(true),
  matchProjectIds: z.array(z.string().uuid()).max(200).default([]),
  matchSources: z.array(z.enum(LEAD_SOURCES)).max(LEAD_SOURCES.length).default([]),
  matchConnectionIds: z.array(z.string().uuid()).max(200).default([]),
  matchCampaignIds: z.array(z.string().trim().min(1).max(120)).max(200).default([]),
  matchFormIds: z.array(z.string().trim().min(1).max(120)).max(200).default([]),
}

export const RuleCreateSchema = z.object({ orgId, ...ruleFields })

export const RuleUpdateSchema = z.object({
  orgId,
  name: ruleFields.name.optional(),
  priority: z.number().int().min(0).max(100000).optional(),
  teamId: z.string().uuid().optional(),
  strategy: z.enum(ROUTING_STRATEGIES).optional(),
  stickyDays: z.number().int().min(0).max(365).optional(),
  isActive: z.boolean().optional(),
  matchProjectIds: z.array(z.string().uuid()).max(200).optional(),
  matchSources: z.array(z.enum(LEAD_SOURCES)).max(LEAD_SOURCES.length).optional(),
  matchConnectionIds: z.array(z.string().uuid()).max(200).optional(),
  matchCampaignIds: z.array(z.string().trim().min(1).max(120)).max(200).optional(),
  matchFormIds: z.array(z.string().trim().min(1).max(120)).max(200).optional(),
}).refine((v) => Object.keys(v).length > 1, { message: 'Nothing to update' })

export const DutyToggleSchema = z.object({
  orgId,
  isOnDuty: z.boolean(),
})

export type TeamCreateInput = z.infer<typeof TeamCreateSchema>
export type TeamUpdateInput = z.infer<typeof TeamUpdateSchema>
export type TeamMemberUpsertInput = z.infer<typeof TeamMemberUpsertSchema>
export type RuleCreateInput = z.infer<typeof RuleCreateSchema>
export type RuleUpdateInput = z.infer<typeof RuleUpdateSchema>
