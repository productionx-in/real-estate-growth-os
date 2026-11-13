// lib/csv/parser.ts
import Papa from 'papaparse'
import { z } from 'zod'
import type { LeadSource, LeadPriority } from '@/types/database'

export interface ParsedCsvRow {
  name: string
  phone: string
  email?: string | null
  source?: LeadSource
  priority?: LeadPriority
  budget_min?: number | null
  budget_max?: number | null
  notes?: string | null
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
    // Normalize raw row keys
    const name = raw.name || raw.full_name || raw.lead_name || ''
    const phone = raw.phone || raw.mobile || raw.contact_number || raw.phone_number || ''
    const email = raw.email || raw.email_address || null
    const source = (raw.source || raw.lead_source || 'csv_import').toLowerCase().trim()
    const priority = (raw.priority || 'medium').toLowerCase().trim()
    const budgetMinRaw = raw.budget_min || raw.min_budget || raw.budget
    const budgetMaxRaw = raw.budget_max || raw.max_budget
    const notes = raw.notes || raw.remarks || raw.comment || null

    const candidate: Record<string, unknown> = {
      name: name.trim(),
      phone: phone.trim(),
      email: email ? email.trim() : null,
      source: ['website', 'meta_ads', 'google_ads', '99acres', 'housing', 'magicbricks', 'whatsapp', 'referral', 'walk_in', 'csv_import'].includes(source)
        ? source
        : 'csv_import',
      priority: ['low', 'medium', 'high'].includes(priority) ? priority : 'medium',
      budget_min: budgetMinRaw ? Number(budgetMinRaw) : null,
      budget_max: budgetMaxRaw ? Number(budgetMaxRaw) : null,
      notes: notes ? notes.trim() : null,
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
