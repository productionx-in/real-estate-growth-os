// lib/csv/parser.ts
import Papa from 'papaparse'
import { z } from 'zod'
import type { LeadSource, LeadPriority, LeadStatus } from '@/types/database'
import { mapCreatedAt, mapSource, mapStatus } from '@/lib/import/crm-mapping'

export interface ParsedCsvRow {
  name: string
  phone: string
  email?: string | null
  source?: LeadSource
  priority?: LeadPriority
  budget_min?: number | null
  budget_max?: number | null
  notes?: string | null
  /** Original enquiry time from the source CRM (ISO), kept so reports and history stay true. */
  created_at?: string | null
  status?: LeadStatus
  /** Salesperson as written in the export (name or email); matched to a team member on import. */
  owner?: string | null
  project_name?: string | null
}

export interface ValidatedCsvRow {
  rowIndex: number
  data: ParsedCsvRow
  isValid: boolean
  errors: string[]
}

const RowSchema = z.object({
  name: z.string().min(2, 'Name must have at least 2 characters').max(120),
  phone: z.string().min(7, 'Phone number must have at least 7 digits').max(20),
  email: z.string().email('Invalid email address').optional().nullable(),
  source: z
    .enum([
      'website',
      'meta_ads',
      'google_ads',
      '99acres',
      'housing',
      'magicbricks',
      'whatsapp',
      'referral',
      'walk_in',
      'csv_import',
      'other',
    ])
    .default('csv_import'),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  budget_min: z.coerce.number().min(0).optional().nullable(),
  budget_max: z.coerce.number().min(0).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  created_at: z.string().datetime().optional().nullable(),
  status: z.enum(['new', 'contacted', 'qualified', 'site_visit_scheduled', 'site_visited', 'negotiation', 'booked', 'lost', 'junk']).default('new'),
  owner: z.string().max(200).optional().nullable(),
  project_name: z.string().max(200).optional().nullable(),
})

export function parseAndValidateCsv(fileContent: string): {
  rows: ValidatedCsvRow[]
  validCount: number
  invalidCount: number
  totalCount: number
} {
  const result = Papa.parse<Record<string, string>>(fileContent, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (header) => header.trim().toLowerCase().replace(/[\s_-]+/g, '_'),
  })

  const validatedRows: ValidatedCsvRow[] = []

  result.data.forEach((raw, idx) => {
    // Normalize raw row keys (headers are lower_snake_case here). Covers our template, Sell.Do and common sheets.
    const pick = (...keys: string[]) => { for (const k of keys) { const v = raw[k]; if (v !== undefined && String(v).trim() !== '') return String(v) } return '' }
    const fullName = pick('name', 'full_name', 'lead_name', 'customer_name', 'client_name')
      || [pick('first_name'), pick('last_name')].filter(Boolean).join(' ')
    const phone = pick('phone', 'mobile', 'contact_number', 'phone_number', 'mobile_number', 'primary_phone', 'primary_mobile', 'contact')
    const email = pick('email', 'email_address', 'primary_email') || null
    const sourceRaw = pick('source', 'lead_source', 'channel', 'sub_source')
    const priority = (pick('priority') || 'medium').toLowerCase().trim()
    const budgetMinRaw = pick('budget_min', 'min_budget', 'budget')
    const budgetMaxRaw = pick('budget_max', 'max_budget')
    const notesRaw = pick('notes', 'remarks', 'comment', 'comments', 'requirement')
    const createdRaw = pick('created_at', 'created_on', 'created', 'lead_created', 'lead_created_at', 'enquiry_date', 'inquiry_date', 'lead_date', 'date')
    const statusRaw = pick('status', 'stage', 'lead_status', 'lead_stage')
    const owner = pick('owner', 'sales_person', 'salesperson', 'sales_executive', 'assigned_to', 'lead_owner', 'owner_email', 'agent')
    const project = pick('project', 'project_name', 'property')
    const unmappedSource = sourceRaw && mapSource(sourceRaw) === 'other' ? `Original source: ${sourceRaw}` : null

    const candidate: Record<string, unknown> = {
      name: fullName.trim(),
      phone: phone.trim(),
      email: email ? email.trim() : null,
      source: sourceRaw ? mapSource(sourceRaw) : 'csv_import',
      priority: ['low', 'medium', 'high'].includes(priority) ? priority : 'medium',
      budget_min: budgetMinRaw ? Number(budgetMinRaw.replace(/[,₹\s]/g, '')) : null,
      budget_max: budgetMaxRaw ? Number(budgetMaxRaw.replace(/[,₹\s]/g, '')) : null,
      notes: [notesRaw.trim(), unmappedSource].filter(Boolean).join('\n') || null,
      created_at: createdRaw ? mapCreatedAt(createdRaw) : null,
      status: mapStatus(statusRaw),
      owner: owner.trim() || null,
      project_name: project.trim() || null,
    }

    const parseResult = RowSchema.safeParse(candidate)

    if (parseResult.success) {
      validatedRows.push({
        rowIndex: idx + 1,
        data: parseResult.data as ParsedCsvRow,
        isValid: true,
        errors: [],
      })
    } else {
      const errorMessages = parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
      validatedRows.push({
        rowIndex: idx + 1,
        data: candidate as unknown as ParsedCsvRow,
        isValid: false,
        errors: errorMessages,
      })
    }
  })

  const validCount = validatedRows.filter((r) => r.isValid).length

  return {
    rows: validatedRows,
    validCount,
    invalidCount: validatedRows.length - validCount,
    totalCount: validatedRows.length,
  }
}

export const CSV_TEMPLATE_CONTENT = `name,phone,email,source,priority,budget_min,budget_max,notes
Vikram Mehta,+91 9876543210,vikram.m@example.com,walk_in,high,7500000,12000000,Interested in 3BHK high floor with park view
Ananya Sen,+91 9811122233,ananya.sen@example.com,website,medium,5000000,8500000,Looking for ready to move 2BHK
Karan Malhotra,+91 9900011223,,referral,medium,6000000,9000000,Referred by Sunita Sharma
Pooja Nair,+91 9845012345,pooja.nair@example.com,housing,low,4000000,6000000,Inquiry for upcoming project launch`
