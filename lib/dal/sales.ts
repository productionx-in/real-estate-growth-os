// lib/dal/sales.ts
// Data Access Layer for Stage 5: Sales & Channel Partner Operations.
// Strictly tenant-isolated via org_id.

import { createServiceClient } from '@/lib/supabase/server'
import type {
  SiteVisit,
  SiteVisitStatus,
  SiteVisitOutcome,
  ChannelPartner,
  InventoryBlocking,
  Booking,
  ChannelPartnerCommission,
  CommissionType,
  Deal,
  DealStage,
} from '@/lib/sales/types'

// ---------------------------------------------------------------------------
// 1. Site Visits Management
// ---------------------------------------------------------------------------

export async function scheduleSiteVisit(params: {
  orgId: string
  projectId: string
  leadId: string
  assignedTo?: string | null
  scheduledAt: string
  notes?: string | null
  visitorCount?: number
  cabRequired?: boolean
  cabDetails?: Record<string, unknown>
}): Promise<{ success: boolean; data?: SiteVisit; error?: string }> {
  const service = createServiceClient()

  try {
    const { data, error } = await service
      .from('site_visits')
      .insert({
        org_id: params.orgId,
        project_id: params.projectId,
        lead_id: params.leadId,
        assigned_to: params.assignedTo || null,
        scheduled_at: params.scheduledAt,
        notes: params.notes || null,
        visitor_count: params.visitorCount || 1,
        cab_required: params.cabRequired || false,
        cab_details: (params.cabDetails || {}) as import('@/types/database').Json,
        status: 'scheduled',
      })
      .select('*')
      .single()

    if (error) return { success: false, error: error.message }
    return { success: true, data: data as unknown as SiteVisit }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, error: msg }
  }
}

export async function updateSiteVisit(
  id: string,
  orgId: string,
  updates: {
    status?: SiteVisitStatus
    outcome?: SiteVisitOutcome | null
    notes?: string | null
    rating?: number | null
    checkedInAt?: string | null
    completedAt?: string | null
  }
): Promise<{ success: boolean; data?: SiteVisit; error?: string }> {
  const service = createServiceClient()

  try {
    const { data, error } = await service
      .from('site_visits')
      .update({
        ...(updates.status && { status: updates.status }),
        ...(updates.outcome !== undefined && { outcome: updates.outcome }),
        ...(updates.notes !== undefined && { notes: updates.notes }),
        ...(updates.rating !== undefined && { rating: updates.rating }),
        ...(updates.checkedInAt !== undefined && { checked_in_at: updates.checkedInAt }),
        ...(updates.completedAt !== undefined && { completed_at: updates.completedAt }),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('org_id', orgId)
      .select('*')
      .single()

    if (error) return { success: false, error: error.message }
    return { success: true, data: data as unknown as SiteVisit }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, error: msg }
  }
}

export async function getSiteVisits(
  orgId: string,
  filters?: { projectId?: string; leadId?: string; status?: SiteVisitStatus }
): Promise<SiteVisit[]> {
  const service = createServiceClient()
  let query = service.from('site_visits').select('*').eq('org_id', orgId)

  if (filters?.projectId) query = query.eq('project_id', filters.projectId)
  if (filters?.leadId) query = query.eq('lead_id', filters.leadId)
  if (filters?.status) query = query.eq('status', filters.status)

  const { data } = await query.order('scheduled_at', { ascending: false })
  return (data || []) as unknown as SiteVisit[]
}

// ---------------------------------------------------------------------------
// 2. Channel Partner Directory
// ---------------------------------------------------------------------------

export async function createChannelPartner(params: {
  orgId: string
  firmName: string
  reraRegistrationNumber?: string | null
  contactPerson: string
  phone: string
  email?: string | null
  panNumber?: string | null
  gstNumber?: string | null
  tier?: 'silver' | 'gold' | 'platinum'
  defaultCommissionRate?: number
  bankDetails?: Record<string, unknown>
  notes?: string | null
}): Promise<{ success: boolean; data?: ChannelPartner; error?: string }> {
  const service = createServiceClient()

  try {
    const { data, error } = await service
      .from('channel_partners')
      .insert({
        org_id: params.orgId,
        firm_name: params.firmName,
        rera_registration_number: params.reraRegistrationNumber || null,
        contact_person: params.contactPerson,
        phone: params.phone,
        email: params.email || null,
        pan_number: params.panNumber || null,
        gst_number: params.gstNumber || null,
        tier: params.tier || 'silver',
        status: 'active',
        default_commission_rate: params.defaultCommissionRate ?? 2.0,
        bank_details: (params.bankDetails || {}) as import('@/types/database').Json,
        notes: params.notes || null,
      })
      .select('*')
      .single()

    if (error) return { success: false, error: error.message }
    return { success: true, data: data as unknown as ChannelPartner }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, error: msg }
  }
}

