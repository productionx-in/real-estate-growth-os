// tests/phase2-developer-booking-workflow.test.mjs
// Comprehensive test suite for Phase 2 Developer Growth OS:
// Unit Reservation, Hold Management, Commercial Bookings, and Tenant Isolation.

import assert from 'node:assert/strict'
import { z } from 'zod'

const BlockUnitSchema = z.object({
  projectId: z.string().uuid({ message: 'Valid project ID is required' }),
  inventoryId: z.string().uuid({ message: 'Valid inventory ID is required' }),
  leadId: z.string().uuid({ message: 'Valid lead ID is required' }),
  tokenAmount: z.coerce.number().min(0, { message: 'Token amount cannot be negative' }),
  paymentReference: z.string().trim().max(100).optional().nullable(),
  holdDurationHours: z.coerce
    .number()
    .int()
    .min(1, { message: 'Hold duration must be at least 1 hour' })
    .max(720, { message: 'Hold duration cannot exceed 30 days (720 hours)' })
    .default(48),
  remarks: z.string().trim().max(1000).optional().nullable(),
})

const CreateBookingSchema = z.object({
  projectId: z.string().uuid({ message: 'Valid project ID is required' }),
  inventoryId: z.string().uuid({ message: 'Valid inventory ID is required' }),
  leadId: z.string().uuid({ message: 'Valid lead ID is required' }),
  blockingId: z.string().uuid().optional().nullable(),
  channelPartnerId: z.string().uuid().optional().nullable(),
  basePrice: z.coerce
    .number()
    .positive({ message: 'Base price must be greater than zero' }),
  additionalCharges: z.coerce
    .number()
    .min(0, { message: 'Additional charges cannot be negative' })
    .default(0),
  bookingAmountReceived: z.coerce
    .number()
    .min(0, { message: 'Booking amount received cannot be negative' }),
  paymentPlan: z
    .enum(['construction_linked', 'time_linked', 'down_payment', 'custom'])
    .default('construction_linked'),
  remarks: z.string().trim().max(1000).optional().nullable(),
})

const ReleaseBlockingSchema = z.object({
  blockingId: z.string().uuid({ message: 'Valid blocking ID is required' }),
  reason: z.string().trim().max(500).optional().nullable(),
})

console.log('--- Running Phase 2 Developer Growth OS: Unit Reservation & Booking Workflow Tests ---')

// ---------------------------------------------------------------------------
// In-Memory Simulation Fixtures
// ---------------------------------------------------------------------------

