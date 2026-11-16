// lib/dal/buyers.ts
// Data Access Layer for Buyer 360, Customer Portfolio, Payment Schedules & KYC
// Strictly tenant-isolated via org_id.

import { createServiceClient } from '@/lib/supabase/server'
import type {
  BuyerProfile,
  Buyer360Data,
  BuyerPortfolioItem,
  BookingPaymentMilestone,
  BookingPayment,
  BuyerDocument,
  CoBuyer,
  PaymentMethod,
  DocumentType,
} from '@/lib/buyers/types'

// ---------------------------------------------------------------------------
// 1. List Buyers with Portfolio Summary
// ---------------------------------------------------------------------------

export async function listBuyers(
  orgId: string,
  options: {
    search?: string
    status?: string
    limit?: number
    offset?: number
  } = {}
): Promise<{
  success: boolean
  buyers: Array<BuyerProfile & { totalBookings: number; totalConsideration: number; totalPaid: number }>
  totalCount: number
  error?: string
}> {
  const service = createServiceClient()
  const limit = options.limit || 50
  const offset = options.offset || 0

  try {
    let query = service
      .from('buyer_profiles')
      .select('*', { count: 'exact' })
      .eq('org_id', orgId)

    if (options.status) {
      query = query.eq('status', options.status as 'active' | 'inactive' | 'archived')
    }

    if (options.search) {
      const term = `%${options.search}%`
      query = query.or(`full_name.ilike.${term},phone.ilike.${term},pan_number.ilike.${term},email.ilike.${term}`)
    }

    const { data: buyers, count, error } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      return { success: false, buyers: [], totalCount: 0, error: error.message }
    }

    // Fetch booking summaries for these buyers
    const buyerIds = (buyers || []).map((b) => b.id)
    let bookingsMap: Record<string, { count: number; consideration: number; paid: number }> = {}

    if (buyerIds.length > 0) {
      const { data: bookings } = await service
        .from('bookings')
        .select('id, buyer_id, total_amount, booking_amount_received, status')
        .eq('org_id', orgId)
        .in('buyer_id', buyerIds)

      for (const b of bookings || []) {
        if (!b.buyer_id) continue
        if (!bookingsMap[b.buyer_id]) {
          bookingsMap[b.buyer_id] = { count: 0, consideration: 0, paid: 0 }
        }
        bookingsMap[b.buyer_id].count += 1
        bookingsMap[b.buyer_id].consideration += Number(b.total_amount || 0)
        bookingsMap[b.buyer_id].paid += Number(b.booking_amount_received || 0)
      }
    }

    const result = (buyers || []).map((b) => ({
      ...b,
      co_buyers: (b.co_buyers as unknown as CoBuyer[]) || [],
      totalBookings: bookingsMap[b.id]?.count || 0,
      totalConsideration: bookingsMap[b.id]?.consideration || 0,
      totalPaid: bookingsMap[b.id]?.paid || 0,
    }))

    return {
      success: true,
      buyers: result,
      totalCount: count || 0,
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, buyers: [], totalCount: 0, error: msg }
  }
}

// ---------------------------------------------------------------------------
// 2. Buyer 360 Full Profile & History
// ---------------------------------------------------------------------------