export async function getChannelPartners(
  orgId: string,
  filters?: { status?: string; tier?: string }
): Promise<ChannelPartner[]> {
  const service = createServiceClient()
  let query = service.from('channel_partners').select('*').eq('org_id', orgId)

  if (filters?.status) query = query.eq('status', filters.status)
  if (filters?.tier) query = query.eq('tier', filters.tier)

  const { data } = await query.order('firm_name', { ascending: true })
  return (data || []) as unknown as ChannelPartner[]
}

// ---------------------------------------------------------------------------
// 3. Inventory Blockings (Temporary Hold)
// ---------------------------------------------------------------------------

export async function blockInventoryUnit(params: {
  orgId: string
  projectId: string
  inventoryId: string
  leadId: string
  blockedBy?: string | null
  tokenAmount: number
  paymentReference?: string | null
  paymentStatus?: 'unverified' | 'verified' | 'failed' | 'refunded'
  holdDurationHours?: number // default 48h
  remarks?: string | null
  idempotencyKey?: string | null
}): Promise<{ success: boolean; data?: InventoryBlocking; error?: string }> {
  const service = createServiceClient()

  try {
    // 1. Attempt atomic PostgreSQL RPC execution
    const { data: rpcData, error: rpcErr } = await service.rpc(
      'hold_inventory_unit_atomic' as never,
      {
        p_org_id: params.orgId,
        p_project_id: params.projectId,
        p_inventory_id: params.inventoryId,
        p_lead_id: params.leadId,
        p_token_amount: params.tokenAmount,
        p_hold_duration_hours: params.holdDurationHours || 48,
        p_payment_reference: params.paymentReference || null,
        p_payment_status: params.paymentStatus || 'unverified',
        p_remarks: params.remarks || null,
        p_actor_id: params.blockedBy || null,
        p_idempotency_key: params.idempotencyKey || null,
      } as never
    )

    if (rpcErr) {
      return { success: false, error: rpcErr.message }
    }

    if (!rpcData) {
      return { success: false, error: 'Hold atomic RPC returned no data' }
    }

    const rows = Array.isArray(rpcData) ? rpcData : [rpcData]
    if (rows.length === 0) {
      return { success: false, error: 'Hold atomic RPC returned empty record' }
    }

    const blockingId =
      (rows[0] as { blocking_id?: string; id?: string }).blocking_id ||
      (rows[0] as { id?: string }).id ||
      ''

    const { data: fullBlocking } = await service
      .from('inventory_blockings')
      .select(`
        *,
        lead:leads(id, name, phone, email),
        inventory:inventory_items(id, unit_number, category, total_price),
        project:projects(id, name)
      `)
      .eq('id', blockingId)
      .maybeSingle()

    return { success: true, data: (fullBlocking || rows[0]) as unknown as InventoryBlocking }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, error: msg }
  }
}

export async function releaseBlocking(params: {
  blockingId: string
  orgId: string
  releasedBy?: string | null
  reason?: string | null
}): Promise<{ success: boolean; error?: string }> {
  const service = createServiceClient()
  const now = new Date().toISOString()

  try {
    // 1. Attempt atomic PostgreSQL RPC execution
    const { data: rpcData, error: rpcErr } = await service.rpc(
      'release_inventory_hold_atomic' as never,
      {
        p_org_id: params.orgId,
        p_blocking_id: params.blockingId,
        p_reason: params.reason || null,
        p_actor_id: params.releasedBy || null,
      } as never
    )

    if (rpcErr) {
      return { success: false, error: rpcErr.message }
    }

    if (!rpcData) {
      return { success: false, error: 'Release atomic RPC returned no data' }
    }

    return { success: true }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, error: msg }
  }
}

export async function getBlockings(
  orgId: string,
  filters?: { projectId?: string; inventoryId?: string; status?: string }
): Promise<InventoryBlocking[]> {
  const service = createServiceClient()
  let query = service
    .from('inventory_blockings')
    .select(`
      *,
      lead:leads(id, name, phone, email),
      inventory:inventory_items(id, unit_number, category, total_price),
      project:projects(id, name)
    `)
    .eq('org_id', orgId)

  if (filters?.projectId) query = query.eq('project_id', filters.projectId)
  if (filters?.inventoryId) query = query.eq('inventory_id', filters.inventoryId)
  if (filters?.status) query = query.eq('status', filters.status)

  const { data } = await query.order('created_at', { ascending: false })
  return (data || []) as unknown as InventoryBlocking[]
}

