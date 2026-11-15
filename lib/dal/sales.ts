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
  holdDurationHours?: number // default 48h
  remarks?: string | null
}): Promise<{ success: boolean; data?: InventoryBlocking; error?: string }> {
  const service = createServiceClient()

  try {
    // 1. Verify unit availability
    const { data: unit, error: unitErr } = await service
      .from('inventory_items')
      .select('id, status, org_id, unit_number')
      .eq('id', params.inventoryId)
      .eq('org_id', params.orgId)
      .single()

    if (unitErr || !unit) {
      return { success: false, error: 'Inventory unit not found or access denied' }
    }

    if (unit.status !== 'available') {
      return {
        success: false,
        error: `Cannot block unit. Current status is ${unit.status} (expected 'available')`,
      }
    }

    const duration = params.holdDurationHours || 48
    const expiresAt = new Date(Date.now() + duration * 3600 * 1000).toISOString()

    // 2. Insert blocking record
    const { data: blocking, error: blockErr } = await service
      .from('inventory_blockings')
      .insert({
        org_id: params.orgId,
        project_id: params.projectId,
        inventory_id: params.inventoryId,
        lead_id: params.leadId,
        blocked_by: params.blockedBy || null,
        token_amount: params.tokenAmount,
        payment_reference: params.paymentReference || null,
        expires_at: expiresAt,
        remarks: params.remarks || null,
        status: 'active',
      })
      .select(`
        *,
        lead:leads(id, name, phone, email),
        inventory:inventory_items(id, unit_number, category, total_price),
        project:projects(id, name)
      `)
      .single()

    if (blockErr) return { success: false, error: blockErr.message }

    // 3. Transition unit status to 'blocked'
    await service
      .from('inventory_items')
      .update({ status: 'blocked', updated_at: new Date().toISOString() })
      .eq('id', params.inventoryId)
      .eq('org_id', params.orgId)

    // Resolve actor profile id for audit tracking
    let actorId = params.blockedBy
    if (!actorId) {
      const { data: member } = await service
        .from('org_members')
        .select('profile_id')
        .eq('org_id', params.orgId)
        .limit(1)
        .maybeSingle()
      actorId = member?.profile_id || params.leadId
    }

    // 4. Record audit history in inventory_status_history
    await service.from('inventory_status_history').insert({
      inventory_id: params.inventoryId,
      org_id: params.orgId,
      previous_status: 'available',
      new_status: 'blocked',
      changed_by: actorId,
      reason: params.remarks ? `Hold placed: ${params.remarks}` : `Hold placed with token ₹${params.tokenAmount}`,
      metadata: {
        blocking_id: blocking.id,
        lead_id: params.leadId,
        token_amount: params.tokenAmount,
        payment_reference: params.paymentReference,
        expires_at: expiresAt,
      },
    })

    // 5. Advance or create deal for this lead
    const { data: existingDeal } = await service
      .from('deals')
      .select('id')
      .eq('org_id', params.orgId)
      .eq('lead_id', params.leadId)
      .eq('project_id', params.projectId)
      .maybeSingle()

    if (existingDeal) {
      await service
        .from('deals')
        .update({
          inventory_id: params.inventoryId,
          stage: 'unit_blocked',
          probability: 70,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingDeal.id)
    } else {
      await service.from('deals').insert({
        org_id: params.orgId,
        project_id: params.projectId,
        lead_id: params.leadId,
        inventory_id: params.inventoryId,
        stage: 'unit_blocked',
        probability: 70,
        notes: `Unit ${unit.unit_number} blocked with token of ₹${params.tokenAmount}`,
      })
    }

    return { success: true, data: blocking as unknown as InventoryBlocking }
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
    const { data: blocking, error: fetchErr } = await service
      .from('inventory_blockings')
      .select('id, inventory_id, status, lead_id, project_id')
      .eq('id', params.blockingId)
      .eq('org_id', params.orgId)
      .single()

    if (fetchErr || !blocking) {
      return { success: false, error: 'Blocking record not found' }
    }

    if (blocking.status !== 'active') {
      return { success: false, error: `Blocking cannot be released. Current status is ${blocking.status}` }
    }

    // Mark blocking as cancelled
    const { error: updateErr } = await service
      .from('inventory_blockings')
      .update({
        status: 'cancelled',
        remarks: params.reason ? `Released: ${params.reason}` : 'Hold released manually',
        updated_at: now,
      })
      .eq('id', blocking.id)

    if (updateErr) return { success: false, error: updateErr.message }

    // Revert inventory item back to available
    await service
      .from('inventory_items')
      .update({ status: 'available', updated_at: now })
      .eq('id', blocking.inventory_id)
      .eq('org_id', params.orgId)

    // Resolve actor profile id for audit tracking
    let actorId = params.releasedBy
    if (!actorId) {
      const { data: member } = await service
        .from('org_members')
        .select('profile_id')
        .eq('org_id', params.orgId)
        .limit(1)
        .maybeSingle()
      actorId = member?.profile_id || blocking.lead_id
    }

    // Append audit history
    await service.from('inventory_status_history').insert({
      inventory_id: blocking.inventory_id,
      org_id: params.orgId,
      previous_status: 'blocked',
      new_status: 'available',
      changed_by: actorId,
      reason: params.reason ? `Hold released: ${params.reason}` : 'Hold released manually',
      metadata: { blocking_id: blocking.id, action: 'release_hold' },
    })

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

export async function releaseExpiredBlockings(orgId: string): Promise<number> {
  const service = createServiceClient()
  const now = new Date().toISOString()

  try {
    // Find active blockings past expiry
    const { data: expired } = await service
      .from('inventory_blockings')
      .select('id, inventory_id')
      .eq('org_id', orgId)
      .eq('status', 'active')
      .lt('expires_at', now)

    if (!expired || expired.length === 0) return 0

    let releasedCount = 0
    for (const item of expired) {
      // Mark blocking as expired
      await service
        .from('inventory_blockings')
        .update({ status: 'expired', updated_at: now })
        .eq('id', item.id)

      // Revert unit back to available
      await service
        .from('inventory_items')
        .update({ status: 'available', updated_at: now })
        .eq('id', item.inventory_id)
        .eq('org_id', orgId)

      // Resolve actor for auto-expire audit
      const { data: member } = await service
        .from('org_members')
        .select('profile_id')
        .eq('org_id', orgId)
        .limit(1)
        .maybeSingle()
      const systemActorId = member?.profile_id || item.id

      // Record audit history
      await service.from('inventory_status_history').insert({
        inventory_id: item.inventory_id,
        org_id: orgId,
        previous_status: 'blocked',
        new_status: 'available',
        changed_by: systemActorId,
        reason: 'Hold expired automatically (48h hold duration elapsed)',
        metadata: { blocking_id: item.id, action: 'auto_expire' },
      })

      releasedCount++
    }

    return releasedCount
  } catch {
    return 0
  }
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
  remarks?: string | null
  actorProfileId?: string | null
}): Promise<{ success: boolean; data?: Booking; error?: string }> {
  const service = createServiceClient()

  try {
    // 1. Verify unit status
    const { data: unit, error: unitErr } = await service
      .from('inventory_items')
      .select('id, status, super_built_up_area, unit_number')
      .eq('id', params.inventoryId)
      .eq('org_id', params.orgId)
      .single()

    if (unitErr || !unit) {
      return { success: false, error: 'Inventory unit not found or access denied' }
    }

    // Unit must be either 'available' or 'blocked' (if converting from a blocking)
    if (unit.status !== 'available' && unit.status !== 'blocked') {
      return {
        success: false,
        error: `Cannot book unit. Current unit status is ${unit.status}`,
      }
    }

    const bookingNumber = generateBookingNumber()
    const additional = params.additionalCharges || 0
    const totalAmount = params.basePrice + additional

    // 2. Insert Booking
    const { data: booking, error: bookErr } = await service
      .from('bookings')
      .insert({
        org_id: params.orgId,
        project_id: params.projectId,
        inventory_id: params.inventoryId,
        lead_id: params.leadId,
        blocking_id: params.blockingId || null,
        channel_partner_id: params.channelPartnerId || null,
        booking_number: bookingNumber,
        status: 'confirmed',
        base_price: params.basePrice,
        additional_charges: additional,
        total_amount: totalAmount,
        booking_amount_received: params.bookingAmountReceived,
        payment_plan: params.paymentPlan || 'construction_linked',
        remarks: params.remarks || null,
      })
      .select(`
        *,
        lead:leads(id, name, phone, email),
        inventory:inventory_items(id, unit_number, category, total_price),
        project:projects(id, name)
      `)
      .single()

    if (bookErr) return { success: false, error: bookErr.message }

    // 3. Mark unit status as 'booked'
    await service
      .from('inventory_items')
      .update({ status: 'booked', updated_at: new Date().toISOString() })
      .eq('id', params.inventoryId)
      .eq('org_id', params.orgId)

    // Resolve actor profile id for audit tracking
    let actorId = params.actorProfileId
    if (!actorId) {
      const { data: member } = await service
        .from('org_members')
        .select('profile_id')
        .eq('org_id', params.orgId)
        .limit(1)
        .maybeSingle()
      actorId = member?.profile_id || params.leadId
    }

    // 4. Record audit history in inventory_status_history
    await service.from('inventory_status_history').insert({
      inventory_id: params.inventoryId,
      org_id: params.orgId,
      previous_status: unit.status,
      new_status: 'booked',
      changed_by: actorId,
      reason: params.remarks ? `Confirmed Booking: ${params.remarks}` : `Confirmed Booking #${bookingNumber}`,
      metadata: {
        booking_id: booking.id,
        booking_number: bookingNumber,
        lead_id: params.leadId,
        total_amount: totalAmount,
        booking_amount_received: params.bookingAmountReceived,
        payment_plan: params.paymentPlan || 'construction_linked',
        blocking_id: params.blockingId || null,
      },
    })

    // 5. If converted from blocking, update blocking status
    if (params.blockingId) {
      await service
        .from('inventory_blockings')
        .update({ status: 'converted_to_booking', updated_at: new Date().toISOString() })
        .eq('id', params.blockingId)
    }

    // 6. Advance or create deal for this lead in stage 'booked' (100% probability)
    const { data: existingDeal } = await service
      .from('deals')
      .select('id')
      .eq('org_id', params.orgId)
      .eq('lead_id', params.leadId)
      .eq('project_id', params.projectId)
      .maybeSingle()

    if (existingDeal) {
      await service
        .from('deals')
        .update({
          inventory_id: params.inventoryId,
          stage: 'booked',
          probability: 100,
          deal_value: totalAmount,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingDeal.id)
    } else {
      await service.from('deals').insert({
        org_id: params.orgId,
        project_id: params.projectId,
        lead_id: params.leadId,
        inventory_id: params.inventoryId,
        stage: 'booked',
        probability: 100,
        deal_value: totalAmount,
        notes: `Unit ${unit.unit_number} booked under #${bookingNumber}`,
      })
    }

    // 7. If channel partner attached, generate commission record
    if (params.channelPartnerId) {
      const { data: cp } = await service
        .from('channel_partners')
        .select('default_commission_rate')
        .eq('id', params.channelPartnerId)
        .single()

      const rate = cp?.default_commission_rate || 2.0 // default 2%
      const gross = (totalAmount * rate) / 100
      const tds = (gross * 5.0) / 100 // 5% TDS
      const net = gross - tds

      await service.from('channel_partner_commissions').insert({
        org_id: params.orgId,
        booking_id: booking.id,
        channel_partner_id: params.channelPartnerId,
        commission_type: 'percentage',
        commission_rate: rate,
        gross_commission_amount: gross,
        tds_percentage: 5.0,
        net_commission_amount: net,
        status: 'pending_approval',
        milestones: [
          {
            name: 'Booking Advance Milestone',
            percentage: 50,
            amount: net * 0.5,
            trigger_event: 'booking_confirmed',
            is_paid: false,
          },
          {
            name: 'Sale Agreement Registration Milestone',
            percentage: 50,
            amount: net * 0.5,
            trigger_event: 'agreement_signed',
            is_paid: false,
          },
        ] as unknown as import('@/types/database').Json,
      })
    }

    return { success: true, data: booking as unknown as Booking }
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
