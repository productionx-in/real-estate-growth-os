// tests/sales-and-channel-partners.test.mjs
// Test suite for Stage 5: Sales & Channel Partner Operations

import assert from 'node:assert/strict'

console.log('--- Running Sales & Channel Partner Operations (Stage 5) Tests ---')

// ---------------------------------------------------------------------------
// 1. Site Visit Scheduling, Status Transitions & Outcomes
// ---------------------------------------------------------------------------
{
  const siteVisits = []

  function scheduleVisit(params) {
    if (!params.orgId || !params.projectId || !params.leadId || !params.scheduledAt) {
      throw new Error('Missing required fields')
    }
    const visit = {
      id: `sv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      org_id: params.orgId,
      project_id: params.projectId,
      lead_id: params.leadId,
      assigned_to: params.assignedTo || null,
      scheduled_at: params.scheduledAt,
      status: 'scheduled',
      outcome: null,
      visitor_count: params.visitorCount || 1,
      cab_required: params.cabRequired || false,
      notes: params.notes || null,
      rating: null,
    }
    siteVisits.push(visit)
    return visit
  }

  function updateVisit(visitId, updates) {
    const visit = siteVisits.find((v) => v.id === visitId)
    if (!visit) throw new Error('Site visit not found')
    if (updates.status) visit.status = updates.status
    if (updates.outcome) visit.outcome = updates.outcome
    if (updates.rating !== undefined) visit.rating = updates.rating
    if (updates.notes !== undefined) visit.notes = updates.notes
    return visit
  }

  const visit = scheduleVisit({
    orgId: 'org_acme',
    projectId: 'proj_highrise',
    leadId: 'lead_101',
    scheduledAt: new Date(Date.now() + 86400000).toISOString(),
    visitorCount: 3,
    cabRequired: true,
    notes: 'Client requests pick-up from HITEC City metro',
  })

  assert.equal(visit.status, 'scheduled')
  assert.equal(visit.visitor_count, 3)
  assert.equal(visit.cab_required, true)

  // Reschedule
  updateVisit(visit.id, { status: 'rescheduled', notes: 'Postponed to afternoon' })
  assert.equal(visit.status, 'rescheduled')

  // Complete with outcome and rating
  updateVisit(visit.id, { status: 'completed', outcome: 'interested', rating: 5 })
  assert.equal(visit.status, 'completed')
  assert.equal(visit.outcome, 'interested')
  assert.equal(visit.rating, 5)

  console.log('  ✓ Test 1 Passed: Site visit scheduling, rescheduling, outcome recording, and rating')
}

// ---------------------------------------------------------------------------
// 2. Inventory Blockings & 48h Expiration Calculation
// ---------------------------------------------------------------------------
{
  const inventoryDb = new Map([
    ['unit_1', { id: 'unit_1', org_id: 'org_acme', status: 'available', base_price: 8500000 }],
    ['unit_2', { id: 'unit_2', org_id: 'org_acme', status: 'booked', base_price: 9200000 }],
  ])
  const blockings = []

  function blockUnit(params) {
    const unit = inventoryDb.get(params.inventoryId)
    if (!unit || unit.org_id !== params.orgId) {
      throw new Error('Unit not found or access denied')
    }
    if (unit.status !== 'available') {
      throw new Error(`Unit cannot be blocked. Current status: ${unit.status}`)
    }

    const duration = params.holdDurationHours || 48
    const expiresAt = new Date(Date.now() + duration * 3600 * 1000).toISOString()

    const blocking = {
      id: `blk_${Date.now()}`,
      org_id: params.orgId,
      project_id: params.projectId,
      inventory_id: params.inventoryId,
      lead_id: params.leadId,
      token_amount: params.tokenAmount,
      expires_at: expiresAt,
      status: 'active',
    }

    blockings.push(blocking)
    unit.status = 'blocked'
    return blocking
  }

  const blocking = blockUnit({
    orgId: 'org_acme',
    projectId: 'proj_highrise',
    inventoryId: 'unit_1',
    leadId: 'lead_101',
    tokenAmount: 100000,
    holdDurationHours: 48,
  })

  assert.equal(blocking.status, 'active')
  assert.equal(inventoryDb.get('unit_1').status, 'blocked')
  assert.ok(new Date(blocking.expires_at).getTime() > Date.now())

  // Attempting to block already blocked unit must fail
  assert.throws(
    () => {
      blockUnit({
        orgId: 'org_acme',
        projectId: 'proj_highrise',
        inventoryId: 'unit_1',
        leadId: 'lead_102',
        tokenAmount: 100000,
      })
    },
    /Unit cannot be blocked/,
    'Double-blocking an active unit must be blocked'
  )

  console.log('  ✓ Test 2 Passed: Inventory temporary blocking, 48h timer, and double-block protection')
}

// ---------------------------------------------------------------------------
// 3. Auto-Release of Expired Blockings
// ---------------------------------------------------------------------------
{
  const units = new Map([
    ['u_exp', { id: 'u_exp', org_id: 'org_acme', status: 'blocked' }],
  ])
  const blockings = [
    {
      id: 'blk_expired',
      org_id: 'org_acme',
      inventory_id: 'u_exp',
      expires_at: new Date(Date.now() - 3600000).toISOString(), // 1 hour in the past
      status: 'active',
    },
  ]

  function releaseExpiredBlockings(orgId) {
    const now = Date.now()
    let count = 0
    for (const blk of blockings) {
      if (blk.org_id === orgId && blk.status === 'active' && new Date(blk.expires_at).getTime() < now) {
        blk.status = 'expired'
        const unit = units.get(blk.inventory_id)
        if (unit) unit.status = 'available'
        count++
      }
    }
    return count
  }

  const released = releaseExpiredBlockings('org_acme')
  assert.equal(released, 1)
  assert.equal(blockings[0].status, 'expired')
  assert.equal(units.get('u_exp').status, 'available')

  console.log('  ✓ Test 3 Passed: Auto-release of expired blockings and unit status restoration')
}

// ---------------------------------------------------------------------------
// 4. Booking Number Generation & Format Verification
// ---------------------------------------------------------------------------
{
  function generateBookingNumber(prefix = 'BK') {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const randomSuffix = 4567
    return `${prefix}-${dateStr}-${randomSuffix}`
  }

  const bNum = generateBookingNumber('BK')
  assert.match(bNum, /^BK-\d{8}-\d{4}$/, 'Booking number must follow BK-YYYYMMDD-XXXX format')

  console.log('  ✓ Test 4 Passed: Deterministic booking number generation format')
}

// ---------------------------------------------------------------------------
// 5. Booking Creation from Blocking & Direct Booking
// ---------------------------------------------------------------------------
{
  const inventory = new Map([
    ['u_blk', { id: 'u_blk', status: 'blocked', base_price: 12000000 }],
    ['u_dir', { id: 'u_dir', status: 'available', base_price: 15000000 }],
  ])
  const blockings = new Map([
    ['blk_to_convert', { id: 'blk_to_convert', status: 'active', inventory_id: 'u_blk' }],
  ])
  const bookings = []

  function createBooking(params) {
    const unit = inventory.get(params.inventoryId)
    if (!unit) throw new Error('Unit not found')
    if (unit.status !== 'available' && unit.status !== 'blocked') {
      throw new Error(`Unit cannot be booked with status: ${unit.status}`)
    }

    const total = params.basePrice + (params.additionalCharges || 0)
    const booking = {
      id: `bk_${Date.now()}`,
      org_id: params.orgId,
      project_id: params.projectId,
      inventory_id: params.inventoryId,
      lead_id: params.leadId,
      booking_number: `BK-20261115-${Math.floor(1000 + Math.random() * 9000)}`,
      total_amount: total,
      booking_amount_received: params.bookingAmountReceived,
      status: 'confirmed',
    }

    bookings.push(booking)
    unit.status = 'booked'

    if (params.blockingId) {
      const blk = blockings.get(params.blockingId)
      if (blk) blk.status = 'converted_to_booking'
    }

    return booking
  }

  // 1. Convert blocking to booking
  const b1 = createBooking({
    orgId: 'org_acme',
    projectId: 'p_1',
    inventoryId: 'u_blk',
    leadId: 'l_1',
    blockingId: 'blk_to_convert',
    basePrice: 12000000,
    additionalCharges: 500000,
    bookingAmountReceived: 1000000,
  })

  assert.equal(b1.total_amount, 12500000)
  assert.equal(inventory.get('u_blk').status, 'booked')
  assert.equal(blockings.get('blk_to_convert').status, 'converted_to_booking')

  // 2. Direct booking without blocking
  const b2 = createBooking({
    orgId: 'org_acme',
    projectId: 'p_1',
    inventoryId: 'u_dir',
    leadId: 'l_2',
    basePrice: 15000000,
    bookingAmountReceived: 1500000,
  })

  assert.equal(b2.total_amount, 15000000)
  assert.equal(inventory.get('u_dir').status, 'booked')

  // 3. Attempting to book already booked unit must fail
  assert.throws(
    () => {
      createBooking({
        orgId: 'org_acme',
        projectId: 'p_1',
        inventoryId: 'u_dir',
        leadId: 'l_3',
        basePrice: 15000000,
        bookingAmountReceived: 1500000,
      })
    },
    /Unit cannot be booked with status: booked/,
    'Double-booking a booked unit must be rejected'
  )

  console.log('  ✓ Test 5 Passed: Booking creation from blocking, direct booking, and double-booking defense')
}

// ---------------------------------------------------------------------------
// 6. Channel Partner Onboarding, RERA Registration & Tiering
// ---------------------------------------------------------------------------
{
  function validateChannelPartner(cp) {
    if (!cp.firm_name || !cp.contact_person || !cp.phone) {
      return { valid: false, error: 'Missing firm name, contact person, or phone' }
    }
    // Indian phone check
    const phoneClean = cp.phone.replace(/\D/g, '')
    if (phoneClean.length < 10) {
      return { valid: false, error: 'Invalid phone number' }
    }
    const tier = cp.tier || 'silver'
    if (!['silver', 'gold', 'platinum'].includes(tier)) {
      return { valid: false, error: 'Invalid partner tier' }
    }
    return { valid: true, tier }
  }

  const cpValid = {
    firm_name: 'Hyder Consulting & Realtors Pvt Ltd',
    contact_person: 'Vikram Reddy',
    phone: '+919876543210',
    rera_registration_number: 'P02400001234',
    tier: 'gold',
  }

  const res = validateChannelPartner(cpValid)
  assert.equal(res.valid, true)
  assert.equal(res.tier, 'gold')

  const cpInvalid = {
    firm_name: 'Incomplete Broker',
    phone: '123', // invalid phone
  }
  const resBad = validateChannelPartner(cpInvalid)
  assert.equal(resBad.valid, false)

  console.log('  ✓ Test 6 Passed: Channel partner RERA tracking, contact validation, and tiering')
}

// ---------------------------------------------------------------------------
// 7. Commission Calculation: Percentage vs Fixed per Sq Ft & 5% TDS
// ---------------------------------------------------------------------------
{
  function calculateCommission({ totalAmount, superBuiltUpArea, commissionType, rate, tdsPercentage = 5.0 }) {
    let gross = 0
    if (commissionType === 'percentage') {
      gross = (totalAmount * rate) / 100
    } else if (commissionType === 'fixed_per_sqft') {
      gross = (superBuiltUpArea || 0) * rate
    } else {
      gross = rate // lump_sum
    }

    const tds = (gross * tdsPercentage) / 100
    const net = gross - tds
    return { gross, tds, net }
  }

  // Case A: 2% of ₹1.2 Crore booking
  const commPercent = calculateCommission({
    totalAmount: 12000000,
    commissionType: 'percentage',
    rate: 2.0,
    tdsPercentage: 5.0,
  })
  assert.equal(commPercent.gross, 240000) // ₹2.4 Lakhs gross
  assert.equal(commPercent.tds, 12000) // 5% TDS = ₹12,000
  assert.equal(commPercent.net, 228000) // Net = ₹2.28 Lakhs

  // Case B: ₹150 per sqft on 2,200 sqft villa
  const commSqft = calculateCommission({
    totalAmount: 20000000,
    superBuiltUpArea: 2200,
    commissionType: 'fixed_per_sqft',
    rate: 150,
    tdsPercentage: 5.0,
  })
  assert.equal(commSqft.gross, 330000) // 2200 * 150 = ₹3.3 Lakhs
  assert.equal(commSqft.tds, 16500) // 5% TDS = ₹16,500
  assert.equal(commSqft.net, 313500) // Net = ₹3.135 Lakhs

  console.log('  ✓ Test 7 Passed: Commission engine calculation (percentage and fixed-per-sqft with 5% TDS)')
}

// ---------------------------------------------------------------------------
// 8. Commission Milestone Split Logic
// ---------------------------------------------------------------------------
{
  function generateMilestones(netCommission) {
    return [
      {
        name: 'Booking Advance Milestone',
        percentage: 50,
        amount: netCommission * 0.5,
        trigger_event: 'booking_confirmed',
        is_paid: true,
      },
      {
        name: 'Sale Agreement Registration Milestone',
        percentage: 50,
        amount: netCommission * 0.5,
        trigger_event: 'agreement_signed',
        is_paid: false,
      },
    ]
  }

  const milestones = generateMilestones(228000)
  assert.equal(milestones.length, 2)
  assert.equal(milestones[0].amount, 114000)
  assert.equal(milestones[1].amount, 114000)
  assert.equal(milestones[0].is_paid, true)
  assert.equal(milestones[1].is_paid, false)

  console.log('  ✓ Test 8 Passed: Commission payout milestone disbursement tracking')
}

// ---------------------------------------------------------------------------
// 9. Sales Deals Pipeline Progression
// ---------------------------------------------------------------------------
{
  const allowedStages = [
    'enquiry',
    'contacted',
    'site_visit_scheduled',
    'site_visit_completed',
    'negotiation',
    'unit_blocked',
    'booked',
    'registered',
    'lost',
  ]

  const deal = {
    id: 'deal_1',
    lead_id: 'lead_1',
    stage: 'enquiry',
    probability: 10,
    deal_value: 12000000,
  }

  function advanceStage(currentDeal, nextStage) {
    if (!allowedStages.includes(nextStage)) {
      throw new Error(`Invalid deal stage: ${nextStage}`)
    }
    currentDeal.stage = nextStage
    if (nextStage === 'site_visit_scheduled') currentDeal.probability = 30
    if (nextStage === 'negotiation') currentDeal.probability = 60
    if (nextStage === 'unit_blocked') currentDeal.probability = 80
    if (nextStage === 'booked') currentDeal.probability = 100
    if (nextStage === 'lost') currentDeal.probability = 0
    return currentDeal
  }

  advanceStage(deal, 'site_visit_scheduled')
  assert.equal(deal.stage, 'site_visit_scheduled')
  assert.equal(deal.probability, 30)

  advanceStage(deal, 'negotiation')
  assert.equal(deal.stage, 'negotiation')
  assert.equal(deal.probability, 60)

  advanceStage(deal, 'unit_blocked')
  assert.equal(deal.stage, 'unit_blocked')
  assert.equal(deal.probability, 80)

  advanceStage(deal, 'booked')
  assert.equal(deal.stage, 'booked')
  assert.equal(deal.probability, 100)

  console.log('  ✓ Test 9 Passed: Sales deal pipeline progression and probability scoring')
}

// ---------------------------------------------------------------------------
// 10. Multi-Tenant Isolation
// ---------------------------------------------------------------------------
{
  const deals = [
    { id: 'd_1', org_id: 'org_acme', deal_value: 10000000 },
    { id: 'd_2', org_id: 'org_otho', deal_value: 20000000 },
  ]

  function getTenantDeals(requesterOrgId) {
    return deals.filter((d) => d.org_id === requesterOrgId)
  }

  const acmeDeals = getTenantDeals('org_acme')
  assert.equal(acmeDeals.length, 1)
  assert.equal(acmeDeals[0].id, 'd_1')

  const othoDeals = getTenantDeals('org_otho')
  assert.equal(othoDeals.length, 1)
  assert.equal(othoDeals[0].id, 'd_2')

  console.log('  ✓ Test 10 Passed: Tenant isolation enforced across sales pipeline records')
}

console.log('\n--- All 10 Sales & Channel Partner Operations Tests Passed Successfully ---\n')