export async function getBuyer360(
  buyerId: string,
  orgId: string
): Promise<{ success: boolean; data?: Buyer360Data; error?: string }> {
  const service = createServiceClient()

  try {
    // 1. Fetch Buyer Profile
    const { data: buyer, error: buyerErr } = await (service.from('buyer_profiles') as any)
      .select('*, primary_lead:leads!buyer_profiles_primary_lead_id_fkey(id, name, phone, email, source)')
      .eq('id', buyerId)
      .eq('org_id', orgId)
      .maybeSingle()

    if (buyerErr || !buyer) {
      return { success: false, error: buyerErr ? buyerErr.message : 'Buyer profile not found' }
    }

    // 2. Fetch Customer Portfolio (Bookings with Project & Unit)
    const { data: bookingsData } = await (service.from('bookings') as any)
      .select(`
        id, booking_number, booking_date, status, payment_plan,
        base_price, additional_charges, total_amount, booking_amount_received,
        project:projects(id, name, code, slug),
        inventory:inventory_items(id, unit_number, category, status),
        channel_partner:channel_partners(id, firm_name, contact_person)
      `)
      .eq('org_id', orgId)
      .eq('buyer_id', buyerId)
      .order('booking_date', { ascending: false })

    const portfolio: BuyerPortfolioItem[] = (bookingsData || []).map((b: any) => {
      const totalAmount = Number(b.total_amount || 0)
      const paid = Number(b.booking_amount_received || 0)
      const outstanding = Math.max(0, totalAmount - paid)
      const progress = totalAmount > 0 ? Math.min(100, Math.round((paid / totalAmount) * 100)) : 0

      return {
        booking_id: b.id,
        booking_number: b.booking_number,
        booking_date: b.booking_date,
        status: b.status,
        payment_plan: b.payment_plan,
        agreed_total_amount: totalAmount,
        base_price: Number(b.base_price || 0),
        additional_charges: Number(b.additional_charges || 0),
        amount_received_verified: paid,
        outstanding_balance: outstanding,
        payment_progress_percent: progress,
        project: b.project || { id: '', name: 'Unknown Project', code: null, slug: '' },
        unit: b.inventory || { id: '', unit_number: 'Unassigned', category: 'apartments', status: 'available' },
        channel_partner: b.channel_partner,
      }
    })

    const bookingIds = portfolio.map((p) => p.booking_id)

    // Summary calculations
    const portfolioSummary = {
      totalBookingsCount: portfolio.length,
      activeBookingsCount: portfolio.filter((p) => p.status !== 'cancelled').length,
      totalConsideration: portfolio.reduce((acc, p) => acc + (p.status !== 'cancelled' ? p.agreed_total_amount : 0), 0),
      totalPaidVerified: portfolio.reduce((acc, p) => acc + p.amount_received_verified, 0),
      totalOutstanding: portfolio.reduce((acc, p) => acc + (p.status !== 'cancelled' ? p.outstanding_balance : 0), 0),
    }

    // 3. Fetch Milestones for all bookings
    let milestones: BookingPaymentMilestone[] = []
    if (bookingIds.length > 0) {
      const { data: milestonesData } = await service
        .from('booking_payment_milestones')
        .select('*')
        .eq('org_id', orgId)
        .in('booking_id', bookingIds)
        .order('milestone_sequence', { ascending: true })

      milestones = (milestonesData || []).map((m: any) => ({
        ...m,
        amount_due: Number(m.amount_due),
        amount_paid: Number(m.amount_paid),
        payment_records: (m.payment_records as any[]) || [],
      }))
    }

    // 4. Fetch Payments across all bookings
    let payments: BookingPayment[] = []
    if (bookingIds.length > 0) {
      const { data: paymentsData } = await service
        .from('booking_payments')
        .select('*, verifier:profiles!booking_payments_verified_by_fkey(id, full_name), milestone:booking_payment_milestones(id, milestone_name)')
        .eq('org_id', orgId)
        .in('booking_id', bookingIds)
        .order('payment_date', { ascending: false })

      payments = (paymentsData || []).map((p: any) => ({
        ...p,
        amount: Number(p.amount),
        verifier: p.verifier,
        milestone: p.milestone,
      }))
    }

    // 5. Fetch Buyer KYC and Transaction Documents
    const { data: documentsData } = await (service.from('buyer_documents') as any)
      .select('*, verifier:profiles!buyer_documents_verified_by_fkey(id, full_name), creator:profiles!buyer_documents_created_by_fkey(id, full_name)')
      .eq('org_id', orgId)
      .eq('buyer_id', buyerId)
      .order('created_at', { ascending: false })

    const documents: BuyerDocument[] = (documentsData || []).map((d: any) => ({
      ...d,
      file_size_bytes: d.file_size_bytes ? Number(d.file_size_bytes) : null,
      verifier: d.verifier,
      creator: d.creator,
    }))

    // 6. Fetch Linked Enquiries and Leads
    const { data: leadsData } = await (service.from('leads') as any)
      .select('id, name, phone, email, status, source, created_at, project:projects(id, name), deal:deals(id, stage, value)')
      .eq('org_id', orgId)
      .eq('buyer_id', buyerId)
      .order('created_at', { ascending: false })

    const leads = (leadsData || []).map((l: any) => ({
      id: l.id,
      name: l.name,
      phone: l.phone,
      email: l.email,
      status: l.status,
      source: l.source,
      created_at: l.created_at,
      project: l.project,
      deal: l.deal && l.deal[0] ? { id: l.deal[0].id, stage: l.deal[0].stage, value: Number(l.deal[0].value || 0) } : null,
    }))

    // 7. Fetch Audit Logs & Activity Timeline
    const { data: auditLogs } = await (service.from('buyer_audit_logs') as any)
      .select('*, actor:profiles!buyer_audit_logs_actor_id_fkey(id, full_name)')
      .eq('org_id', orgId)
      .eq('buyer_id', buyerId)
      .order('created_at', { ascending: false })

    // Merge timeline items
    const timeline: Buyer360Data['timeline'] = []

    for (const log of auditLogs || []) {
      timeline.push({
        id: log.id,
        type: 'audit',
        title: formatAuditAction(log.action),
        description: formatAuditDetails(log.action, log.details),
        timestamp: log.created_at,
        actor_name: log.actor?.full_name || 'System / Staff',
        metadata: log.details as Record<string, unknown>,
      })
    }

    for (const p of payments) {
      timeline.push({
        id: `pay-${p.id}`,
        type: 'payment',
        title: `Payment ${p.status === 'verified' ? 'Verified' : 'Recorded'}: ₹${p.amount.toLocaleString('en-IN')}`,
        description: `Receipt: ${p.receipt_number} · Ref: ${p.reference_number} · Method: ${p.payment_method.replace(/_/g, ' ').toUpperCase()}`,
        timestamp: p.created_at,
        actor_name: p.verifier?.full_name,
      })
    }

    for (const d of documents) {
      timeline.push({
        id: `doc-${d.id}`,
        type: 'document',
        title: `Document Uploaded: ${d.title}`,
        description: `Type: ${d.document_type.replace(/_/g, ' ').toUpperCase()} · Status: ${d.status.toUpperCase()}`,
        timestamp: d.created_at,
        actor_name: d.creator?.full_name,
      })
    }

    timeline.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    return {
      success: true,
      data: {
        buyer: {
          ...buyer,
          co_buyers: (buyer.co_buyers as unknown as CoBuyer[]) || [],
          primary_lead: buyer.primary_lead,
        },
        portfolio,
        portfolioSummary,
        milestones,
        payments,
        documents,
        leads,
        timeline,
      },
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, error: msg }
  }
}