export async function getActiveUnitHold(
  inventoryId: string,
  orgId: string
): Promise<InventoryBlocking | null> {
  const service = createServiceClient()
  const { data } = await service
    .from('inventory_blockings')
    .select(`
      *,
      lead:leads(id, name, phone, email),
      project:projects(id, name)
    `)
    .eq('inventory_id', inventoryId)
    .eq('org_id', orgId)
    .eq('status', 'active')
    .maybeSingle()

  return (data as unknown as InventoryBlocking) || null
}

export async function getActiveUnitBooking(
  inventoryId: string,
  orgId: string
): Promise<Booking | null> {
  const service = createServiceClient()
  const { data } = await service
    .from('bookings')
    .select(`
      *,
      lead:leads(id, name, phone, email),
      project:projects(id, name)
    `)
    .eq('inventory_id', inventoryId)
    .eq('org_id', orgId)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return (data as unknown as Booking) || null
}

export async function releaseExpiredBlockings(orgId?: string): Promise<number> {
  const service = createServiceClient()

  // Atomic PostgreSQL sweep RPC execution ONLY - fail closed, no sequential fallback
  const { data: rpcData, error: rpcErr } = await service.rpc(
    'sweep_expired_holds_atomic' as never,
    { p_org_id: orgId || null } as never
  )

  if (rpcErr) {
    throw new Error(`Failed to sweep expired holds atomically: ${rpcErr.message}`)
  }

  if (!rpcData) return 0
  const rows = Array.isArray(rpcData) ? rpcData : [rpcData]
  return rows.length
}

// ---------------------------------------------------------------------------
// 4. Bookings & Sales Execution
// ---------------------------------------------------------------------------

export function generateBookingNumber(prefix = 'BK'): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const randomSuffix = Math.floor(1000 + Math.random() * 9000)
  return `${prefix}-${dateStr}-${randomSuffix}`
}

export async function createBooking(params: {
  orgId: string
  projectId: string
  inventoryId: string
  leadId: string
  blockingId?: string | null
  channelPartnerId?: string | null
  basePrice: number
  additionalCharges?: number
  bookingAmountReceived: number
  paymentPlan?: 'construction_linked' | 'time_linked' | 'down_payment' | 'custom'
  paymentStatus?: 'unverified' | 'partially_verified' | 'verified'
  remarks?: string | null
  actorProfileId?: string | null
  idempotencyKey?: string | null
}): Promise<{ success: boolean; data?: Booking; error?: string }> {
  const service = createServiceClient()

  try {
    // 1. Attempt atomic PostgreSQL RPC execution
    const { data: rpcData, error: rpcErr } = await service.rpc(
      'execute_booking_atomic' as never,
      {
        p_org_id: params.orgId,
        p_project_id: params.projectId,
        p_inventory_id: params.inventoryId,
        p_lead_id: params.leadId,
        p_blocking_id: params.blockingId || null,
        p_channel_partner_id: params.channelPartnerId || null,
        p_base_price: params.basePrice,
        p_additional_charges: params.additionalCharges || 0,
        p_booking_amount_received: params.bookingAmountReceived,
        p_payment_plan: params.paymentPlan || 'construction_linked',
        p_payment_status: params.paymentStatus || 'unverified',
        p_remarks: params.remarks || null,
        p_actor_id: params.actorProfileId || null,
        p_idempotency_key: params.idempotencyKey || null,
      } as never
    )

    if (rpcErr) {
      return { success: false, error: rpcErr.message }
    }

    if (!rpcData) {
      return { success: false, error: 'Booking atomic RPC returned no data' }
    }

    const rows = Array.isArray(rpcData) ? rpcData : [rpcData]
    if (rows.length === 0) {
      return { success: false, error: 'Booking atomic RPC returned empty record' }
    }

    const bookingId =
      (rows[0] as { booking_id?: string; id?: string }).booking_id ||
      (rows[0] as { id?: string }).id ||
      ''

    const { data: fullBooking } = await service
      .from('bookings')
      .select(`
        *,
        lead:leads(id, name, phone, email),
        inventory:inventory_items(id, unit_number, category, total_price),
        project:projects(id, name)
      `)
      .eq('id', bookingId)
      .maybeSingle()

    return { success: true, data: (fullBooking || rows[0]) as unknown as Booking }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, error: msg }
  }
}