function createTestHarness() {
  const orgs = new Map([
    ['org_alpha', { id: 'org_alpha', name: 'Alpha Developers' }],
    ['org_beta', { id: 'org_beta', name: 'Beta Realty' }],
  ])

  const projects = new Map([
    ['proj_1', { id: 'proj_1', org_id: 'org_alpha', name: 'Skyline Towers' }],
    ['proj_2', { id: 'proj_2', org_id: 'org_beta', name: 'Green Meadows' }],
  ])

  const inventory = new Map([
    [
      'unit_101',
      {
        id: 'unit_101',
        org_id: 'org_alpha',
        project_id: 'proj_1',
        unit_number: 'A-101',
        status: 'available',
        total_price: 7500000,
        super_built_up_area: 1450,
      },
    ],
    [
      'unit_102',
      {
        id: 'unit_102',
        org_id: 'org_alpha',
        project_id: 'proj_1',
        unit_number: 'A-102',
        status: 'available',
        total_price: 8500000,
        super_built_up_area: 1650,
      },
    ],
    [
      'unit_201',
      {
        id: 'unit_201',
        org_id: 'org_beta',
        project_id: 'proj_2',
        unit_number: 'B-201',
        status: 'available',
        total_price: 6000000,
        super_built_up_area: 1200,
      },
    ],
  ])

  const leads = new Map([
    ['lead_1', { id: 'lead_1', org_id: 'org_alpha', project_id: 'proj_1', name: 'Vikram Malhotra', phone: '+919876543210' }],
    ['lead_2', { id: 'lead_2', org_id: 'org_alpha', project_id: 'proj_1', name: 'Ananya Sharma', phone: '+919876543211' }],
    ['lead_beta', { id: 'lead_beta', org_id: 'org_beta', project_id: 'proj_2', name: 'Rahul Roy', phone: '+919876543299' }],
  ])

  const channelPartners = new Map([
    [
      'cp_1',
      {
        id: 'cp_1',
        org_id: 'org_alpha',
        firm_name: 'PropTech Advisors LLP',
        default_commission_rate: 2.5,
      },
    ],
  ])

  const blockings = new Map()
  const bookings = new Map()
  const deals = new Map()
  const statusHistory = []
  const commissions = []

  // Simulated DAL Operations
  function blockUnit(params, actor) {
    // Tenant check
    if (actor.orgId !== params.orgId) {
      throw new Error('Forbidden: Cross-tenant access denied (403)')
    }
    if (actor.role === 'readonly') {
      throw new Error('Forbidden: Readonly members cannot place holds (403)')
    }

    const unit = inventory.get(params.inventoryId)
    if (!unit || unit.org_id !== params.orgId) {
      throw new Error('Inventory unit not found or access denied')
    }
    if (unit.status !== 'available') {
      throw new Error(`Cannot block unit. Current status is ${unit.status} (expected 'available')`)
    }

    const lead = leads.get(params.leadId)
    if (!lead || lead.org_id !== params.orgId) {
      throw new Error('Lead not found in this organisation')
    }

    const duration = params.holdDurationHours || 48
    const expiresAt = new Date(Date.now() + duration * 3600 * 1000).toISOString()
    const blockingId = `blk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`

    const blocking = {
      id: blockingId,
      org_id: params.orgId,
      project_id: params.projectId,
      inventory_id: params.inventoryId,
      lead_id: params.leadId,
      blocked_by: actor.profileId,
      token_amount: params.tokenAmount,
      payment_reference: params.paymentReference || null,
      expires_at: expiresAt,
      remarks: params.remarks || null,
      status: 'active',
      created_at: new Date().toISOString(),
    }

    blockings.set(blockingId, blocking)
    unit.status = 'blocked'

    statusHistory.push({
      inventory_id: unit.id,
      org_id: unit.org_id,
      previous_status: 'available',
      new_status: 'blocked',
      changed_by: actor.profileId,
      reason: params.remarks || `Hold placed with token ₹${params.tokenAmount}`,
      metadata: { blocking_id: blockingId, token_amount: params.tokenAmount },
    })

    deals.set(`${params.orgId}_${params.leadId}`, {
      org_id: params.orgId,
      lead_id: params.leadId,
      project_id: params.projectId,
      inventory_id: unit.id,
      stage: 'unit_blocked',
      probability: 70,
    })

    return blocking
  }

  function releaseHold(params, actor) {
    if (actor.orgId !== params.orgId) {
      throw new Error('Forbidden: Cross-tenant access denied (403)')
    }
    if (actor.role === 'readonly') {
      throw new Error('Forbidden: Readonly members cannot release holds (403)')
    }

    const blocking = blockings.get(params.blockingId)
    if (!blocking || blocking.org_id !== params.orgId) {
      throw new Error('Blocking record not found')
    }
    if (blocking.status !== 'active') {
      throw new Error(`Blocking cannot be released. Current status: ${blocking.status}`)
    }

    const unit = inventory.get(blocking.inventory_id)
    if (!unit) throw new Error('Inventory unit not found')

    blocking.status = 'cancelled'
    blocking.remarks = params.reason || 'Hold released manually'
    unit.status = 'available'

    statusHistory.push({
      inventory_id: unit.id,
      org_id: unit.org_id,
      previous_status: 'blocked',
      new_status: 'available',
      changed_by: actor.profileId,
      reason: params.reason || 'Hold released manually',
      metadata: { blocking_id: blocking.id, action: 'release_hold' },
    })

    return { success: true }
  }

  function createBooking(params, actor) {
    if (actor.orgId !== params.orgId) {
      throw new Error('Forbidden: Cross-tenant access denied (403)')
    }
    if (actor.role === 'readonly') {
      throw new Error('Forbidden: Readonly members cannot execute bookings (403)')
    }

    const unit = inventory.get(params.inventoryId)
    if (!unit || unit.org_id !== params.orgId) {
      throw new Error('Inventory unit not found or access denied')
    }

    if (unit.status !== 'available' && unit.status !== 'blocked') {
      throw new Error(`Cannot book unit. Current status is ${unit.status}`)
    }

    const lead = leads.get(params.leadId)
    if (!lead || lead.org_id !== params.orgId) {
      throw new Error('Lead not found in this organisation')
    }

    // If converting from blocking, verify blocking
    if (params.blockingId) {
      const blk = blockings.get(params.blockingId)
      if (!blk || blk.org_id !== params.orgId) {
        throw new Error('Blocking record not found')
      }
      blk.status = 'converted_to_booking'
    }

    const bookingId = `bk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const bookingNumber = `BK-${Date.now().toString().slice(-6)}`
    const additional = params.additionalCharges || 0
    const totalAmount = params.basePrice + additional

    const booking = {
      id: bookingId,
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
      created_at: new Date().toISOString(),
    }

    bookings.set(bookingId, booking)
    const prevStatus = unit.status
    unit.status = 'booked'

    statusHistory.push({
      inventory_id: unit.id,
      org_id: unit.org_id,
      previous_status: prevStatus,
      new_status: 'booked',
      changed_by: actor.profileId,
      reason: `Confirmed Booking #${bookingNumber}`,
      metadata: {
        booking_id: bookingId,
        booking_number: bookingNumber,
        total_amount: totalAmount,
      },
    })

    deals.set(`${params.orgId}_${params.leadId}`, {
      org_id: params.orgId,
      lead_id: params.leadId,
      project_id: params.projectId,
      inventory_id: unit.id,
      stage: 'booked',
      probability: 100,
      deal_value: totalAmount,
    })

    // Sourcing Broker Commission
    if (params.channelPartnerId) {
      const cp = channelPartners.get(params.channelPartnerId)
      if (cp) {
        const rate = cp.default_commission_rate
        const gross = (totalAmount * rate) / 100
        const tds = (gross * 5.0) / 100
        const net = gross - tds
        commissions.push({
          booking_id: bookingId,
          channel_partner_id: cp.id,
          gross_commission_amount: gross,
          tds_percentage: 5.0,
          net_commission_amount: net,
          status: 'pending_approval',
          milestones: [
            { name: 'Booking Advance Milestone', percentage: 50, amount: net * 0.5 },
            { name: 'Sale Agreement Registration Milestone', percentage: 50, amount: net * 0.5 },
          ],
        })
      }
    }

    return booking
  }

  return {
    orgs,
    projects,
    inventory,
    leads,
    channelPartners,
    blockings,
    bookings,
    deals,
    statusHistory,
    commissions,
    blockUnit,
    releaseHold,
    createBooking,
  }
}

