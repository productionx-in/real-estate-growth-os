// tests/phase2-booking-concurrency-and-integrity.test.mjs
// Comprehensive test suite for Phase 2 Developer Growth OS:
// Booking & Reservation Concurrency, Atomic State Transitions, Sweeper Safety,
// Idempotency, Commercial Arithmetic, Broker Commission TDS, and Multi-Tenant Security.

import assert from 'node:assert/strict'
import { z } from 'zod'

console.log('=== Running Phase 2 Booking Concurrency & Commercial Integrity Hardening Tests ===\n')

// ---------------------------------------------------------------------------
// Schema Definitions (Matching lib/validations/sales.ts)
// ---------------------------------------------------------------------------

const PaymentStatusEnum = z.enum(['unverified', 'verified', 'failed', 'refunded', 'partially_verified'])

const BlockUnitSchema = z.object({
  projectId: z.string().uuid({ message: 'Valid project ID is required' }),
  inventoryId: z.string().uuid({ message: 'Valid inventory ID is required' }),
  leadId: z.string().uuid({ message: 'Valid lead ID is required' }),
  tokenAmount: z.coerce.number().min(0, { message: 'Token amount cannot be negative' }),
  paymentReference: z.string().trim().max(100).optional().nullable(),
  paymentStatus: PaymentStatusEnum.default('unverified'),
  idempotencyKey: z.string().trim().max(255).optional().nullable(),
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
  paymentStatus: PaymentStatusEnum.default('unverified'),
  idempotencyKey: z.string().trim().max(255).optional().nullable(),
  paymentPlan: z
    .enum(['construction_linked', 'time_linked', 'down_payment', 'custom'])
    .default('construction_linked'),
  remarks: z.string().trim().max(1000).optional().nullable(),
})

// ---------------------------------------------------------------------------
// Realistic In-Memory Database Harness with Row Locking Simulation
// ---------------------------------------------------------------------------

