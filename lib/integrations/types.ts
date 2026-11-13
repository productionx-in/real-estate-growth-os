// lib/integrations/types.ts
// Core domain types for CRM integrations and lead source architecture

import type { Json } from '@/types/database'

export type IntegrationProvider =
  | 'meta_ads'
  | 'google_ads'
  | 'website_webhook'
  | 'whatsapp_cloud'
  | 'property_portal_99acres'
  | 'property_portal_magicbricks'
  | 'property_portal_housing'
  | 'manual'
  | 'other'

export type IntegrationConnectionStatus = 'not_connected' | 'connected' | 'error' | 'disabled'

export type MappingIdentifierType = 'campaign_id' | 'form_id' | 'page_id' | 'account_default'

export type ProcessingStatus = 'received' | 'processed' | 'duplicate' | 'unmapped' | 'failed'

export type EnquiryClassification =
  | 'duplicate_external_event'
  | 'possible_duplicate_customer_enquiry'
  | 'separate_customer_enquiry'
  | 'new_customer_enquiry'

// ── Meta Asset Types for Customer-Facing UX (Stage 4A) ──────────────────────

export interface MetaLeadFormAsset {
  id: string
  name: string
  status?: 'ACTIVE' | 'ARCHIVED' | 'PAUSED' | string
  leadsCount?: number
  createdTime?: string
}

export interface MetaPageAsset {
  id: string
  name: string
  category?: string
  accessStatus?: 'active' | 'expired' | 'revoked'
  forms?: MetaLeadFormAsset[]
}

export interface MetaAdAccountAsset {
  id: string
  name: string
  accountStatus?: string
}

export interface MetaConnectionMetadata {
  pages?: MetaPageAsset[]
  adAccounts?: MetaAdAccountAsset[]
  authorizedUserName?: string
  tokenExpiry?: string
  scopes?: string[]
  appId?: string
  healthStatus?: 'healthy' | 'warning' | 'error' | 'pending'
  [key: string]: unknown
}

export interface IntegrationConnectionRecord {
  id: string
  org_id: string
  provider: IntegrationProvider
  name: string
  external_account_id: string | null
  status: IntegrationConnectionStatus
  connected_by: string | null
  last_sync_at: string | null
  last_error: string | null
  credential_ref: string | null
  metadata: Json
  created_at: string
  updated_at: string
}

export interface IntegrationProjectMappingRecord {
  id: string
  org_id: string
  connection_id: string
  project_id: string
  external_identifier_type: MappingIdentifierType
  external_identifier_value: string
  description: string | null
  created_at: string
  updated_at: string
  project?: {
    id: string
    name: string
    slug: string
  }
}

export interface IntegrationEventLogRecord {
  id: string
  org_id: string
  connection_id: string | null
  provider: string
  event_type: string
  external_event_id: string | null
  processing_status: ProcessingStatus
  error_message: string | null
  lead_id: string | null
  received_at: string
  processed_at: string | null
}

export interface InboundLeadPayload {
  connectionId?: string
  provider: IntegrationProvider
  externalLeadId?: string
  idempotencyToken?: string
  name: string
  phone: string
  email?: string | null
  campaignId?: string | null
  campaignName?: string | null
  adId?: string | null
  adName?: string | null
  formId?: string | null
  formName?: string | null
  sourceUrl?: string | null
  notes?: string | null
  budgetMin?: number | null
  budgetMax?: number | null
  sourceMetadata?: Record<string, unknown>
  customFields?: Record<string, unknown>
  rawPayload?: Record<string, unknown>
}

export interface InboundProcessingResult {
  success: boolean
  leadId?: string
  isDuplicate: boolean
  duplicateOfId?: string | null
  projectId?: string | null
  routingStatus: 'mapped' | 'unmapped'
  idempotencyKey: string | null
  action:
    | 'created'
    | 'idempotent_replay'
    | 'flagged_duplicate_created'
    | 'separate_enquiry_created'
    | 'error'
  classification?: EnquiryClassification
  errorMessage?: string
}

export interface DeduplicationCheckResult {
  isDuplicate: boolean
  duplicateOfId: string | null
  classification: EnquiryClassification
  matchReason?: 'external_lead_id' | 'phone_match' | 'email_match'
  relatedLeadId?: string | null
}

export interface ProviderCapability {
  provider: IntegrationProvider
  name: string
  category: 'social_ads' | 'search_ads' | 'website' | 'messaging' | 'property_portal'
  supportedMappingTypes: MappingIdentifierType[]
  supportsWebhook: boolean
  supportsPullSync: boolean
  status: 'readiness_only' | 'planned'
  description: string
  verifiedProviderRequirements: string
  proposedOsArchitecture: string
  futureStage4Requirements: string
}