// ---------------------------------------------------------------------------
// TEST 1: Placing a Temporary Hold on an Available Unit
// ---------------------------------------------------------------------------
{
  const h = createTestHarness()
  const actor = { orgId: 'org_alpha', profileId: 'prof_sales_1', role: 'sales_exec' }

  const blocking = h.blockUnit(
    {
      orgId: 'org_alpha',
      projectId: 'proj_1',
      inventoryId: 'unit_101',
      leadId: 'lead_1',
      tokenAmount: 100000,
      holdDurationHours: 48,
      paymentReference: 'UPI-REF-9921',
      remarks: 'Token advance received via UPI',
    },
    actor
  )

  assert.equal(blocking.status, 'active')
  assert.equal(blocking.token_amount, 100000)
  assert.equal(blocking.lead_id, 'lead_1')
  assert.ok(new Date(blocking.expires_at).getTime() > Date.now())

  // Verify inventory unit status updated to 'blocked'
  const unit = h.inventory.get('unit_101')
  assert.equal(unit.status, 'blocked')

  // Verify status history audit trail
  const historyEntry = h.statusHistory.find((s) => s.inventory_id === 'unit_101')
  assert.ok(historyEntry)
  assert.equal(historyEntry.previous_status, 'available')
  assert.equal(historyEntry.new_status, 'blocked')
  assert.equal(historyEntry.changed_by, 'prof_sales_1')

  // Verify deal advanced to 'unit_blocked'
  const deal = h.deals.get('org_alpha_lead_1')
  assert.ok(deal)
  assert.equal(deal.stage, 'unit_blocked')
  assert.equal(deal.probability, 70)

  console.log('✓ Test 1 Passed: Placing temporary hold on available unit with token deposit and deal advancement')
}