// ---------------------------------------------------------------------------
// 3. Upsert Buyer Profile (Atomic RPC)
// ---------------------------------------------------------------------------

export async function upsertBuyerProfile(params: {
  orgId: string
  fullName: string
  phone: string
  email?: string | null
  panNumber?: string | null
  aadhaarNumberMasked?: string | null
  addressLine1?: string | null
  addressLine2?: string | null
  city?: string | null
  state?: string | null
  pincode?: string | null
  country?: string
  coBuyers?: CoBuyer[]
  notes?: string | null
  leadId?: string | null
  actorId?: string | null
}): Promise<{ success: boolean; data?: BuyerProfile; error?: string }> {
  const service = createServiceClient()

  try {
    const { data, error } = await service.rpc('upsert_buyer_profile_atomic' as never, {
      p_org_id: params.orgId,
      p_full_name: params.fullName,
      p_phone: params.phone,
      p_email: params.email || null,
      p_pan_number: params.panNumber || null,
      p_aadhaar_number_masked: params.aadhaarNumberMasked || null,
      p_address_line1: params.addressLine1 || null,
      p_address_line2: params.addressLine2 || null,
      p_city: params.city || null,
      p_state: params.state || null,
      p_pincode: params.pincode || null,
      p_co_buyers: params.coBuyers || [],
      p_notes: params.notes || null,
      p_lead_id: params.leadId || null,
      p_actor_id: params.actorId || null,
    } as never) as { data: any; error: any }

    if (error) {
      return { success: false, error: error.message }
    }

    return {
      success: true,
      data: {
        ...data,
        co_buyers: (data.co_buyers as CoBuyer[]) || [],
      },
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, error: msg }
  }
}

// ---------------------------------------------------------------------------
// 4. Record Booking Payment (Atomic RPC)
// ---------------------------------------------------------------------------

export async function recordBookingPayment(params: {
  orgId: string
  bookingId: string
  milestoneId?: string | null
  amount: number
  paymentMethod: PaymentMethod
  referenceNumber: string
  actorId: string
  paymentDate?: string
  notes?: string | null
}): Promise<{ success: boolean; data?: BookingPayment; error?: string }> {
  const service = createServiceClient()

  try {
    const { data, error } = await service.rpc('record_booking_payment_atomic' as never, {
      p_org_id: params.orgId,
      p_booking_id: params.bookingId,
      p_milestone_id: params.milestoneId || null,
      p_amount: params.amount,
      p_payment_method: params.paymentMethod,
      p_reference_number: params.referenceNumber,
      p_actor_id: params.actorId,
      p_payment_date: params.paymentDate || new Date().toISOString().split('T')[0],
      p_notes: params.notes || null,
    } as never) as { data: any; error: any }

    if (error) {
      return { success: false, error: error.message }
    }

    return {
      success: true,
      data: {
        ...data,
        amount: Number(data.amount),
      },
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, error: msg }
  }
}

// ---------------------------------------------------------------------------
// 5. Verify Booking Payment (Atomic RPC)
// ---------------------------------------------------------------------------

export async function verifyBookingPayment(params: {
  orgId: string
  paymentId: string
  actorId: string
}): Promise<{ success: boolean; data?: BookingPayment; error?: string }> {
  const service = createServiceClient()

  try {
    const { data, error } = await service.rpc('verify_booking_payment_atomic' as never, {
      p_org_id: params.orgId,
      p_payment_id: params.paymentId,
      p_actor_id: params.actorId,
    } as never) as { data: any; error: any }

    if (error) {
      return { success: false, error: error.message }
    }

    return {
      success: true,
      data: {
        ...data,
        amount: Number(data.amount),
      },
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, error: msg }
  }
}

