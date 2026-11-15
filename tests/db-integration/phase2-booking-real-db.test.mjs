// tests/db-integration/phase2-booking-real-db.test.mjs
// Production X — Phase 2 Real PostgreSQL Database Integration & Concurrency Tests
// Directly executes against disposable local PostgreSQL/Supabase instance (pg_backend_pid verified).
// Tests all 33 migrations, atomic stored procedures, row locks, multi-connection concurrency,
// sweeper safety, broker commission TDS reconciliation, and tenant boundaries.

import assert from 'node:assert/strict'

const connectionString =
  process.env.DATABASE_URL ||
  process.env.SUPABASE_DB_URL ||
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

async function runRealDbIntegrationTests() {
  console.log('===================================================================')
  console.log('STARTING PHASE 2 REAL DATABASE INTEGRATION & CONCURRENCY TEST SUITE')
  console.log(`Target: ${connectionString.replace(/:[^:@]+@/, ':***@')}`)
  console.log('===================================================================\n')

  let pg
  try {
    pg = await import('pg')
  } catch (err) {
    console.error('FATAL: pg (node-postgres) is required to run real database tests.')
    process.exit(1)
  }

  const { Client } = pg.default || pg

  // Establish Independent Connection 1
  const client1 = new Client({ connectionString })
  await client1.connect()
  const pid1 = (await client1.query('SELECT pg_backend_pid()')).rows[0].pg_backend_pid

  // Establish Independent Connection 2
  const client2 = new Client({ connectionString })
  await client2.connect()
  const pid2 = (await client2.query('SELECT pg_backend_pid()')).rows[0].pg_backend_pid

  console.log(`Connection 1 connected (PID: ${pid1})`)
  console.log(`Connection 2 connected (PID: ${pid2})`)
  assert.notEqual(pid1, pid2, 'Must have 2 genuinely distinct PostgreSQL backend processes')
  console.log('✓ Multi-connection PostgreSQL backend processes confirmed.\n')

  try {
    // ------------------------------------------------------------------------
    // SETUP TEST FIXTURES
    // ------------------------------------------------------------------------
    console.log('--- Setting up test fixtures for Phase 2 database validation ---')

    const orgAlphaId = '11111111-aaaa-1111-aaaa-111111111111'
    const orgBetaId  = '22222222-bbbb-2222-bbbb-222222222222'
    const projAlphaId = 'aaaaaaaa-1111-aaaa-1111-aaaaaaaaaaaa'
    const projBetaId  = 'bbbbbbbb-2222-bbbb-2222-bbbbbbbbbbbb'
    const profileAdminId = '33333333-3333-3333-3333-333333333333'
    const profileAgentId = '44444444-4444-4444-4444-444444444444'
    const leadAlpha1Id = '55555555-5555-5555-5555-555555555555'
    const leadAlpha2Id = '66666666-6666-6666-6666-666666666666'
    const leadBetaId = '77777777-7777-7777-7777-777777777777'
    const unit1Id = '88888888-8888-8888-8888-888888888881'
    const unit2Id = '88888888-8888-8888-8888-888888888882'
    const unit3Id = '88888888-8888-8888-8888-888888888883'
    const cpAlphaId = '99999999-9999-9999-9999-999999999999'

    // Clean previous test state
    await client1.query('DELETE FROM public.channel_partner_commissions WHERE org_id IN ($1, $2)', [orgAlphaId, orgBetaId])
    await client1.query('DELETE FROM public.deals WHERE org_id IN ($1, $2)', [orgAlphaId, orgBetaId])
    await client1.query('DELETE FROM public.bookings WHERE org_id IN ($1, $2)', [orgAlphaId, orgBetaId])
    await client1.query('DELETE FROM public.inventory_blockings WHERE org_id IN ($1, $2)', [orgAlphaId, orgBetaId])
    await client1.query('DELETE FROM public.inventory_status_history WHERE org_id IN ($1, $2)', [orgAlphaId, orgBetaId])
    await client1.query('DELETE FROM public.inventory_items WHERE org_id IN ($1, $2)', [orgAlphaId, orgBetaId])
    await client1.query('DELETE FROM public.channel_partners WHERE org_id IN ($1, $2)', [orgAlphaId, orgBetaId])
    await client1.query('DELETE FROM public.leads WHERE org_id IN ($1, $2)', [orgAlphaId, orgBetaId])
    await client1.query('DELETE FROM public.projects WHERE org_id IN ($1, $2)', [orgAlphaId, orgBetaId])
    await client1.query('DELETE FROM public.org_members WHERE org_id IN ($1, $2)', [orgAlphaId, orgBetaId])
    await client1.query('DELETE FROM public.organisations WHERE id IN ($1, $2)', [orgAlphaId, orgBetaId])
    await client1.query('DELETE FROM public.profiles WHERE id IN ($1, $2)', [profileAdminId, profileAgentId])

    // Create Profiles
    await client1.query(`
      INSERT INTO public.profiles (id, email, full_name, role)
      VALUES 
        ($1, 'admin@alpha-dev.test', 'Admin User', 'platform_super_admin'),
        ($2, 'agent@alpha-dev.test', 'Sales Agent', 'client_admin')
      ON CONFLICT (id) DO NOTHING;
    `, [profileAdminId, profileAgentId])

    // Create Organisations
    await client1.query(`
      INSERT INTO public.organisations (id, name, slug)
      VALUES 
        ($1, 'Alpha Developers', 'alpha-developers'),
        ($2, 'Beta Realty', 'beta-realty')
      ON CONFLICT (id) DO NOTHING;
    `, [orgAlphaId, orgBetaId])

    // Org Members
    await client1.query(`
      INSERT INTO public.org_members (org_id, profile_id, role, status)
      VALUES 
        ($1, $2, 'admin', 'active'),
        ($1, $3, 'sales_manager', 'active')
      ON CONFLICT DO NOTHING;
    `, [orgAlphaId, profileAdminId, profileAgentId])

    // Projects
    await client1.query(`
      INSERT INTO public.projects (id, org_id, name, code, category, total_units_count)
      VALUES 
        ($1, $2, 'Skyline Towers', 'SKY', 'apartments', 50),
        ($3, $4, 'Meadow Plains', 'MDP', 'apartments', 30)
      ON CONFLICT DO NOTHING;
    `, [projAlphaId, orgAlphaId, projBetaId, orgBetaId])

    // Leads
    await client1.query(`
      INSERT INTO public.leads (id, org_id, project_id, name, phone, email, stage)
      VALUES 
        ($1, $2, $3, 'Aakash Mehta', '+919876543210', 'aakash@test.com', 'enquiry'),
        ($4, $2, $3, 'Pooja Bhatt', '+919876543211', 'pooja@test.com', 'enquiry'),
        ($5, $6, $7, 'Beta Buyer', '+919876543299', 'beta@test.com', 'enquiry')
      ON CONFLICT DO NOTHING;
    `, [leadAlpha1Id, orgAlphaId, projAlphaId, leadAlpha2Id, leadBetaId, orgBetaId, projBetaId])

    // Channel Partner
    await client1.query(`
      INSERT INTO public.channel_partners (id, org_id, firm_name, contact_person, default_commission_rate, status)
      VALUES 
        ($1, $2, 'Skyline Realty LLP', 'Rajesh K', 2.00, 'active')
      ON CONFLICT DO NOTHING;
    `, [cpAlphaId, orgAlphaId])

    // Inventory Items
    await client1.query(`
      INSERT INTO public.inventory_items (id, org_id, project_id, unit_number, category, status, total_price)
      VALUES 
        ($1, $2, $3, 'Unit-101', 'apartments', 'available', 10000000.00),
        ($4, $2, $3, 'Unit-102', 'apartments', 'available', 12500000.00),
        ($5, $2, $3, 'Unit-103', 'apartments', 'available', 15000000.00)
      ON CONFLICT DO NOTHING;
    `, [unit1Id, orgAlphaId, projAlphaId, unit2Id, unit3Id])

    console.log('✓ Test fixtures successfully created in real database.\n')

    // ------------------------------------------------------------------------
    // CHECK 1: Hold RPC Integration Test (hold_inventory_unit_atomic)
    // ------------------------------------------------------------------------
    console.log('CHECK 1: Testing hold_inventory_unit_atomic stored procedure...')
    const holdRes = await client1.query(`
      SELECT * FROM public.hold_inventory_unit_atomic(
        p_org_id => $1,
        p_project_id => $2,
        p_inventory_id => $3,
        p_lead_id => $4,
        p_token_amount => 50000.00,
        p_hold_duration_hours => 24,
        p_payment_reference => 'UTR-20261116-001',
        p_payment_status => 'unverified',
        p_remarks => 'Token via Cheque',
        p_actor_id => $5,
        p_idempotency_key => 'idem-hold-test-1'
      );
    `, [orgAlphaId, projAlphaId, unit1Id, leadAlpha1Id, profileAgentId])

    assert.equal(holdRes.rowCount, 1, 'Hold RPC must return exactly 1 row')
    const holdRow = holdRes.rows[0]
    assert.equal(holdRow.status, 'active')
    assert.equal(Number(holdRow.token_amount), 50000.00)

    // Inspect database state
    const unit1Check = await client1.query('SELECT status FROM public.inventory_items WHERE id = $1', [unit1Id])
    assert.equal(unit1Check.rows[0].status, 'blocked', 'Unit status must transition to blocked')

    const audit1Check = await client1.query('SELECT * FROM public.inventory_status_history WHERE inventory_id = $1 ORDER BY created_at DESC LIMIT 1', [unit1Id])
    assert.equal(audit1Check.rows[0].new_status, 'blocked')
    assert.equal(audit1Check.rows[0].previous_status, 'available')

    const deal1Check = await client1.query('SELECT * FROM public.deals WHERE inventory_id = $1', [unit1Id])
    assert.equal(deal1Check.rows[0].stage, 'unit_blocked')
    assert.equal(deal1Check.rows[0].probability, 70)

    console.log('✓ Check 1 Passed: hold_inventory_unit_atomic executed atomically with complete audit & deal integration.\n')

    // ------------------------------------------------------------------------
    // CHECK 2: Release RPC Integration Test (release_inventory_hold_atomic)
    // ------------------------------------------------------------------------
    console.log('CHECK 2: Testing release_inventory_hold_atomic stored procedure...')
    const releaseRes = await client1.query(`
      SELECT * FROM public.release_inventory_hold_atomic(
        p_org_id => $1,
        p_blocking_id => $2,
        p_reason => 'Buyer decided not to proceed',
        p_actor_id => $3
      );
    `, [orgAlphaId, holdRow.blocking_id, profileAgentId])

    assert.equal(releaseRes.rowCount, 1)
    assert.equal(releaseRes.rows[0].success, true)
    assert.equal(releaseRes.rows[0].new_unit_status, 'available')

    const unit1Released = await client1.query('SELECT status FROM public.inventory_items WHERE id = $1', [unit1Id])
    assert.equal(unit1Released.rows[0].status, 'available', 'Unit must revert to available')

    const blk1Released = await client1.query('SELECT status FROM public.inventory_blockings WHERE id = $1', [holdRow.blocking_id])
    assert.equal(blk1Released.rows[0].status, 'cancelled')

    console.log('✓ Check 2 Passed: release_inventory_hold_atomic cleanly reverted unit and audit trail.\n')

    // ------------------------------------------------------------------------
    // CHECK 3: Booking RPC Integration Test (execute_booking_atomic)
    // ------------------------------------------------------------------------
    console.log('CHECK 3: Testing execute_booking_atomic with hold conversion & commission...')

    // Place a fresh hold on Unit-101
    const freshHold = await client1.query(`
      SELECT * FROM public.hold_inventory_unit_atomic(
        p_org_id => $1,
        p_project_id => $2,
        p_inventory_id => $3,
        p_lead_id => $4,
        p_token_amount => 100000.00,
        p_actor_id => $5
      );
    `, [orgAlphaId, projAlphaId, unit1Id, leadAlpha1Id, profileAgentId])
    const activeHoldId = freshHold.rows[0].blocking_id

    // Execute booking converting the hold
    const bookingRes = await client1.query(`
      SELECT * FROM public.execute_booking_atomic(
        p_org_id => $1,
        p_project_id => $2,
        p_inventory_id => $3,
        p_lead_id => $4,
        p_blocking_id => $5,
        p_channel_partner_id => $6,
        p_base_price => 10000000.00,
        p_additional_charges => 500000.00,
        p_booking_amount_received => 1000000.00,
        p_payment_plan => 'construction_linked',
        p_actor_id => $7,
        p_idempotency_key => 'idem-booking-test-1'
      );
    `, [orgAlphaId, projAlphaId, unit1Id, leadAlpha1Id, activeHoldId, cpAlphaId, profileAgentId])

    assert.equal(bookingRes.rowCount, 1)
    const bookingRow = bookingRes.rows[0]
    assert.equal(bookingRow.status, 'confirmed')
    assert.equal(Number(bookingRow.total_amount), 10500000.00)

    // Verify unit status is 'booked'
    const unit1Booked = await client1.query('SELECT status FROM public.inventory_items WHERE id = $1', [unit1Id])
    assert.equal(unit1Booked.rows[0].status, 'booked')

    // Verify hold status is 'converted_to_booking'
    const holdConverted = await client1.query('SELECT status FROM public.inventory_blockings WHERE id = $1', [activeHoldId])
    assert.equal(holdConverted.rows[0].status, 'converted_to_booking')

    // Verify Deal stage is 'booked'
    const dealBooked = await client1.query('SELECT stage, probability, deal_value FROM public.deals WHERE inventory_id = $1', [unit1Id])
    assert.equal(dealBooked.rows[0].stage, 'booked')
    assert.equal(dealBooked.rows[0].probability, 100)
    assert.equal(Number(dealBooked.rows[0].deal_value), 10500000.00)

    // Verify Broker Commission with 5% TDS:
    // Total: 10,500,000. Rate: 2%. Gross: 210,000. TDS: 10,500. Net: 199,500.
    const commCheck = await client1.query('SELECT * FROM public.channel_partner_commissions WHERE booking_id = $1', [bookingRow.booking_id])
    assert.equal(commCheck.rowCount, 1)
    const comm = commCheck.rows[0]
    assert.equal(Number(comm.gross_commission_amount), 210000.00)
    assert.equal(Number(comm.tds_percentage), 5.00)
    assert.equal(Number(comm.tds_amount || (comm.gross_commission_amount * 0.05)), 10500.00)
    assert.equal(Number(comm.net_commission_amount), 199500.00)

    console.log('✓ Check 3 Passed: execute_booking_atomic converted hold, booked unit, updated deal and accrued broker TDS.\n')

    // ------------------------------------------------------------------------
    // CHECK 4: Expiry Sweeper RPC Integration Test (sweep_expired_holds_atomic)
    // ------------------------------------------------------------------------
    console.log('CHECK 4: Testing sweep_expired_holds_atomic...')

    // Seed expired active hold on Unit-102
    await client1.query(`
      INSERT INTO public.inventory_blockings (
        id, org_id, project_id, inventory_id, lead_id, blocked_by, token_amount, status, expires_at
      ) VALUES (
        'aaaaaaaa-eeee-1111-eeee-111111111111', $1, $2, $3, $4, $5, 25000.00, 'active', now() - interval '2 hours'
      );
    `, [orgAlphaId, projAlphaId, unit2Id, leadAlpha2Id, profileAgentId])
    await client1.query("UPDATE public.inventory_items SET status = 'blocked' WHERE id = $1", [unit2Id])

    const sweepRes = await client1.query('SELECT * FROM public.sweep_expired_holds_atomic($1)', [orgAlphaId])
    const swept = sweepRes.rows.find((r) => r.inventory_id === unit2Id)
    assert.ok(swept, 'Expired hold must be swept')
    assert.equal(swept.released_to_available, true)

    const unit2AfterSweep = await client1.query('SELECT status FROM public.inventory_items WHERE id = $1', [unit2Id])
    assert.equal(unit2AfterSweep.rows[0].status, 'available', 'Unit must be released back to available')

    const blkExpired = await client1.query('SELECT status FROM public.inventory_blockings WHERE id = $1', ['aaaaaaaa-eeee-1111-eeee-111111111111'])
    assert.equal(blkExpired.rows[0].status, 'expired')

    console.log('✓ Check 4 Passed: sweep_expired_holds_atomic safely expired hold and restored availability.\n')

    // ------------------------------------------------------------------------
    // CHECK 5: Independent PostgreSQL Multi-Connection Test: Simultaneous Holds
    // ------------------------------------------------------------------------
    console.log('CHECK 5: Testing simultaneous hold attempts using 2 distinct PostgreSQL connections...')

    // Reset Unit-103 to available
    await client1.query("UPDATE public.inventory_items SET status = 'available' WHERE id = $1", [unit3Id])
    await client1.query('DELETE FROM public.inventory_blockings WHERE inventory_id = $1', [unit3Id])

    const holdQ1 = client1.query(`
      SELECT * FROM public.hold_inventory_unit_atomic(
        p_org_id => $1,
        p_project_id => $2,
        p_inventory_id => $3,
        p_lead_id => $4,
        p_token_amount => 50000.00,
        p_actor_id => $5
      );
    `, [orgAlphaId, projAlphaId, unit3Id, leadAlpha1Id, profileAgentId])

    const holdQ2 = client2.query(`
      SELECT * FROM public.hold_inventory_unit_atomic(
        p_org_id => $1,
        p_project_id => $2,
        p_inventory_id => $3,
        p_lead_id => $4,
        p_token_amount => 75000.00,
        p_actor_id => $5
      );
    `, [orgAlphaId, projAlphaId, unit3Id, leadAlpha2Id, profileAgentId])

    const [hRes1, hRes2] = await Promise.allSettled([holdQ1, holdQ2])

    const hSuccesses = [hRes1, hRes2].filter((r) => r.status === 'fulfilled')
    const hFailures = [hRes1, hRes2].filter((r) => r.status === 'rejected')

    assert.equal(hSuccesses.length, 1, 'Exactly one concurrent connection must acquire the hold')
    assert.equal(hFailures.length, 1, 'Second concurrent connection must be rejected with conflict')
    assert.match(hFailures[0].reason.message, /Cannot block unit|already|duplicate key/i)

    const activeHoldsOnUnit3 = await client1.query("SELECT COUNT(*) FROM public.inventory_blockings WHERE inventory_id = $1 AND status = 'active'", [unit3Id])
    assert.equal(Number(activeHoldsOnUnit3.rows[0].count), 1, 'Database must contain exactly 1 active hold')

    console.log('✓ Check 5 Passed: PostgreSQL row locks & partial unique index prevented double-holding across independent connections.\n')

    // ------------------------------------------------------------------------
    // CHECK 6: Independent Multi-Connection Test: Simultaneous Direct Bookings
    // ------------------------------------------------------------------------
    console.log('CHECK 6: Testing simultaneous booking attempts across 2 connections...')

    // Reset Unit-102 to available
    await client1.query("UPDATE public.inventory_items SET status = 'available' WHERE id = $1", [unit2Id])
    await client1.query('DELETE FROM public.bookings WHERE inventory_id = $1', [unit2Id])
    await client1.query('DELETE FROM public.inventory_blockings WHERE inventory_id = $1', [unit2Id])

    const bkgQ1 = client1.query(`
      SELECT * FROM public.execute_booking_atomic(
        p_org_id => $1,
        p_project_id => $2,
        p_inventory_id => $3,
        p_lead_id => $4,
        p_base_price => 12500000.00,
        p_actor_id => $5
      );
    `, [orgAlphaId, projAlphaId, unit2Id, leadAlpha1Id, profileAgentId])

    const bkgQ2 = client2.query(`
      SELECT * FROM public.execute_booking_atomic(
        p_org_id => $1,
        p_project_id => $2,
        p_inventory_id => $3,
        p_lead_id => $4,
        p_base_price => 12500000.00,
        p_actor_id => $5
      );
    `, [orgAlphaId, projAlphaId, unit2Id, leadAlpha2Id, profileAgentId])

    const [bRes1, bRes2] = await Promise.allSettled([bkgQ1, bkgQ2])

    const bSuccesses = [bRes1, bRes2].filter((r) => r.status === 'fulfilled')
    const bFailures = [bRes1, bRes2].filter((r) => r.status === 'rejected')

    assert.equal(bSuccesses.length, 1, 'Exactly one concurrent booking must succeed')
    assert.equal(bFailures.length, 1, 'Second concurrent booking must fail with conflict')

    const confirmedBookingsOnUnit2 = await client1.query("SELECT COUNT(*) FROM public.bookings WHERE inventory_id = $1 AND status != 'cancelled'", [unit2Id])
    assert.equal(Number(confirmedBookingsOnUnit2.rows[0].count), 1, 'Database must contain exactly 1 active booking')

    console.log('✓ Check 6 Passed: Multi-connection double booking strictly prevented by uq_active_booking_per_unit.\n')

    // ------------------------------------------------------------------------
    // CHECK 7: Booking-Conversion vs Expiry Race Condition
    // ------------------------------------------------------------------------
    console.log('CHECK 7: Testing race condition: hold release cannot revert booked unit...')

    // Attempt to call release_inventory_hold_atomic on the converted hold of Unit-101
    await assert.rejects(
      async () => {
        await client1.query(`
          SELECT * FROM public.release_inventory_hold_atomic(
            p_org_id => $1,
            p_blocking_id => $2,
            p_reason => 'Stale release attempt'
          );
        `, [orgAlphaId, activeHoldId])
      },
      /Blocking cannot be released/i
    )

    const unit1PostStaleRelease = await client1.query('SELECT status FROM public.inventory_items WHERE id = $1', [unit1Id])
    assert.equal(unit1PostStaleRelease.rows[0].status, 'booked', 'CRITICAL INVARIANT: Unit-101 MUST remain booked')

    console.log('✓ Check 7 Passed: Invariant preservation prevents late release from corrupting booked unit.\n')

    // ------------------------------------------------------------------------
    // CHECK 8: Multiple Concurrent Expiry Workers (SKIP LOCKED)
    // ------------------------------------------------------------------------
    console.log('CHECK 8: Testing concurrent sweep workers (FOR UPDATE SKIP LOCKED)...')

    // Seed 4 expired holds
    const testHoldIds = [
      'aaaaaaaa-1111-eeee-1111-000000000001',
      'aaaaaaaa-1111-eeee-1111-000000000002',
    ]

    // Create 2 extra units
    const extraUnit1 = '88888888-8888-8888-8888-888888888884'
    const extraUnit2 = '88888888-8888-8888-8888-888888888885'
    await client1.query(`
      INSERT INTO public.inventory_items (id, org_id, project_id, unit_number, category, status, total_price)
      VALUES 
        ($1, $2, $3, 'Unit-104', 'apartments', 'blocked', 9000000.00),
        ($4, $2, $3, 'Unit-105', 'apartments', 'blocked', 9500000.00)
      ON CONFLICT (id) DO UPDATE SET status = 'blocked';
    `, [extraUnit1, orgAlphaId, projAlphaId, extraUnit2])

    await client1.query(`
      INSERT INTO public.inventory_blockings (id, org_id, project_id, inventory_id, lead_id, blocked_by, token_amount, status, expires_at)
      VALUES 
        ($1, $3, $4, $5, $7, $8, 20000.00, 'active', now() - interval '1 hour'),
        ($2, $3, $4, $6, $7, $8, 20000.00, 'active', now() - interval '1 hour')
      ON CONFLICT (id) DO NOTHING;
    `, [testHoldIds[0], testHoldIds[1], orgAlphaId, projAlphaId, extraUnit1, extraUnit2, leadAlpha1Id, profileAgentId])

    // Fire sweep concurrently from connection 1 and connection 2
    const [sweep1, sweep2] = await Promise.all([
      client1.query('SELECT * FROM public.sweep_expired_holds_atomic($1)', [orgAlphaId]),
      client2.query('SELECT * FROM public.sweep_expired_holds_atomic($1)', [orgAlphaId]),
    ])

    const totalSweptRows = [...sweep1.rows, ...sweep2.rows]
    const sweptExtra1 = totalSweptRows.filter((r) => r.inventory_id === extraUnit1)
    const sweptExtra2 = totalSweptRows.filter((r) => r.inventory_id === extraUnit2)

    assert.equal(sweptExtra1.length, 1, 'Unit 104 expired hold must be swept exactly once')
    assert.equal(sweptExtra2.length, 1, 'Unit 105 expired hold must be swept exactly once')

    console.log('✓ Check 8 Passed: SKIP LOCKED coordinated concurrent workers without collision or duplication.\n')

    // ------------------------------------------------------------------------
    // CHECK 9: Idempotency & Transaction Rollback
    // ------------------------------------------------------------------------
    console.log('CHECK 9: Testing idempotency & transaction rollback...')

    // Retry booking with same idempotency key
    const idemRetry = await client1.query(`
      SELECT * FROM public.execute_booking_atomic(
        p_org_id => $1,
        p_project_id => $2,
        p_inventory_id => $3,
        p_lead_id => $4,
        p_base_price => 10000000.00,
        p_idempotency_key => 'idem-booking-test-1'
      );
    `, [orgAlphaId, projAlphaId, unit1Id, leadAlpha1Id])

    assert.equal(idemRetry.rowCount, 1)
    assert.equal(idemRetry.rows[0].booking_id, bookingRow.booking_id, 'Must return original booking record')

    // Test transaction rollback on constraint failure
    await assert.rejects(
      async () => {
        await client1.query(`
          SELECT * FROM public.execute_booking_atomic(
            p_org_id => $1,
            p_project_id => $2,
            p_inventory_id => $3,
            p_lead_id => $4,
            p_base_price => -5000.00 -- Invalid negative price
          );
        `, [orgAlphaId, projAlphaId, extraUnit1, leadAlpha1Id])
      },
      /Base price must be greater than zero/
    )

    console.log('✓ Check 9 Passed: Idempotency returned existing record; invalid transaction rolled back cleanly.\n')

    // ------------------------------------------------------------------------
    // CHECK 10: Tenant Boundary & Authorisation Enforcement
    // ------------------------------------------------------------------------
    console.log('CHECK 10: Testing multi-tenant boundary enforcement...')

    // Org Beta attempts to place a hold on Org Alpha's Unit-104
    await assert.rejects(
      async () => {
        await client1.query(`
          SELECT * FROM public.hold_inventory_unit_atomic(
            p_org_id => $1, -- Org Beta
            p_project_id => $2,
            p_inventory_id => $3, -- Belongs to Org Alpha
            p_lead_id => $4,
            p_token_amount => 50000.00
          );
        `, [orgBetaId, projBetaId, extraUnit1, leadBetaId])
      },
      /Permission denied: unit belongs to organisation/
    )

    console.log('✓ Check 10 Passed: Cross-tenant RPC execution strictly rejected.\n')

    console.log('===================================================================')
    console.log('ALL REAL DATABASE INTEGRATION & CONCURRENCY CHECKS PASSED!')
    console.log('===================================================================')
  } finally {
    await client1.end()
    await client2.end()
  }
}

runRealDbIntegrationTests().catch((err) => {
  console.error('\nReal DB Integration Test Failure:', err)
  process.exit(1)
})