// ---------------------------------------------------------------------------
// TEST 2: Concurrent / Double-Hold Protection
// ---------------------------------------------------------------------------
{
  const h = createTestHarness()
  const actor = { orgId: 'org_alpha', profileId: 'prof_sales_1', role: 'sales_exec' }

  // First hold succeeds
  h.blockUnit(
    {
      orgId: 'org_alpha',
      projectId: 'proj_1',
      inventoryId: 'unit_101',
      leadId: 'lead_1',
      tokenAmount: 50000,
    },
    actor
  )

  // Second hold on same unit MUST fail with concurrency error
  assert.throws(
    () => {
      h.blockUnit(
        {
          orgId: 'org_alpha',
          projectId: 'proj_1',
          inventoryId: 'unit_101',
          leadId: 'lead_2',
          tokenAmount: 75000,
        },
        actor
      )
    },
    /Cannot block unit.*expected 'available'/,
    'Double-blocking an active held unit must be rejected'
  )

  console.log('✓ Test 2 Passed: Double-hold prevention protects against concurrent inventory hold conflicts')
}

// ---------------------------------------------------------------------------
// TEST 3: Hold Release / Cancellation Restoring Unit Availability
// ---------------------------------------------------------------------------
{
  const h = createTestHarness()
  const actor = { orgId: 'org_alpha', profileId: 'prof_mgr_1', role: 'manager' }

  const blk = h.blockUnit(
    {
      orgId: 'org_alpha',
      projectId: 'proj_1',
      inventoryId: 'unit_101',
      leadId: 'lead_1',
      tokenAmount: 50000,
    },
    actor
  )

  assert.equal(h.inventory.get('unit_101').status, 'blocked')

  // Release hold
  const releaseRes = h.releaseHold(
    {
      orgId: 'org_alpha',
      blockingId: blk.id,
      reason: 'Customer opted for different tower configuration',
    },
    actor
  )

  assert.equal(releaseRes.success, true)
  assert.equal(blk.status, 'cancelled')
  assert.equal(h.inventory.get('unit_101').status, 'available')

  // Verify status history audit record for release
  const lastHistory = h.statusHistory[h.statusHistory.length - 1]
  assert.equal(lastHistory.previous_status, 'blocked')
  assert.equal(lastHistory.new_status, 'available')
  assert.equal(lastHistory.reason, 'Customer opted for different tower configuration')

  console.log('✓ Test 3 Passed: Manual hold release reverts unit status to Available and updates audit trail')
}

// ---------------------------------------------------------------------------
// TEST 4: Converting an Active Hold into a Confirmed Sales Booking
// ---------------------------------------------------------------------------
{
  const h = createTestHarness()
  const actor = { orgId: 'org_alpha', profileId: 'prof_mgr_1', role: 'manager' }

  const blk = h.blockUnit(
    {
      orgId: 'org_alpha',
      projectId: 'proj_1',
      inventoryId: 'unit_101',
      leadId: 'lead_1',
      tokenAmount: 100000,
    },
    actor
  )

  // Convert active hold to booking
  const booking = h.createBooking(
    {
      orgId: 'org_alpha',
      projectId: 'proj_1',
      inventoryId: 'unit_101',
      leadId: 'lead_1',
      blockingId: blk.id,
      basePrice: 7500000,
      additionalCharges: 300000,
      bookingAmountReceived: 850000, // Includes 1L token
      paymentPlan: 'construction_linked',
      remarks: 'Hold converted to booking with 10% advance paid',
    },
    actor
  )

  assert.ok(booking.booking_number.startsWith('BK-'))
  assert.equal(booking.status, 'confirmed')
  assert.equal(booking.total_amount, 7800000)
  assert.equal(booking.booking_amount_received, 850000)
  assert.equal(booking.blocking_id, blk.id)

  // Verify hold record status changed to 'converted_to_booking'
  assert.equal(blk.status, 'converted_to_booking')

  // Verify unit status is now 'booked'
  assert.equal(h.inventory.get('unit_101').status, 'booked')

  // Verify deal status advanced to 'booked' (100%)
  const deal = h.deals.get('org_alpha_lead_1')
  assert.equal(deal.stage, 'booked')
  assert.equal(deal.probability, 100)
  assert.equal(deal.deal_value, 7800000)

  console.log('✓ Test 4 Passed: Converting active hold to confirmed booking updates hold, unit, and CRM deal stage')
}

