// lib/buyers/types.ts
// Domain types for Buyer 360, Customer Portfolio, Payment Schedule & KYC Management
// Production X — Real Estate Developer Growth OS

export interface CoBuyer {
  name: string
  relationship: string
  phone?: string
  email?: string
  pan?: string
  is_primary?: boolean
}

export type BuyerStatus = 'active' | 'inactive' | 'archived'

export interface BuyerProfile {
  id: string
  org_id: string
  primary_lead_id: string | null
  full_name: string
  email: string | null
  phone: string
  alternate_phone: string | null
  pan_number: string | null
  aadhaar_number_masked: string | null
  address_line1: string | null
  address_line2: string | null
  city: string | null
  state: string | null
  pincode: string | null
  country: string
  co_buyers: CoBuyer[]
  notes: string | null
  status: BuyerStatus
  created_at: string
  updated_at: string
  primary_lead?: {
    id: string
    name: string
    phone: string
    email: string | null
    source: string
  } | null
}

export type MilestoneStatus =
  | 'pending'
  | 'due'
  | 'partially_paid'
  | 'paid'
  | 'overdue'
  | 'waived'

export interface BookingPaymentMilestone {
  id: string
  org_id: string
  booking_id: string
  milestone_name: string
  milestone_sequence: number
  due_date: string
  amount_due: number
  amount_paid: number
  status: MilestoneStatus
  demand_letter_issued: boolean
  demand_letter_issued_at: string | null
  demand_letter_reference: string | null
  payment_records: Array<{
    payment_id: string
    receipt_number: string
    amount: number
    verified_at: string
  }>
  created_at: string
  updated_at: string
}

export type PaymentMethod =
  | 'bank_transfer_neft_rtgs'
  | 'cheque'
  | 'upi'
  | 'demand_draft'
  | 'credit_card'
  | 'cash'

export type PaymentStatus = 'unverified' | 'verified' | 'rejected' | 'bounced'

export interface BookingPayment {
  id: string
  org_id: string
  booking_id: string
  milestone_id: string | null
  receipt_number: string
  amount: number
  payment_method: PaymentMethod
  payment_date: string
  reference_number: string
  status: PaymentStatus
  verified_at: string | null
  verified_by: string | null
  rejection_reason: string | null
  receipt_url: string | null
  notes: string | null
  created_at: string
  updated_at: string
  verifier?: {
    id: string
    full_name: string
  } | null
  milestone?: {
    id: string
    milestone_name: string
  } | null
}

export type DocumentType =
  | 'pan_card'
  | 'aadhaar_card'
  | 'passport'
  | 'voter_id'
  | 'address_proof'
  | 'sale_agreement'
  | 'allotment_letter'
  | 'payment_receipt'
  | 'noc'
  | 'other'

export type DocumentStatus = 'pending' | 'verified' | 'rejected' | 'expired'

export interface BuyerDocument {
  id: string
  org_id: string
  buyer_id: string
  booking_id: string | null
  document_type: DocumentType
  title: string
  file_key: string
  file_name: string
  file_size_bytes: number | null
  mime_type: string
  status: DocumentStatus
  verification_notes: string | null
  verified_at: string | null
  verified_by: string | null
  created_by: string
  created_at: string
  updated_at: string
  verifier?: {
    id: string
    full_name: string
  } | null
  creator?: {
    id: string
    full_name: string
  } | null
}

export interface BuyerAuditLog {
  id: string
  org_id: string
  buyer_id: string
  actor_id: string
  action: string
  details: Record<string, unknown>
  ip_address: string | null
  created_at: string
  actor?: {
    id: string
    full_name: string
  } | null
}

export interface BuyerPortfolioItem {
  booking_id: string
  booking_number: string
  booking_date: string
  status: string
  payment_plan: string
  agreed_total_amount: number
  base_price: number
  additional_charges: number
  amount_received_verified: number
  outstanding_balance: number
  payment_progress_percent: number
  project: {
    id: string
    name: string
    code: string | null
    slug: string
  }
  unit: {
    id: string
    unit_number: string
    category: string
    status: string
    tower_or_block?: string | null
    floor_number?: number | null
  }
  channel_partner?: {
    id: string
    firm_name: string
    contact_person: string
  } | null
}

export interface Buyer360Data {
  buyer: BuyerProfile
  portfolio: BuyerPortfolioItem[]
  portfolioSummary: {
    totalBookingsCount: number
    activeBookingsCount: number
    totalConsideration: number
    totalPaidVerified: number
    totalOutstanding: number
  }
  milestones: BookingPaymentMilestone[]
  payments: BookingPayment[]
  documents: BuyerDocument[]
  leads: Array<{
    id: string
    name: string
    phone: string
    email: string | null
    status: string
    source: string
    created_at: string
    project?: { id: string; name: string } | null
    deal?: { id: string; stage: string; value: number } | null
  }>
  timeline: Array<{
    id: string
    type: 'audit' | 'activity' | 'payment' | 'booking' | 'document'
    title: string
    description: string
    timestamp: string
    actor_name?: string
    metadata?: Record<string, unknown>
  }>
}
