// lib/integrations/forms/types.ts
// Domain types for Website Enquiry Forms, embed configurations, and submissions.

export interface EnquirySubmissionInput {
  name: string
  phone: string
  email?: string | null
  projectId?: string | null
  formId?: string | null
  connectionId?: string | null
  unitPreference?: string | null
  budget?: string | null
  notes?: string | null
  scheduleSiteVisit?: boolean
  utmSource?: string | null
  utmMedium?: string | null
  utmCampaign?: string | null
  utmTerm?: string | null
  utmContent?: string | null
  pageUrl?: string | null
  referrer?: string | null
  externalLeadId?: string | null
  idempotencyToken?: string | null
  // Anti-spam defense fields
  hpConfirm?: string | null
  website_url_hp?: string | null
  formLoadTime?: number | null
  submissionTime?: number | null
  [key: string]: unknown
}

export interface SpamEvaluationResult {
  isSpam: boolean
  reason?: string
}

export interface FormEmbedOptions {
  connectionId: string
  projectId?: string
  projectName?: string
  formTitle?: string
  subtitle?: string
  buttonText?: string
  themeColor?: string
  unitTypeOptions?: string[]
  enableSiteVisitCheckbox?: boolean
  appUrl?: string
}