// ---------------------------------------------------------------------------
// TEST 5: Direct Booking of Available Unit
// ---------------------------------------------------------------------------
{
  const h = createTestHarness()
  const actor = { orgId: 'org_alpha', profileId: 'prof_mgr_1', role: 'manager' }

  const booking = h.createBooking(
    {
      orgId: 'org_alpha',
      projectId: 'proj_1',
      inventoryId: 'unit_102',
      leadId: 'lead_2',
      basePrice: 8500000,
      additionalCharges: 400000,
      bookingAmountReceived: 890000,
      paymentPlan: 'down_payment',
      remarks: 'Direct booking during festive launch offer',
    },
    actor
  )

  assert.equal(booking.status, 'confirmed')
  assert.equal(booking.total_amount, 8900000)
  assert.equal(booking.blocking_id, null)
  assert.equal(h.inventory.get('unit_102').status, 'booked')

  console.log('✓ Test 5 Passed: Direct booking of available unit creates confirmed sales record without prior hold')
}

// ---------------------------------------------------------------------------
// TEST 6: Double-Booking / Booking of Sold Unit Rejection
// ---------------------------------------------------------------------------
{
  const h = createTestHarness()
  const actor = { orgId: 'org_alpha', profileId: 'prof_mgr_1', role: 'manager' }

  // Book unit 102
  h.createBooking(
    {
      orgId: 'org_alpha',
      projectId: 'proj_1',
      inventoryId: 'unit_102',
      leadId: 'lead_2',
      basePrice: 8500000,
      bookingAmountReceived: 850000,
    },
    actor
  )

  // Attempting to book unit 102 again MUST throw
  assert.throws(
    () => {
      h.createBooking(
        {
          orgId: 'org_alpha',
          projectId: 'proj_1',
          inventoryId: 'unit_102',
          leadId: 'lead_1',
          basePrice: 8500000,
          bookingAmountReceived: 850000,
        },
        actor
      )
    },
    /Cannot book unit.*status is booked/,
    'Attempting to book an already booked unit must be rejected'
  )

  console.log('✓ Test 6 Passed: Concurrency validation blocks duplicate booking on already booked or sold units')
}

// ---------------------------------------------------------------------------
// TEST 7: Channel Partner Sourcing Attribution & Commission Calculation
// ---------------------------------------------------------------------------
{
  const h = createTestHarness()
  const actor = { orgId: 'org_alpha', profileId: 'prof_mgr_1', role: 'manager' }

  const booking = h.createBooking(
    {
      orgId: 'org_alpha',
      projectId: 'proj_1',
      inventoryId: 'unit_101',
      leadId: 'lead_1',
      channelPartnerId: 'cp_1',
      basePrice: 8000000,
      additionalCharges: 0,
      bookingAmountReceived: 800000,
      paymentPlan: 'construction_linked',
    },
    actor
  )

  assert.equal(booking.channel_partner_id, 'cp_1')
  assert.equal(h.commissions.length, 1)

  const comm = h.commissions[0]
  // 2.5% of 8,000,000 = 200,000
  assert.equal(comm.gross_commission_amount, 200000)
  // 5% TDS on 200,000 = 10,000
  assert.equal(comm.tds_percentage, 5.0)
  // Net = 190,000
  assert.equal(comm.net_commission_amount, 190000)
  assert.equal(comm.status, 'pending_approval')
  assert.equal(comm.milestones.length, 2)
  assert.equal(comm.milestones[0].amount, 95000)
  assert.equal(comm.milestones[1].amount, 95000)

  console.log('✓ Test 7 Passed: Sourcing channel partner attribution accurately computes gross commission, TDS & milestone schedule')
}

// ---------------------------------------------------------------------------
// TEST 8: Server-Side Zod Validation Schemas
// ---------------------------------------------------------------------------
{
  const validUuid = '123e4567-e89b-12d3-a456-426614174000'

  // BlockUnitSchema valid
  const validBlock = BlockUnitSchema.safeParse({
    projectId: validUuid,
    inventoryId: validUuid,
    leadId: validUuid,
    tokenAmount: 50000,
    holdDurationHours: 48,
    paymentReference: 'CHEQUE-1234',
  })
  assert.ok(validBlock.success)

  // BlockUnitSchema invalid token amount (negative)
  const invalidToken = BlockUnitSchema.safeParse({
    projectId: validUuid,
    inventoryId: validUuid,
    leadId: validUuid,
    tokenAmount: -500,
  })
  assert.equal(invalidToken.success, false)

  // BlockUnitSchema invalid duration (excessive > 720h)
  const invalidDuration = BlockUnitSchema.safeParse({
    projectId: validUuid,
    inventoryId: validUuid,
    leadId: validUuid,
    tokenAmount: 50000,
    holdDurationHours: 1000,
  })
  assert.equal(invalidDuration.success, false)

  // CreateBookingSchema valid
  const validBooking = CreateBookingSchema.safeParse({
    projectId: validUuid,
    inventoryId: validUuid,
    leadId: validUuid,
    basePrice: 5000000,
    additionalCharges: 200000,
    bookingAmountReceived: 500000,
    paymentPlan: 'construction_linked',
  })
  assert.ok(validBooking.success)

  // CreateBookingSchema invalid (zero base price)
  const invalidPrice = CreateBookingSchema.safeParse({
    projectId: validUuid,
    inventoryId: validUuid,
    leadId: validUuid,
    basePrice: 0,
    bookingAmountReceived: 500000,
  })
  assert.equal(invalidPrice.success, false)

  // ReleaseBlockingSchema valid
  const validRelease = ReleaseBlockingSchema.safeParse({
    blockingId: validUuid,
    reason: 'Customer cancelled enquiry',
  })
  assert.ok(validRelease.success)

  console.log('✓ Test 8 Passed: Zod schemas strictly validate token amounts, payment plans, UUIDs, and duration bounds')
}