function createConcurrencyHarness() {
  const inventory = new Map([
    [
      'u_alpha_1',
      {
        id: 'u_alpha_1',
        org_id: 'org_alpha',
        project_id: 'proj_alpha',
        unit_number: 'A-101',
        status: 'available',
        total_price: 10000000,
        super_built_up_area: 1500,
      },
    ],
    [
      'u_alpha_2',
      {
        id: 'u_alpha_2',
        org_id: 'org_alpha',
        project_id: 'proj_alpha',
        unit_number: 'A-102',
        status: 'available',
        total_price: 12500000,
        super_built_up_area: 1800,
      },
    ],
    [
      'u_beta_1',
      {
        id: 'u_beta_1',
        org_id: 'org_beta',
        project_id: 'proj_beta',
        unit_number: 'B-201',
        status: 'available',
        total_price: 8000000,
        super_built_up_area: 1200,
      },
    ],
  ])

  const leads = new Map([
    ['lead_1', { id: 'lead_1', org_id: 'org_alpha', name: 'Rajesh Verma', phone: '+919988776655' }],
    ['lead_2', { id: 'lead_2', org_id: 'org_alpha', name: 'Pooja Hegde', phone: '+919988776656' }],
    ['lead_beta', { id: 'lead_beta', org_id: 'org_beta', name: 'Kunal Kapoor', phone: '+919988776699' }],
  ])

  const channelPartners = new Map([
    [
      'cp_1',
      {
        id: 'cp_1',
        org_id: 'org_alpha',
        firm_name: 'Metro Real Estate Advisors',
        contact_person: 'Amit Kumar',
        default_commission_rate: 2.0,
      },
    ],
  ])

  const blockings = new Map()
  const bookings = new Map()
  const idempotencyStore = new Map()
  const commissions = []
  const auditLogs = []

  // Mutex lock simulator for row-level locking (FOR UPDATE simulation)
  const rowLocks = new Set()

  async function withRowLock(resourceKey, callback) {
    // Spin-wait / queue simulator for atomic isolation
    while (rowLocks.has(resourceKey)) {
      await new Promise((r) => setTimeout(r, 5))
    }
    rowLocks.add(resourceKey)
    try {
      return await callback()
    } finally {
      rowLocks.delete(resourceKey)
    }
  }

  // ATOMIC HOLD (Simulating hold_inventory_unit_atomic RPC)
  async function blockUnitAtomic(params, actor) {
    if (actor.orgId !== params.orgId) {
      throw new Error('Forbidden: Cross-tenant access denied (403)')
    }
    if (actor.role === 'readonly') {
      throw new Error('Forbidden: Readonly members cannot place holds (403)')
    }

    // Check idempotency first
    if (params.idempotencyKey) {
      const idemKey = `${params.orgId}:hold:${params.idempotencyKey}`
      if (idempotencyStore.has(idemKey)) {
        return idempotencyStore.get(idemKey)
      }
    }

    return await withRowLock(`inv:${params.inventoryId}`, async () => {
      // Re-check idempotency under lock
      if (params.idempotencyKey) {
        const idemKey = `${params.orgId}:hold:${params.idempotencyKey}`
        if (idempotencyStore.has(idemKey)) {
          return idempotencyStore.get(idemKey)
        }
      }

      const unit = inventory.get(params.inventoryId)
      if (!unit || unit.org_id !== params.orgId) {
        throw new Error('Inventory unit not found or access denied')
      }

      // Check PostgreSQL partial unique index: uq_active_blocking_per_unit
      const existingActiveHold = Array.from(blockings.values()).find(
        (b) => b.inventory_id === params.inventoryId && b.status === 'active'
      )
      if (existingActiveHold || unit.status !== 'available') {
        throw new Error(`Unit ${unit.unit_number} is already ${unit.status} and cannot be held (Conflict 409)`)
      }

      const lead = leads.get(params.leadId)
      if (!lead || lead.org_id !== params.orgId) {
        throw new Error('Lead not found in this organization')
      }

      const blockingId = `blk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
      const expiresAt = params.expiresAt || new Date(Date.now() + (params.holdDurationHours || 48) * 3600 * 1000).toISOString()

      const blocking = {
        id: blockingId,
        org_id: params.orgId,
        project_id: params.projectId,
        inventory_id: params.inventoryId,
        lead_id: params.leadId,
        blocked_by: actor.profileId,
        token_amount: params.tokenAmount,
        payment_reference: params.paymentReference || null,
        payment_status: params.paymentStatus || 'unverified',
        idempotency_key: params.idempotencyKey || null,
        expires_at: expiresAt,
        status: 'active',
        remarks: params.remarks || null,
        created_at: new Date().toISOString(),
      }

      blockings.set(blockingId, blocking)
      unit.status = 'blocked'

      auditLogs.push({
        inventory_id: unit.id,
        org_id: unit.org_id,
        previous_status: 'available',
        new_status: 'blocked',
        changed_by: actor.profileId,
        reason: `Hold placed with token ₹${params.tokenAmount}`,
      })

      if (params.idempotencyKey) {
        idempotencyStore.set(`${params.orgId}:hold:${params.idempotencyKey}`, blocking)
      }

      return blocking
    })
  }

  // ATOMIC RELEASE (Simulating release_inventory_hold_atomic RPC)
  async function releaseHoldAtomic(params, actor) {
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

    return await withRowLock(`inv:${blocking.inventory_id}`, async () => {
      if (blocking.status !== 'active') {
        throw new Error(`Blocking cannot be released. Current status: ${blocking.status}`)
      }

      const unit = inventory.get(blocking.inventory_id)
      if (!unit) throw new Error('Unit not found')

      blocking.status = 'cancelled'
      blocking.remarks = params.reason || 'Hold cancelled'

      // CRITICAL INVARIANT: Only revert unit status to 'available' IF it is currently 'blocked'
      // If unit has already transitioned to 'booked' or 'sold', release MUST NOT revert it to 'available'!
      let reverted = false
      if (unit.status === 'blocked') {
        unit.status = 'available'
        reverted = true
        auditLogs.push({
          inventory_id: unit.id,
          org_id: unit.org_id,
          previous_status: 'blocked',
          new_status: 'available',
          changed_by: actor.profileId,
          reason: params.reason || 'Hold released manually',
        })
      }

      return { success: true, unitRevertedToAvailable: reverted }
    })
  }

  // ATOMIC BOOKING (Simulating execute_booking_atomic RPC)
  async function createBookingAtomic(params, actor) {
    if (actor.orgId !== params.orgId) {
      throw new Error('Forbidden: Cross-tenant access denied (403)')
    }
    if (actor.role === 'readonly') {
      throw new Error('Forbidden: Readonly members cannot execute bookings (403)')
    }

    // Check idempotency first
    if (params.idempotencyKey) {
      const idemKey = `${params.orgId}:booking:${params.idempotencyKey}`
      if (idempotencyStore.has(idemKey)) {
        return idempotencyStore.get(idemKey)
      }
    }

    return await withRowLock(`inv:${params.inventoryId}`, async () => {
      // Re-check idempotency under lock
      if (params.idempotencyKey) {
        const idemKey = `${params.orgId}:booking:${params.idempotencyKey}`
        if (idempotencyStore.has(idemKey)) {
          return idempotencyStore.get(idemKey)
        }
      }

      const unit = inventory.get(params.inventoryId)
      if (!unit || unit.org_id !== params.orgId) {
        throw new Error('Inventory unit not found')
      }

      // Check PostgreSQL partial unique index: uq_active_booking_per_unit
      const existingBooking = Array.from(bookings.values()).find(
        (b) => b.inventory_id === params.inventoryId && b.status !== 'cancelled'
      )
      if (existingBooking || unit.status === 'booked' || unit.status === 'sold') {
        throw new Error(`Unit ${unit.unit_number} is already booked or sold (Conflict 409)`)
      }

      // If converting an active hold
      let holdRecord = null
      if (params.blockingId) {
        holdRecord = blockings.get(params.blockingId)
        if (!holdRecord || holdRecord.org_id !== params.orgId) {
          throw new Error('Specified hold was not found')
        }
        if (holdRecord.status !== 'active') {
          throw new Error(`Hold cannot be converted. Status is: ${holdRecord.status}`)
        }
        if (holdRecord.inventory_id !== params.inventoryId) {
          throw new Error('Hold does not match the target inventory unit')
        }
        if (holdRecord.lead_id !== params.leadId) {
          throw new Error('Booking customer does not match the active hold customer')
        }
      } else {
        // Direct booking without prior hold requires available status
        if (unit.status !== 'available') {
          throw new Error(`Cannot directly book unit. Current status is ${unit.status}`)
        }
      }

      // Commercial arithmetic reconciliation: Total = Base + Additional
      const expectedTotal = Number(params.basePrice) + Number(params.additionalCharges || 0)
      if (params.totalAmount && Math.abs(Number(params.totalAmount) - expectedTotal) > 0.01) {
        throw new Error('Commercial arithmetic reconciliation failed: Total amount does not match Base + Additional charges')
      }
      const totalAmount = expectedTotal

      const bookingId = `bkg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
      const bookingNumber = `BKG-2026-${Math.floor(1000 + Math.random() * 9000)}`

      const booking = {
        id: bookingId,
        booking_number: bookingNumber,
        org_id: params.orgId,
        project_id: params.projectId,
        inventory_id: params.inventoryId,
        lead_id: params.leadId,
        blocking_id: params.blockingId || null,
        channel_partner_id: params.channelPartnerId || null,
        booked_by: actor.profileId,
        base_price: params.basePrice,
        additional_charges: params.additionalCharges || 0,
        total_amount: totalAmount,
        booking_amount_received: params.bookingAmountReceived,
        payment_status: params.paymentStatus || 'unverified',
        payment_plan: params.paymentPlan || 'construction_linked',
        idempotency_key: params.idempotencyKey || null,
        status: 'confirmed',
        booking_date: new Date().toISOString().split('T')[0],
        created_at: new Date().toISOString(),
      }

      bookings.set(bookingId, booking)
      const prevStatus = unit.status
      unit.status = 'booked'

      // Convert hold if present
      if (holdRecord) {
        holdRecord.status = 'converted'
      }

      // Record audit history
      auditLogs.push({
        inventory_id: unit.id,
        org_id: unit.org_id,
        previous_status: prevStatus,
        new_status: 'booked',
        changed_by: actor.profileId,
        reason: `Unit booked #${bookingNumber}. Total ₹${totalAmount}`,
      })

      // Calculate broker commission with TDS reconciliation
      if (params.channelPartnerId) {
        const cp = channelPartners.get(params.channelPartnerId)
        if (cp) {
          const rate = cp.default_commission_rate
          const grossCommission = (totalAmount * rate) / 100
          const tdsRate = 5.0 // Section 194H 5% TDS
          const tdsAmount = (grossCommission * tdsRate) / 100
          const netCommission = grossCommission - tdsAmount

          const commRecord = {
            id: `comm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            booking_id: bookingId,
            channel_partner_id: cp.id,
            org_id: params.orgId,
            commission_percentage: rate,
            gross_commission: grossCommission,
            tds_percentage: tdsRate,
            tds_amount: tdsAmount,
            net_commission: netCommission,
            status: 'accrued',
          }
          commissions.push(commRecord)
        }
      }

      if (params.idempotencyKey) {
        idempotencyStore.set(`${params.orgId}:booking:${params.idempotencyKey}`, booking)
      }

      return booking
    })
  }

  // ATOMIC SWEEPER (Simulating sweep_expired_holds_atomic with FOR UPDATE SKIP LOCKED)
  async function sweepExpiredHoldsAtomic(workerId = 'worker-1', targetOrgId = null) {
    const now = new Date()
    const swept = []

    // Find candidate expired active holds
    const candidateIds = Array.from(blockings.values())
      .filter((b) => {
        if (b.status !== 'active') return false
        if (targetOrgId && b.org_id !== targetOrgId) return false
        return new Date(b.expires_at) < now
      })
      .map((b) => b.id)

    for (const bId of candidateIds) {
      // Simulate SKIP LOCKED: If locked by another worker/request, skip immediately
      const resourceKey = `blk:${bId}`
      if (rowLocks.has(resourceKey)) {
        continue // Skipped by SKIP LOCKED
      }

      rowLocks.add(resourceKey)
      try {
        const blocking = blockings.get(bId)
        // Double-check under lock
        if (blocking && blocking.status === 'active' && new Date(blocking.expires_at) < now) {
          blocking.status = 'expired'
          blocking.remarks = `Automatically expired by background sweep [${workerId}]`

          const unit = inventory.get(blocking.inventory_id)
          // Invariant protection: only revert to available if unit is currently blocked
          if (unit && unit.status === 'blocked') {
            unit.status = 'available'
            auditLogs.push({
              inventory_id: unit.id,
              org_id: unit.org_id,
              previous_status: 'blocked',
              new_status: 'available',
              changed_by: `system:${workerId}`,
              reason: 'Hold expired automatically via background sweep',
            })
          }
          swept.push(blocking.id)
        }
      } finally {
        rowLocks.delete(resourceKey)
      }
    }

    return swept
  }

  return {
    inventory,
    leads,
    channelPartners,
    blockings,
    bookings,
    commissions,
    auditLogs,
    blockUnitAtomic,
    releaseHoldAtomic,
    createBookingAtomic,
    sweepExpiredHoldsAtomic,
  }
}

// ---------------------------------------------------------------------------
// TEST 1: Simultaneous Hold Attempts on the Same Unit (Double-Hold Prevention)
// ---------------------------------------------------------------------------
console.log('Test 1: Simultaneous hold attempts on the same unit...')
{
  const h = createConcurrencyHarness()
  const agent1 = { orgId: 'org_alpha', profileId: 'prof_agent_1', role: 'sales' }
  const agent2 = { orgId: 'org_alpha', profileId: 'prof_agent_2', role: 'sales' }

  const p1 = {
    orgId: 'org_alpha',
    projectId: 'proj_alpha',
    inventoryId: 'u_alpha_1',
    leadId: 'lead_1',
    tokenAmount: 50000,
  }
  const p2 = {
    orgId: 'org_alpha',
    projectId: 'proj_alpha',
    inventoryId: 'u_alpha_1',
    leadId: 'lead_2',
    tokenAmount: 75000,
  }

  // Fire both hold requests concurrently
  const [res1, res2] = await Promise.allSettled([
    h.blockUnitAtomic(p1, agent1),
    h.blockUnitAtomic(p2, agent2),
  ])

  // Exactly one must succeed and one must fail with conflict
  const successes = [res1, res2].filter((r) => r.status === 'fulfilled')
  const failures = [res1, res2].filter((r) => r.status === 'rejected')

  assert.equal(successes.length, 1, 'Exactly one concurrent hold must succeed')
  assert.equal(failures.length, 1, 'Second concurrent hold must be rejected with conflict')
  assert.match(failures[0].reason.message, /already blocked and cannot be held/i)

  const unit = h.inventory.get('u_alpha_1')
  assert.equal(unit.status, 'blocked', 'Unit must be in blocked status')

  const activeHolds = Array.from(h.blockings.values()).filter((b) => b.inventory_id === 'u_alpha_1' && b.status === 'active')
  assert.equal(activeHolds.length, 1, 'Must have exactly 1 active hold for unit')

  console.log('✓ Passed: Only one agent acquired hold; second request was safely rejected.\n')
}

// ---------------------------------------------------------------------------
// TEST 2: Simultaneous Booking Attempts on the Same Unit (Double-Booking Prevention)
// ---------------------------------------------------------------------------
console.log('Test 2: Simultaneous direct booking attempts on the same available unit...')
{
  const h = createConcurrencyHarness()
  const agent1 = { orgId: 'org_alpha', profileId: 'prof_agent_1', role: 'sales' }
  const agent2 = { orgId: 'org_alpha', profileId: 'prof_agent_2', role: 'sales' }

  const b1 = {
    orgId: 'org_alpha',
    projectId: 'proj_alpha',
    inventoryId: 'u_alpha_2',
    leadId: 'lead_1',
    basePrice: 12500000,
    bookingAmountReceived: 1000000,
  }
  const b2 = {
    orgId: 'org_alpha',
    projectId: 'proj_alpha',
    inventoryId: 'u_alpha_2',
    leadId: 'lead_2',
    basePrice: 12500000,
    bookingAmountReceived: 1000000,
  }

  const [res1, res2] = await Promise.allSettled([
    h.createBookingAtomic(b1, agent1),
    h.createBookingAtomic(b2, agent2),
  ])

  const successes = [res1, res2].filter((r) => r.status === 'fulfilled')
  const failures = [res1, res2].filter((r) => r.status === 'rejected')

  assert.equal(successes.length, 1, 'Exactly one booking request must succeed')
  assert.equal(failures.length, 1, 'Concurrent booking must be rejected with 409 conflict')
  assert.match(failures[0].reason.message, /already booked or sold/i)

  const activeBookings = Array.from(h.bookings.values()).filter((b) => b.inventory_id === 'u_alpha_2' && b.status === 'confirmed')
  assert.equal(activeBookings.length, 1, 'Exactly one confirmed booking record created')

  console.log('✓ Passed: Double-booking strictly prevented at engine level.\n')
}

// ---------------------------------------------------------------------------
// TEST 3: Booking Conversion Racing with Hold Expiration
// ---------------------------------------------------------------------------
console.log('Test 3: Booking conversion racing with hold expiration...')
{
  const h = createConcurrencyHarness()
  const agent = { orgId: 'org_alpha', profileId: 'prof_agent_1', role: 'sales' }

  // Create hold that is just about to expire (or already in the past)
  const pastDate = new Date(Date.now() - 10000).toISOString()
  const hold = await h.blockUnitAtomic(
    {
      orgId: 'org_alpha',
      projectId: 'proj_alpha',
      inventoryId: 'u_alpha_1',
      leadId: 'lead_1',
      tokenAmount: 50000,
      expiresAt: pastDate,
    },
    agent
  )

  // Race: Agent attempts to convert hold while background sweep triggers
  const [bookRes, sweepRes] = await Promise.allSettled([
    h.createBookingAtomic(
      {
        orgId: 'org_alpha',
        projectId: 'proj_alpha',
        inventoryId: 'u_alpha_1',
        leadId: 'lead_1',
        blockingId: hold.id,
        basePrice: 10000000,
        bookingAmountReceived: 500000,
      },
      agent
    ),
    h.sweepExpiredHoldsAtomic('cron-worker-1'),
  ])

  const unit = h.inventory.get('u_alpha_1')
  const holdInDb = h.blockings.get(hold.id)

  if (bookRes.status === 'fulfilled') {
    // If booking was serialized first:
    assert.equal(holdInDb.status, 'converted', 'Hold must be marked converted')
    assert.equal(unit.status, 'booked', 'Unit must be booked')
    // Background sweep must not have reverted the unit!
    assert.notEqual(unit.status, 'available', 'Sweep must never revert a booked unit')
    console.log('  -> Booking won race: hold converted, unit remained safely booked.')
  } else {
    // If sweep was serialized first:
    assert.equal(holdInDb.status, 'expired', 'Hold expired before booking was accepted')
    assert.equal(unit.status, 'available', 'Unit reverted to available')
    assert.match(bookRes.reason.message, /Hold cannot be converted. Status is: expired/i)
    console.log('  -> Sweep won race: hold expired cleanly; booking attempt safely rejected.')
  }

  console.log('✓ Passed: Race condition between conversion and expiration resolves deterministically.\n')
}

// ---------------------------------------------------------------------------
// TEST 4: Hold Release Racing with Booking Conversion (Invariant Preservation)
// ---------------------------------------------------------------------------
console.log('Test 4: Releasing hold must not revert a unit that has already been booked...')
{
  const h = createConcurrencyHarness()
  const agent = { orgId: 'org_alpha', profileId: 'prof_agent_1', role: 'sales' }

  // 1. Create active hold
  const hold = await h.blockUnitAtomic(
    {
      orgId: 'org_alpha',
      projectId: 'proj_alpha',
      inventoryId: 'u_alpha_1',
      leadId: 'lead_1',
      tokenAmount: 50000,
    },
    agent
  )

  // 2. Convert hold to booking
  await h.createBookingAtomic(
    {
      orgId: 'org_alpha',
      projectId: 'proj_alpha',
      inventoryId: 'u_alpha_1',
      leadId: 'lead_1',
      blockingId: hold.id,
      basePrice: 10000000,
      bookingAmountReceived: 500000,
    },
    agent
  )

  const unit = h.inventory.get('u_alpha_1')
  assert.equal(unit.status, 'booked', 'Unit must be booked')

  // 3. Late/stale manual release attempt on the converted hold
  await assert.rejects(
    async () => {
      await h.releaseHoldAtomic(
        {
          orgId: 'org_alpha',
          blockingId: hold.id,
          reason: 'Late release request',
        },
        agent
      )
    },
    /Blocking cannot be released. Current status: converted/i,
    'Cannot release a hold that was already converted'
  )

  // Verify invariant: unit status was NEVER reverted to 'available'
  assert.equal(unit.status, 'booked', 'CRITICAL INVARIANT: Unit must stay booked')

  console.log('✓ Passed: Stale hold release cannot corrupt booked unit state.\n')
}

// ---------------------------------------------------------------------------
// TEST 5: Concurrent Sweeper Workers (SKIP LOCKED Concurrency Safety)
// ---------------------------------------------------------------------------
console.log('Test 5: Concurrent sweepers running simultaneously (SKIP LOCKED)...')
{
  const h = createConcurrencyHarness()
  const agent = { orgId: 'org_alpha', profileId: 'prof_agent_1', role: 'sales' }

  // Seed 5 expired active holds
  const pastDate = new Date(Date.now() - 60000).toISOString()
  for (let i = 1; i <= 2; i++) {
    const uId = `u_alpha_${i}`
    await h.blockUnitAtomic(
      {
        orgId: 'org_alpha',
        projectId: 'proj_alpha',
        inventoryId: uId,
        leadId: 'lead_1',
        tokenAmount: 25000,
        expiresAt: pastDate,
      },
      agent
    )
  }

  // Run 4 sweepers concurrently
  const workers = ['worker-A', 'worker-B', 'worker-C', 'worker-D']
  const results = await Promise.all(workers.map((w) => h.sweepExpiredHoldsAtomic(w, 'org_alpha')))

  const allSweptIds = results.flat()
  const uniqueSweptIds = new Set(allSweptIds)

  // Exactly 2 holds swept in total across all workers, with zero double-processing
  assert.equal(uniqueSweptIds.size, 2, 'All expired holds must be swept')
  assert.equal(allSweptIds.length, 2, 'No expired hold should be processed twice by competing workers')

  console.log('✓ Passed: Concurrent workers safely coordinated via SKIP LOCKED without collisions.\n')
}

// ---------------------------------------------------------------------------
// TEST 6: Idempotent Retries on Hold and Booking Execution
// ---------------------------------------------------------------------------
console.log('Test 6: Idempotency safety on repeated requests...')
{
  const h = createConcurrencyHarness()
  const agent = { orgId: 'org_alpha', profileId: 'prof_agent_1', role: 'sales' }

  const holdIdemKey = 'idem-hold-uuid-101'
  const holdParams = {
    orgId: 'org_alpha',
    projectId: 'proj_alpha',
    inventoryId: 'u_alpha_1',
    leadId: 'lead_1',
    tokenAmount: 50000,
    idempotencyKey: holdIdemKey,
  }

  // First hold attempt
  const hold1 = await h.blockUnitAtomic(holdParams, agent)
  // Network retry / double-click attempt with same idempotency key
  const hold2 = await h.blockUnitAtomic(holdParams, agent)

  assert.equal(hold1.id, hold2.id, 'Idempotent retry must return identical hold record')
  assert.equal(h.blockings.size, 1, 'Only one hold record should be created')

  // Booking idempotency
  const bookingIdemKey = 'idem-bkg-uuid-202'
  const bookParams = {
    orgId: 'org_alpha',
    projectId: 'proj_alpha',
    inventoryId: 'u_alpha_1',
    leadId: 'lead_1',
    blockingId: hold1.id,
    channelPartnerId: 'cp_1',
    basePrice: 10000000,
    additionalCharges: 500000,
    bookingAmountReceived: 1000000,
    idempotencyKey: bookingIdemKey,
  }

  const bkg1 = await h.createBookingAtomic(bookParams, agent)
  const bkg2 = await h.createBookingAtomic(bookParams, agent)

  assert.equal(bkg1.id, bkg2.id, 'Idempotent retry must return identical booking record')
  assert.equal(bkg1.booking_number, bkg2.booking_number, 'Booking number must be preserved')
  assert.equal(h.bookings.size, 1, 'Only one booking record should exist')
  assert.equal(h.commissions.length, 1, 'Broker commission must NOT be accrued twice on retry')

  console.log('✓ Passed: Retrying with Idempotency-Key returns existing records without duplicate state.\n')
}

// ---------------------------------------------------------------------------
// TEST 7: Commercial Arithmetic & Balance Reconciliation
// ---------------------------------------------------------------------------
console.log('Test 7: Commercial arithmetic and consideration reconciliation...')
{
  const h = createConcurrencyHarness()
  const agent = { orgId: 'org_alpha', profileId: 'prof_agent_1', role: 'sales' }

  // Mismatch in payload: Total does not equal base + additional
  await assert.rejects(
    async () => {
      await h.createBookingAtomic(
        {
          orgId: 'org_alpha',
          projectId: 'proj_alpha',
          inventoryId: 'u_alpha_2',
          leadId: 'lead_1',
          basePrice: 10000000,
          additionalCharges: 500000,
          totalAmount: 11000000, // Invalid: 10M + 0.5M != 11M
          bookingAmountReceived: 1000000,
        },
        agent
      )
    },
    /Commercial arithmetic reconciliation failed/i,
    'Mismatched total amount must be rejected'
  )

  // Valid arithmetic: 10,000,000 + 500,000 = 10,500,000
  const booking = await h.createBookingAtomic(
    {
      orgId: 'org_alpha',
      projectId: 'proj_alpha',
      inventoryId: 'u_alpha_2',
      leadId: 'lead_1',
      basePrice: 10000000,
      additionalCharges: 500000,
      totalAmount: 10500000,
      bookingAmountReceived: 1050000,
    },
    agent
  )

  assert.equal(booking.total_amount, 10500000)
  assert.equal(booking.base_price, 10000000)
  assert.equal(booking.additional_charges, 500000)

  console.log('✓ Passed: Financial arithmetic strictly reconciled (Base + Addl = Total).\n')
}

// ---------------------------------------------------------------------------
// TEST 8: Broker Commission & Statutory 5% TDS Reconciliation
// ---------------------------------------------------------------------------
console.log('Test 8: Channel partner commission and 5% TDS accounting reconciliation...')
{
  const h = createConcurrencyHarness()
  const agent = { orgId: 'org_alpha', profileId: 'prof_agent_1', role: 'sales' }

  const booking = await h.createBookingAtomic(
    {
      orgId: 'org_alpha',
      projectId: 'proj_alpha',
      inventoryId: 'u_alpha_1',
      leadId: 'lead_1',
      channelPartnerId: 'cp_1',
      basePrice: 10000000, // 1 Crore
      additionalCharges: 0,
      bookingAmountReceived: 1000000,
    },
    agent
  )

  assert.equal(h.commissions.length, 1)
  const comm = h.commissions[0]

  // Base: 10,000,000. Broker rate: 2.0%
  // Gross Commission: 200,000
  // TDS: 5% of 200,000 = 10,000
  // Net Commission: 190,000
  assert.equal(comm.gross_commission, 200000, 'Gross commission must be 2% of 10M = 200,000')
  assert.equal(comm.tds_percentage, 5.0, 'TDS percentage must be 5% (Section 194H)')
  assert.equal(comm.tds_amount, 10000, 'TDS must be ₹10,000')
  assert.equal(comm.net_commission, 190000, 'Net payable must be ₹190,000')
  assert.equal(comm.gross_commission - comm.tds_amount, comm.net_commission, 'Gross - TDS = Net')

  console.log('✓ Passed: Broker commission and statutory TDS accurately computed and reconciled.\n')
}

// ---------------------------------------------------------------------------
// TEST 9: Multi-Tenant Boundary Enforcement
// ---------------------------------------------------------------------------
console.log('Test 9: Cross-tenant isolation enforcement (403 Forbidden)...')
{
  const h = createConcurrencyHarness()
  const betaAgent = { orgId: 'org_beta', profileId: 'prof_beta_1', role: 'sales' }

  // Org Beta attempts to place a hold on Org Alpha's unit
  await assert.rejects(
    async () => {
      await h.blockUnitAtomic(
        {
          orgId: 'org_alpha',
          projectId: 'proj_alpha',
          inventoryId: 'u_alpha_1',
          leadId: 'lead_1',
          tokenAmount: 50000,
        },
        betaAgent
      )
    },
    /Forbidden: Cross-tenant access denied \(403\)/,
    'Cross-tenant hold attempt must be denied'
  )

  // Org Beta attempts to book Org Alpha's unit
  await assert.rejects(
    async () => {
      await h.createBookingAtomic(
        {
          orgId: 'org_alpha',
          projectId: 'proj_alpha',
          inventoryId: 'u_alpha_1',
          leadId: 'lead_1',
          basePrice: 10000000,
          bookingAmountReceived: 1000000,
        },
        betaAgent
      )
    },
    /Forbidden: Cross-tenant access denied \(403\)/,
    'Cross-tenant booking attempt must be denied'
  )

  console.log('✓ Passed: Cross-tenant boundary strictly maintained.\n')
}

// ---------------------------------------------------------------------------
// TEST 10: Role-Based Access Control (Readonly vs Authorized Execution)
// ---------------------------------------------------------------------------
console.log('Test 10: RBAC restriction on readonly users...')
{
  const h = createConcurrencyHarness()
  const readonlyUser = { orgId: 'org_alpha', profileId: 'prof_ro_1', role: 'readonly' }

  await assert.rejects(
    async () => {
      await h.blockUnitAtomic(
        {
          orgId: 'org_alpha',
          projectId: 'proj_alpha',
          inventoryId: 'u_alpha_1',
          leadId: 'lead_1',
          tokenAmount: 50000,
        },
        readonlyUser
      )
    },
    /Forbidden: Readonly members cannot place holds \(403\)/,
    'Readonly members cannot place holds'
  )

  await assert.rejects(
    async () => {
      await h.createBookingAtomic(
        {
          orgId: 'org_alpha',
          projectId: 'proj_alpha',
          inventoryId: 'u_alpha_1',
          leadId: 'lead_1',
          basePrice: 10000000,
          bookingAmountReceived: 1000000,
        },
        readonlyUser
      )
    },
    /Forbidden: Readonly members cannot execute bookings \(403\)/,
    'Readonly members cannot execute bookings'
  )

  console.log('✓ Passed: Readonly role restrictions strictly enforced.\n')
}

// ---------------------------------------------------------------------------
// TEST 11: Payment Status Separation (Token & Advance Unverified vs Verified)
// ---------------------------------------------------------------------------
console.log('Test 11: Payment verification distinction...')
{
  const h = createConcurrencyHarness()
  const agent = { orgId: 'org_alpha', profileId: 'prof_agent_1', role: 'sales' }

  // Customer hold placed with cheque/UTR reference
  const hold = await h.blockUnitAtomic(
    {
      orgId: 'org_alpha',
      projectId: 'proj_alpha',
      inventoryId: 'u_alpha_1',
      leadId: 'lead_1',
      tokenAmount: 50000,
      paymentReference: 'CHEQUE-99214',
      paymentStatus: 'unverified',
    },
    agent
  )

  assert.equal(hold.payment_status, 'unverified', 'Customer hold must start as unverified')
  assert.equal(hold.payment_reference, 'CHEQUE-99214')

  // Direct booking with wire transfer reference
  const booking = await h.createBookingAtomic(
    {
      orgId: 'org_alpha',
      projectId: 'proj_alpha',
      inventoryId: 'u_alpha_2',
      leadId: 'lead_2',
      basePrice: 12500000,
      bookingAmountReceived: 1000000,
      paymentStatus: 'unverified',
    },
    agent
  )

  assert.equal(booking.payment_status, 'unverified', 'Advance payment must start as unverified until bank clearance')

  console.log('✓ Passed: Unverified customer payments are recorded without premature realization.\n')
}

console.log('================================================================================')
console.log('ALL 11/11 PHASE 2 CONCURRENCY, ATOMICITY & COMMERCIAL INTEGRITY TESTS PASSED!')
console.log('================================================================================')
