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

  // CRM Integration Readiness & Attribution Fields (Stage 3G)
  source_platform: z.string().max(50).optional().nullable(),
  campaign_name: z.string().max(255).optional().nullable(),
  campaign_id: z.string().max(100).optional().nullable(),
  ad_name: z.string().max(255).optional().nullable(),
  ad_id: z.string().max(100).optional().nullable(),
  form_name: z.string().max(255).optional().nullable(),
  form_id: z.string().max(100).optional().nullable(),
  external_lead_id: z.string().max(100).optional().nullable(),
  source_url: z.string().url('Invalid URL').max(1000).optional().or(z.literal('')).nullable(),
  connection_id: z.string().uuid().optional().nullable(),
  source_metadata: z.record(z.string(), z.unknown()).optional().nullable(),
  is_duplicate: z.boolean().optional(),
  duplicate_of_id: z.string().uuid().optional().nullable(),
})

export type LeadFormValues = z.infer<typeof LeadSchema>
