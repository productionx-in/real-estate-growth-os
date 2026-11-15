// lib/sales/types.ts
// Domain types for Stage 5: Sales & Channel Partner Operations

export type SiteVisitStatus =
  | 'scheduled'
  | 'rescheduled'
  | 'checked_in'
  | 'completed'
  | 'cancelled'
  | 'no_show'

export type SiteVisitOutcome =
  | 'interested'
  | 'negotiation'
  | 'uninterested'
  | 'booked'
  | 'follow_up_needed'

export interface SiteVisit {
  id: string
  org_id: string
  project_id: string
  lead_id: string
  assigned_to: string | null
  scheduled_at: string
  status: SiteVisitStatus
  outcome: SiteVisitOutcome | null
  notes: string | null
  rating: number | null
  visitor_count: number
  cab_required: boolean
  cab_details?: Record<string, unknown>
  checked_in_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export type ChannelPartnerTier = 'silver' | 'gold' | 'platinum'
export type ChannelPartnerStatus = 'active' | 'suspended' | 'pending_approval'

export interface ChannelPartner {
  id: string
  org_id: string
  firm_name: string
  rera_registration_number: string | null
  contact_person: string
  phone: string
  email: string | null
  pan_number: string | null
  gst_number: string | null
  tier: ChannelPartnerTier
  status: ChannelPartnerStatus
  default_commission_rate: number
  bank_details?: Record<string, unknown>
  notes: string | null
  created_at: string
  updated_at: string
  lead?: { id?: string; name: string; phone?: string; email?: string } | null
  project?: { id?: string; name: string } | null
}

export type BlockingStatus = 'active' | 'expired' | 'converted_to_booking' | 'cancelled'

export interface InventoryBlocking {
  id: string
  org_id: string
  project_id: string
  inventory_id: string
  lead_id: string
  blocked_by: string | null
  status: BlockingStatus
  token_amount: number
  payment_reference: string | null
  expires_at: string
  remarks: string | null
  created_at: string
  updated_at: string
  lead?: { id?: string; name: string; phone?: string; email?: string } | null
  inventory?: { id?: string; unit_number: string; category?: string; total_price?: number } | null
  project?: { id?: string; name: string } | null
}

export type BookingStatus = 'draft' | 'confirmed' | 'agreement_signed' | 'registered' | 'cancelled'
export type PaymentPlanType = 'construction_linked' | 'time_linked' | 'down_payment' | 'custom'

export interface Booking {
  id: string
  org_id: string
  project_id: string
  inventory_id: string
  lead_id: string
  blocking_id: string | null
  channel_partner_id: string | null
  booking_number: string
  booking_date: string
  status: BookingStatus
  base_price: number
  additional_charges: number
  total_amount: number
  booking_amount_received: number
  payment_plan: PaymentPlanType
  documents?: unknown[]
  remarks: string | null
  created_at: string
  updated_at: string
  lead?: { id?: string; name: string; phone?: string; email?: string } | null
  inventory?: { id?: string; unit_number: string; category?: string; total_price?: number } | null
  project?: { id?: string; name: string } | null
}

export type CommissionType = 'percentage' | 'fixed_per_sqft' | 'lump_sum'
export type CommissionStatus = 'pending_approval' | 'approved' | 'partially_paid' | 'paid' | 'cancelled'

export interface CommissionMilestone {
  name: string
  percentage: number
  amount: number
  trigger_event: 'booking_confirmed' | 'agreement_signed' | 'slab_cast' | 'possession'
  due_date?: string
  is_paid: boolean
}

export interface ChannelPartnerCommission {
  id: string
  org_id: string
  booking_id: string
  channel_partner_id: string
  commission_type: CommissionType
  commission_rate: number
  gross_commission_amount: number
  tds_percentage: number
  net_commission_amount: number
  status: CommissionStatus
  milestones: CommissionMilestone[]
  paid_amount: number
  payment_notes: string | null
  created_at: string
  updated_at: string
}

export type DealStage =
  | 'enquiry'
  | 'contacted'
  | 'site_visit_scheduled'
  | 'site_visit_completed'
  | 'negotiation'
  | 'unit_blocked'
  | 'booked'
  | 'registered'
  | 'lost'

export interface Deal {
  id: string
  org_id: string
  project_id: string
  lead_id: string
  inventory_id: string | null
  channel_partner_id: string | null
  assigned_to: string | null
  stage: DealStage
  deal_value: number | null
  probability: number
  expected_close_date: string | null
  loss_reason: string | null
  notes: string | null
  created_at: string
  updated_at: string
  lead?: { id?: string; name: string; phone?: string; email?: string } | null
  project?: { id?: string; name: string } | null
}