// ---------------------------------------------------------------------------
// 6. Generate Milestone Schedule (Atomic RPC)
// ---------------------------------------------------------------------------

export async function generateBookingMilestones(params: {
  orgId: string
  bookingId: string
  milestones: Array<{
    milestone_name: string
    due_date: string
    amount_due: number
  }>
  actorId: string
}): Promise<{ success: boolean; data?: any; error?: string }> {
  const service = createServiceClient()

  try {
    const { data, error } = await service.rpc('generate_booking_milestone_schedule_atomic' as never, {
      p_org_id: params.orgId,
      p_booking_id: params.bookingId,
      p_milestones: params.milestones,
      p_actor_id: params.actorId,
    } as never) as { data: any; error: any }

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true, data }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, error: msg }
  }
}

// ---------------------------------------------------------------------------
// 7. Upload & Verify Buyer Documents
// ---------------------------------------------------------------------------

export async function uploadBuyerDocument(params: {
  orgId: string
  buyerId: string
  bookingId?: string | null
  documentType: DocumentType
  title: string
  fileKey: string
  fileName: string
  fileSizeBytes?: number | null
  mimeType: string
  actorId: string
}): Promise<{ success: boolean; data?: BuyerDocument; error?: string }> {
  const service = createServiceClient()

  try {
    // Validate buyer belongs to org
    const { data: buyer } = await service
      .from('buyer_profiles')
      .select('id')
      .eq('id', params.buyerId)
      .eq('org_id', params.orgId)
      .maybeSingle()

    if (!buyer) {
      return { success: false, error: 'Buyer profile not found in organisation' }
    }

    const { data, error } = await service
      .from('buyer_documents')
      .insert({
        org_id: params.orgId,
        buyer_id: params.buyerId,
        booking_id: params.bookingId || null,
        document_type: params.documentType,
        title: params.title,
        file_key: params.fileKey,
        file_name: params.fileName,
        file_size_bytes: params.fileSizeBytes || null,
        mime_type: params.mimeType,
        status: 'pending',
        created_by: params.actorId,
      })
      .select('*')
      .single()

    if (error) {
      return { success: false, error: error.message }
    }

    // Write audit log
    await (service.from('buyer_audit_logs' as any) as any).insert({
      org_id: params.orgId,
      buyer_id: params.buyerId,
      actor_id: params.actorId,
      action: 'document_uploaded',
      details: {
        document_id: (data as any)?.id,
        document_type: params.documentType,
        title: params.title,
        file_name: params.fileName,
      },
    })

    return { success: true, data: data as unknown as BuyerDocument }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, error: msg }
  }
}

export async function verifyBuyerDocument(params: {
  orgId: string
  documentId: string
  status: 'verified' | 'rejected'
  notes?: string | null
  actorId: string
}): Promise<{ success: boolean; data?: BuyerDocument; error?: string }> {
  const service = createServiceClient()

  try {
    const { data, error } = await service.rpc('verify_buyer_document_atomic' as never, {
      p_org_id: params.orgId,
      p_document_id: params.documentId,
      p_actor_id: params.actorId,
      p_status: params.status,
      p_notes: params.notes || null,
    } as never) as { data: any; error: any }

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true, data }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, error: msg }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatAuditAction(action: string): string {
  switch (action) {
    case 'buyer_created':
      return 'Buyer Profile Created'
    case 'buyer_updated':
      return 'Buyer Profile Details Updated'
    case 'payment_recorded':
      return 'Payment Recorded (Unverified)'
    case 'payment_verified':
      return 'Payment Approved & Credited'
    case 'milestones_generated':
      return 'Payment Milestone Schedule Configured'
    case 'document_uploaded':
      return 'KYC / Transaction Document Uploaded'
    case 'document_verified':
      return 'Document Verified & Approved'
    case 'document_rejected':
      return 'Document Rejected'
    default:
      return action.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  }
}

function formatAuditDetails(action: string, details: any): string {
  if (!details || typeof details !== 'object') return ''
  if (action === 'payment_recorded' || action === 'payment_verified') {
    return `Receipt: ${details.receipt_number || 'N/A'} · Amount: ₹${Number(details.amount || 0).toLocaleString('en-IN')}`
  }
  if (action === 'document_uploaded' || action === 'document_verified' || action === 'document_rejected') {
    return `Document: ${details.title || details.document_type || 'N/A'}${details.notes ? ` · Note: ${details.notes}` : ''}`
  }
  if (action === 'milestones_generated') {
    return `Configured ${details.count || 0} milestone(s) for booking total ₹${Number(details.total_amount || 0).toLocaleString('en-IN')}`
  }
  return JSON.stringify(details)
}
