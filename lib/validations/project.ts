// lib/validations/project.ts
import { z } from 'zod'

export const ProjectSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(120),
  type: z.enum(['residential', 'commercial', 'mixed_use', 'plots']),
  status: z.enum(['planning', 'pre_launch', 'launched', 'ongoing', 'completed']),
  city: z.string().max(80).optional().or(z.literal('')),
  location: z.string().max(200).optional().or(z.literal('')),
  description: z.string().max(2000).optional().or(z.literal('')),
})

export type ProjectFormValues = z.infer<typeof ProjectSchema>
