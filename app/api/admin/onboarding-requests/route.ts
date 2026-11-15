// app/api/admin/onboarding-requests/route.ts
// Production X Platform Administration: Closed-SaaS Customer Onboarding Requests Engine
import { NextResponse, type NextRequest } from 'next/server'
import { authenticatePlatformAdmin, logPlatformAction } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/server'
import type { Database } from '@/types/database'
import { z } from 'zod'

type OnboardingRequestUpdate = Database['public']['Tables']['customer_onboarding_requests']['Update']

const CreateOnboardingRequestSchema = z.object({
  companyName: z.string().min(2, 'Company name required').max(100),
  companyType: z.enum(['developer', 'channel_partner']),
  adminEmail: z.string().email('Valid administrator email required'),
  adminName: z.string().min(2, 'Administrator name required'),
  adminPhone: z.string().optional(),
  commercialNotes: z.string().optional(),
  requestedPlanCode: z.string().min(1, 'Requested plan code required'),
  requestedSeats: z.number().int().min(1, 'At least 1 seat required'),
  requestedBillingCycle: z.enum(['monthly', 'annual', 'multi_year']).default('annual'),
})

const UpdateOnboardingRequestSchema = z.object({
  requestId: z.string().uuid('Valid request ID required'),
  // Sales Rep editable fields for draft
  companyName: z.string().min(2).max(100).optional(),
  adminEmail: z.string().email().optional(),
  adminName: z.string().min(2).optional(),
  adminPhone: z.string().optional(),
  commercialNotes: z.string().optional(),
  requestedPlanCode: z.string().optional(),
  requestedSeats: z.number().int().min(1).optional(),
  requestedBillingCycle: z.enum(['monthly', 'annual', 'multi_year']).optional(),
  // Transitions
  status: z.enum(['draft', 'pending_approval', 'approved', 'provisioned', 'rejected']).optional(),
  // Super Admin approval fields
  approvedPlanCode: z.string().optional(),
  approvedSeats: z.number().int().min(1).optional(),
  approvedBillingCycle: z.enum(['monthly', 'annual', 'multi_year']).optional(),
  rejectionReason: z.string().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const authResult = await authenticatePlatformAdmin(['super_admin', 'sales_rep', 'finance_admin'])
    if (!authResult.success) {
      return authResult.response
    }

    const { auth } = authResult
    const service = createServiceClient()

    let query = service
      .from('customer_onboarding_requests')
      .select('*')
      .order('created_at', { ascending: false })

    // Sales Reps can only query their own requests
    if (auth.platformUser.role === 'sales_rep') {
      query = query.eq('requested_by', auth.user.id)
    }

    const { data: requests, error } = await query

    if (error) {
      console.error('Error fetching onboarding requests:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ requests: requests || [] })
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: errorMsg }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    // Only Sales Reps and Super Admins can create onboarding requests
    const authResult = await authenticatePlatformAdmin(['sales_rep', 'super_admin'])
    if (!authResult.success) {
      return authResult.response
    }

    const { auth } = authResult
    const service = createServiceClient()

    const body = await request.json()
    const parsed = CreateOnboardingRequestSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid onboarding request', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const data = parsed.data
    const { data: record, error } = await service
      .from('customer_onboarding_requests')
      .insert({
        requested_by: auth.user.id,
        company_name: data.companyName.trim(),
        company_type: data.companyType,
        admin_email: data.adminEmail.trim().toLowerCase(),
        admin_name: data.adminName.trim(),
        admin_phone: data.adminPhone?.trim() || null,
        commercial_notes: data.commercialNotes?.trim() || null,
        requested_plan_code: data.requestedPlanCode,
        requested_seats: data.requestedSeats,
        requested_billing_cycle: data.requestedBillingCycle,
        status: 'draft',
      })
      .select()
      .single()

    if (error || !record) {
      console.error('Error creating onboarding request:', error)
      return NextResponse.json({ error: error?.message || 'Failed to create request' }, { status: 500 })
    }

    await logPlatformAction({
      actorUserId: auth.user.id,
      actorRole: auth.platformUser.role,
      action: 'onboarding_request.create',
      targetEntityType: 'onboarding_request',
      targetEntityId: record.id,
      metadata: {
        companyName: record.company_name,
        companyType: record.company_type,
        requestedPlanCode: record.requested_plan_code,
        requestedSeats: record.requested_seats,
      },
    })

    return NextResponse.json({ success: true, request: record }, { status: 201 })
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: errorMsg }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const authResult = await authenticatePlatformAdmin(['sales_rep', 'super_admin'])
    if (!authResult.success) {
      return authResult.response
    }

    const { auth } = authResult
    const service = createServiceClient()

    const body = await request.json()
    const parsed = UpdateOnboardingRequestSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid update payload', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { requestId, ...updates } = parsed.data

    // Fetch existing request
    const { data: existing, error: fetchErr } = await service
      .from('customer_onboarding_requests')
      .select('*')
      .eq('id', requestId)
      .maybeSingle()

    if (fetchErr || !existing) {
      return NextResponse.json({ error: 'Onboarding request not found' }, { status: 404 })
    }

    // Role-specific enforcement:
    if (auth.platformUser.role === 'sales_rep') {
      if (existing.requested_by !== auth.user.id) {
        return NextResponse.json(
          { error: 'Forbidden. You may only edit your own onboarding requests.' },
          { status: 403 }
        )
      }

      if (existing.status !== 'draft') {
        return NextResponse.json(
          { error: 'Forbidden. Submitted onboarding requests are locked and cannot be edited by sales representatives.' },
          { status: 403 }
        )
      }

      // Sales rep cannot mutate administrative or approval fields
      if (
        updates.approvedPlanCode !== undefined ||
        updates.approvedSeats !== undefined ||
        updates.approvedBillingCycle !== undefined ||
        updates.rejectionReason !== undefined
      ) {
        return NextResponse.json(
          { error: 'Forbidden. Sales representatives cannot set approved terms or rejection reasons.' },
          { status: 403 }
        )
      }

      // Sales rep can only transition draft -> pending_approval
      if (updates.status && !['draft', 'pending_approval'].includes(updates.status)) {
        return NextResponse.json(
          { error: 'Forbidden. Sales representatives can only transition status to pending_approval.' },
          { status: 403 }
        )
      }

      const updateData: OnboardingRequestUpdate = {
        updated_at: new Date().toISOString(),
      }
      if (updates.companyName) updateData.company_name = updates.companyName.trim()
      if (updates.adminEmail) updateData.admin_email = updates.adminEmail.trim().toLowerCase()
      if (updates.adminName) updateData.admin_name = updates.adminName.trim()
      if (updates.adminPhone !== undefined) updateData.admin_phone = updates.adminPhone?.trim() || null
      if (updates.commercialNotes !== undefined) updateData.commercial_notes = updates.commercialNotes?.trim() || null
      if (updates.requestedPlanCode) updateData.requested_plan_code = updates.requestedPlanCode
      if (updates.requestedSeats) updateData.requested_seats = updates.requestedSeats
      if (updates.requestedBillingCycle) updateData.requested_billing_cycle = updates.requestedBillingCycle
      if (updates.status) updateData.status = updates.status

      const { data: updated, error: updateErr } = await service
        .from('customer_onboarding_requests')
        .update(updateData)
        .eq('id', requestId)
        .select()
        .single()

      if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 500 })
      }

      return NextResponse.json({ success: true, request: updated })
    }

    // Super Admin operations (Approvals, Rejections, Provisions)
    if (auth.platformUser.role === 'super_admin') {
      const updateData: OnboardingRequestUpdate = {
        updated_at: new Date().toISOString(),
      }

      if (updates.status === 'approved') {
        updateData.status = 'approved'
        updateData.approved_plan_code = updates.approvedPlanCode || existing.requested_plan_code
        updateData.approved_seats = updates.approvedSeats || existing.requested_seats
        updateData.approved_billing_cycle = updates.approvedBillingCycle || existing.requested_billing_cycle
        updateData.reviewed_by = auth.user.id
        updateData.reviewed_at = new Date().toISOString()
      } else if (updates.status === 'rejected') {
        updateData.status = 'rejected'
        updateData.rejection_reason = updates.rejectionReason || 'Commercial terms rejected by platform administration'
        updateData.reviewed_by = auth.user.id
        updateData.reviewed_at = new Date().toISOString()
      } else if (updates.status) {
        updateData.status = updates.status
      }

      const { data: updated, error: updateErr } = await service
        .from('customer_onboarding_requests')
        .update(updateData)
        .eq('id', requestId)
        .select()
        .single()

      if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 500 })
      }

      await logPlatformAction({
        actorUserId: auth.user.id,
        actorRole: auth.platformUser.role,
        action: `onboarding_request.${updates.status || 'update'}`,
        targetEntityType: 'onboarding_request',
        targetEntityId: requestId,
        metadata: {
          previousStatus: existing.status,
          newStatus: updated.status,
          approvedSeats: updated.approved_seats,
        },
      })

      return NextResponse.json({ success: true, request: updated })
    }

    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: errorMsg }, { status: 500 })
  }
}
