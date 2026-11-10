// lib/validations/lead.ts
import { z } from 'zod'

export const LeadSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(120),
  phone: z
    .string()
    .min(7, 'Enter a valid phone number')
    .max(20)
    .regex(/^[+\d\s\-().]+$/, 'Invalid phone format'),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  source: z.enum([
    'website', 'meta_ads', 'google_ads', '99acres', 'housing',
    'magicbricks', 'whatsapp', 'referral', 'walk_in', 'csv_import', 'other',
  ]),
  status: z.enum([
    'new', 'contacted', 'qualified', 'site_visit_scheduled',
    'site_visited', 'negotiation', 'booked', 'lost', 'junk',
  ]).default('new'),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  project_id: z.string().uuid().optional().or(z.literal('')),
  budget_min: z.coerce.number().min(0).optional().nullable(),
  budget_max: z.coerce.number().min(0).optional().nullable(),
  notes: z.string().max(2000).optional().or(z.literal('')),
})

export type LeadFormValues = z.infer<typeof LeadSchema>
