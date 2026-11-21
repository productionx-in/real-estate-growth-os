// lib/documents/kinds.ts — the kinds of document template (client-safe; the database CHECK is in 20260071).
export const TEMPLATE_KINDS = {
  cost_sheet: 'Cost sheet', quotation: 'Quotation', booking: 'Booking confirmation', allotment: 'Allotment letter',
  demand: 'Payment demand', letter: 'Letter', other: 'Other',
} as const
export type TemplateKind = keyof typeof TEMPLATE_KINDS
