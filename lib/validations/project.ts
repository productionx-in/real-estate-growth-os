// lib/validations/project.ts
import { z } from 'zod'

export const PROJECT_CATEGORIES = [
  'apartments',
  'plotted_developments',
  'commercial_sale',
  'villas_gated_communities',
  'mixed_use',
] as const

export const ProjectSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(120),
  code: z.string().max(20).optional().or(z.literal('')),
  category: z.enum(PROJECT_CATEGORIES).default('apartments'),
  type: z.enum(['residential', 'commercial', 'mixed_use', 'plots']).default('residential'),
  status: z.enum(['planning', 'pre_launch', 'launched', 'ongoing', 'completed']),
  city: z.string().max(80).optional().or(z.literal('')),
  location: z.string().max(200).optional().or(z.literal('')),
  description: z.string().max(2000).optional().or(z.literal('')),
  rera_number: z.string().max(80).optional().or(z.literal('')),
  total_area_value: z.number().positive().optional().nullable(),
  total_area_unit: z.string().max(20).optional().default('acres'),
  total_units_count: z.number().int().nonnegative().optional().default(0),
  approval_authority: z.string().max(100).optional().or(z.literal('')),
  launch_date: z.string().optional().or(z.literal('')),
  completion_date: z.string().optional().or(z.literal('')),
})

export type ProjectFormValues = z.infer<typeof ProjectSchema>