export async function getBookings(
  orgId: string,
  filters?: { projectId?: string; inventoryId?: string; status?: string }
): Promise<Booking[]> {
  const service = createServiceClient()
  let query = service
    .from('bookings')
    .select(`
      *,
      lead:leads(id, name, phone, email),
      inventory:inventory_items(id, unit_number, category, total_price),
      project:projects(id, name)
    `)
    .eq('org_id', orgId)

  if (filters?.projectId) query = query.eq('project_id', filters.projectId)
  if (filters?.inventoryId) query = query.eq('inventory_id', filters.inventoryId)
  if (filters?.status) query = query.eq('status', filters.status)

  const { data } = await query.order('created_at', { ascending: false })
  return (data || []) as unknown as Booking[]
}

// ---------------------------------------------------------------------------
// 5. Channel Partner Commissions
// ---------------------------------------------------------------------------

export async function calculateCommission(params: {
  totalAmount: number
  superBuiltUpArea?: number
  commissionType: CommissionType
  rate: number
  tdsPercentage?: number
}): Promise<{ gross: number; tds: number; net: number }> {
  let gross = 0
  if (params.commissionType === 'percentage') {
    gross = (params.totalAmount * params.rate) / 100
  } else if (params.commissionType === 'fixed_per_sqft') {
    const area = params.superBuiltUpArea || 0
    gross = area * params.rate
  } else {
    gross = params.rate // lump_sum
  }

  const tdsRate = params.tdsPercentage ?? 5.0
  const tds = (gross * tdsRate) / 100
  const net = gross - tds
  return { gross, tds, net }
}

export async function getCommissions(
  orgId: string,
  filters?: { channelPartnerId?: string; bookingId?: string; status?: string }
): Promise<ChannelPartnerCommission[]> {
  const service = createServiceClient()
  let query = service.from('channel_partner_commissions').select('*').eq('org_id', orgId)

  if (filters?.channelPartnerId) query = query.eq('channel_partner_id', filters.channelPartnerId)
  if (filters?.bookingId) query = query.eq('booking_id', filters.bookingId)
  if (filters?.status) query = query.eq('status', filters.status)

  const { data } = await query.order('created_at', { ascending: false })
  return (data || []) as unknown as ChannelPartnerCommission[]
}

// ---------------------------------------------------------------------------
// 6. Sales Deals Pipeline
// ---------------------------------------------------------------------------

export async function createDeal(params: {
  orgId: string
  projectId: string
  leadId: string
  inventoryId?: string | null
  channelPartnerId?: string | null
  assignedTo?: string | null
  stage?: DealStage
  dealValue?: number | null
  probability?: number
  expectedCloseDate?: string | null
  notes?: string | null
}): Promise<{ success: boolean; data?: Deal; error?: string }> {
  const service = createServiceClient()

  try {
    const { data, error } = await service
      .from('deals')
      .insert({
        org_id: params.orgId,
        project_id: params.projectId,
        lead_id: params.leadId,
        inventory_id: params.inventoryId || null,
        channel_partner_id: params.channelPartnerId || null,
        assigned_to: params.assignedTo || null,
        stage: params.stage || 'enquiry',
        deal_value: params.dealValue ?? null,
        probability: params.probability ?? 20,
        expected_close_date: params.expectedCloseDate || null,
        notes: params.notes || null,
      })
      .select('*')
      .single()

    if (error) return { success: false, error: error.message }
    return { success: true, data: data as unknown as Deal }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, error: msg }
  }
}

export async function updateDealStage(
  id: string,
  orgId: string,
  stage: DealStage,
  extra?: { lossReason?: string; probability?: number; notes?: string }
): Promise<{ success: boolean; data?: Deal; error?: string }> {
  const service = createServiceClient()

  try {
    const { data, error } = await service
      .from('deals')
      .update({
        stage,
        ...(extra?.lossReason !== undefined && { loss_reason: extra.lossReason }),
        ...(extra?.probability !== undefined && { probability: extra.probability }),
        ...(extra?.notes !== undefined && { notes: extra.notes }),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('org_id', orgId)
      .select('*')
      .single()

    if (error) return { success: false, error: error.message }
    return { success: true, data: data as unknown as Deal }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, error: msg }
  }
}

export async function getDeals(
  orgId: string,
  filters?: { projectId?: string; stage?: DealStage }
): Promise<Deal[]> {
  const service = createServiceClient()
  let query = service
    .from('deals')
    .select(`
      *,
      lead:leads(id, name, phone),
      project:projects(id, name)
    `)
    .eq('org_id', orgId)

  if (filters?.projectId) query = query.eq('project_id', filters.projectId)
  if (filters?.stage) query = query.eq('stage', filters.stage)

  const { data } = await query.order('created_at', { ascending: false })
  return (data || []) as unknown as Deal[]
}