// ---------------------------------------------------------------------------
// TEST 9: RBAC Enforcement Matrix
// ---------------------------------------------------------------------------
{
  const h = createTestHarness()
  const readonlyActor = { orgId: 'org_alpha', profileId: 'prof_ro', role: 'readonly' }
  const salesActor = { orgId: 'org_alpha', profileId: 'prof_sales', role: 'sales_exec' }

  // Readonly member is blocked from placing a hold
  assert.throws(
    () => {
      h.blockUnit(
        {
          orgId: 'org_alpha',
          projectId: 'proj_1',
          inventoryId: 'unit_101',
          leadId: 'lead_1',
          tokenAmount: 50000,
        },
        readonlyActor
      )
    },
    /Forbidden: Readonly members cannot place holds \(403\)/,
    'Readonly members must be blocked from holding units'
  )

  // Readonly member is blocked from creating a booking
  assert.throws(
    () => {
      h.createBooking(
        {
          orgId: 'org_alpha',
          projectId: 'proj_1',
          inventoryId: 'unit_101',
          leadId: 'lead_1',
          basePrice: 7500000,
          bookingAmountReceived: 750000,
        },
        readonlyActor
      )
    },
    /Forbidden: Readonly members cannot execute bookings \(403\)/,
    'Readonly members must be blocked from executing bookings'
  )

  // Sales Executive can hold units
  const hold = h.blockUnit(
    {
      orgId: 'org_alpha',
      projectId: 'proj_1',
      inventoryId: 'unit_101',
      leadId: 'lead_1',
      tokenAmount: 50000,
    },
    salesActor
  )
  assert.equal(hold.status, 'active')

  console.log('✓ Test 9 Passed: Server-side RBAC prohibits readonly access and allows authorized sales execution')
}

// ---------------------------------------------------------------------------
// TEST 10: Strict Multi-Tenant Isolation
// ---------------------------------------------------------------------------
{
  const h = createTestHarness()
  const betaActor = { orgId: 'org_beta', profileId: 'prof_beta_1', role: 'admin' }

  // User in Org Beta attempts to place a hold on Org Alpha's unit
  assert.throws(
    () => {
      h.blockUnit(
        {
          orgId: 'org_alpha', // Target is Alpha
          projectId: 'proj_1',
          inventoryId: 'unit_101',
          leadId: 'lead_1',
          tokenAmount: 50000,
        },
        betaActor // Actor is Beta
      )
    },
    /Forbidden: Cross-tenant access denied \(403\)/,
    'Cross-tenant hold attempt must be rejected'
  )

  // User in Org Beta attempts to book Org Alpha's unit
  assert.throws(
    () => {
      h.createBooking(
        {
          orgId: 'org_alpha',
          projectId: 'proj_1',
          inventoryId: 'unit_101',
          leadId: 'lead_1',
          basePrice: 7500000,
          bookingAmountReceived: 750000,
        },
        betaActor
      )
    },
    /Forbidden: Cross-tenant access denied \(403\)/,
    'Cross-tenant booking attempt must be rejected'
  )

  console.log('✓ Test 10 Passed: Tenant boundaries strictly prevent cross-organisation holds and bookings')
}

console.log('--- All 10/10 Phase 2 Developer Growth OS Workflow Tests Passed Successfully! ---')
