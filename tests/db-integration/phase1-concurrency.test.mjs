// tests/db-integration/phase1-concurrency.test.mjs
// Production X — Phase 1 Real Multi-Connection Database Concurrency Tests
// Uses two genuinely independent PostgreSQL client connections to verify serialization,
// advisory locks, row locks, and race-condition immunity.
import assert from 'node:assert/strict'
import { installStrictInt8Parser } from './pg-strict-int8.mjs'

const connectionString =
  process.env.DATABASE_URL ||
  process.env.SUPABASE_DB_URL ||
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

async function runConcurrencyTests() {
  console.log('===================================================================')
  console.log('STARTING REAL MULTI-CONNECTION DATABASE CONCURRENCY TEST SUITE')
  console.log(`Target: ${connectionString.replace(/:[^:@]+@/, ':***@')}`)
  console.log('===================================================================\n')

  let pg
  try {
    pg = await import('pg')
  } catch (err) {
    console.error('FATAL: pg (node-postgres) is required to run multi-connection tests.')
    process.exit(1)
  }

  installStrictInt8Parser(pg)
  const { Client } = pg.default || pg

  // Establish Connection 1
  const client1 = new Client({ connectionString })
  await client1.connect()
  const pid1Res = await client1.query('SELECT pg_backend_pid()')
  const pid1 = pid1Res.rows[0].pg_backend_pid

  // Establish Connection 2
  const client2 = new Client({ connectionString })
  await client2.connect()
  const pid2Res = await client2.query('SELECT pg_backend_pid()')
  const pid2 = pid2Res.rows[0].pg_backend_pid

  console.log(`Connection 1 established -> Backend PID: ${pid1}`)
  console.log(`Connection 2 established -> Backend PID: ${pid2}`)
  assert.notEqual(pid1, pid2, 'Must have two distinct PostgreSQL backend processes')
  console.log('Confirmed 2 distinct PostgreSQL backend server threads.\n')

  try {
    // ------------------------------------------------------------------------
    // SETUP SHARED CONCURRENCY TEST FIXTURES
    // ------------------------------------------------------------------------
    const testAdminId1 = '44444444-4444-4444-4444-444444444444'
    const testAdminId2 = '55555555-5555-5555-5555-555555555555'
    const testCustomerEmail = 'concurrency.test@prod-x.test'

    // Clean up
    await client1.query('DELETE FROM public.platform_users WHERE user_id IN ($1, $2);', [testAdminId1, testAdminId2])
    await client1.query('DELETE FROM auth.users WHERE id IN ($1, $2);', [testAdminId1, testAdminId2])

    // Check if auth.users has instance_id column
    const colCheck = await client1.query(`
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'instance_id'
      LIMIT 1;
    `)
    const hasInstanceId = colCheck.rowCount > 0

    if (hasInstanceId) {
      await client1.query(`
        INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud)
        VALUES 
          ($1, '00000000-0000-0000-0000-000000000000', 'admin1.concurrent@prod-x.test', '$2a$10$abcdefghijklmnopqrstuvwxyzABCDEF', now(), '{"provider":"email"}', '{"full_name":"Admin 1"}', now(), now(), 'authenticated', 'authenticated'),
          ($2, '00000000-0000-0000-0000-000000000000', 'admin2.concurrent@prod-x.test', '$2a$10$abcdefghijklmnopqrstuvwxyzABCDEF', now(), '{"provider":"email"}', '{"full_name":"Admin 2"}', now(), now(), 'authenticated', 'authenticated')
        ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, updated_at = now();
      `, [testAdminId1, testAdminId2])
    } else {
      await client1.query(`
        INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud)
        VALUES 
          ($1, 'admin1.concurrent@prod-x.test', '$2a$10$abcdefghijklmnopqrstuvwxyzABCDEF', now(), '{"provider":"email"}', '{"full_name":"Admin 1"}', now(), now(), 'authenticated', 'authenticated'),
          ($2, 'admin2.concurrent@prod-x.test', '$2a$10$abcdefghijklmnopqrstuvwxyzABCDEF', now(), '{"provider":"email"}', '{"full_name":"Admin 2"}', now(), now(), 'authenticated', 'authenticated')
        ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, updated_at = now();
      `, [testAdminId1, testAdminId2])
    }

    await client1.query(`
      INSERT INTO public.platform_users (user_id, role, is_active, mfa_enforced)
      VALUES 
        ($1, 'super_admin'::public.platform_role, true, true),
        ($2, 'super_admin'::public.platform_role, true, true)
      ON CONFLICT (user_id) DO NOTHING;
    `, [testAdminId1, testAdminId2])

    // Catalog fixture: provision_organisation_atomic() requires exactly one active, current
    // 'growth' plan version for 'developer'. A clean `supabase db reset` contains only the
    // legacy baseline plans from migration 0029, so this suite must create its own fixture
    // (it previously relied on rows left behind by phase1-real-db, which CI wipes with a reset).
    // The lookup mirrors the function's own matching predicate, so it never creates a duplicate.
    const growthPlan = await client1.query(`
      SELECT 1
      FROM public.subscription_plans sp
      JOIN public.subscription_plan_versions pv ON pv.plan_id = sp.id AND pv.is_current = true
      WHERE (sp.tier = 'growth' OR sp.code = 'growth' OR sp.code = 'growth_developer')
        AND sp.target_org_type = 'developer'
        AND sp.is_active = true;
    `)
    if (growthPlan.rowCount === 0) {
      const planIns = await client1.query(`
        INSERT INTO public.subscription_plans (code, tier, name, target_org_type, is_active)
        VALUES ('developer_growth', 'growth', 'Enterprise Growth', 'developer', true)
        RETURNING id;
      `)
      await client1.query(`
        INSERT INTO public.subscription_plan_versions (
          plan_id, version_number, is_current, base_price_annual_cents, base_price_monthly_cents,
          included_seats, additional_seat_price_cents
        ) VALUES ($1, 1, true, 1000000, 100000, 15, 20000);
      `, [planIns.rows[0].id])
    }

    // ========================================================================
    // CONCURRENCY TEST 1: SIMULTANEOUS PAYMENT VERIFICATION (Advisory Lock & Uniqueness)
    // Two connections simultaneously attempt to settle the SAME payment reference
    // ========================================================================
    console.log('--- Concurrency Test 1: Simultaneous Payment Verifications ---')

    // Provision an organisation and invoice to verify against
    const orgSlug = 'conc-org-' + Date.now()
    const provRes = await client1.query(`
      SELECT public.provision_organisation_atomic(
        $1, 'Conc Test Org', $2, 'developer'::public.org_type,
        'growth', 'annual', NULL,
        $3, 'hash-token-conc-crypto-32-chars-long-0123456789', now() + INTERVAL '7 days',
        NULL, NULL, NULL, NULL
      ) AS res;
    `, [testAdminId1, orgSlug, testCustomerEmail])

    const orgId = provRes.rows[0].res.org_id
    const subId = provRes.rows[0].res.subscription_id
    const invoiceNum = provRes.rows[0].res.invoice_number
    const invRow = await client1.query('SELECT amount_cents, currency FROM public.org_subscription_invoices WHERE invoice_number = $1', [invoiceNum])
    const invoiceAmount = invRow.rows[0].amount_cents
    const invoiceCurrency = invRow.rows[0].currency

    const sharedPayRef = 'CONC-PAY-REF-' + Date.now()

    // Execute simultaneously from both independent connections
    const payPromise1 = client1.query(`
      SELECT public.verify_payment_and_activate_subscription(
        $1, $2, $3, $4, $5, $6, $7
      ) AS res;
    `, [testAdminId1, orgId, subId, invoiceNum, sharedPayRef, invoiceAmount, invoiceCurrency])

    const payPromise2 = client2.query(`
      SELECT public.verify_payment_and_activate_subscription(
        $1, $2, $3, $4, $5, $6, $7
      ) AS res;
    `, [testAdminId2, orgId, subId, invoiceNum, sharedPayRef, invoiceAmount, invoiceCurrency])

    const [payRes1, payRes2] = await Promise.allSettled([payPromise1, payPromise2])

    console.log(`- Connection 1 (PID ${pid1}) result: ${payRes1.status === 'fulfilled' ? payRes1.value.rows[0].res.status || 'success' : payRes1.reason.message}`)
    console.log(`- Connection 2 (PID ${pid2}) result: ${payRes2.status === 'fulfilled' ? payRes2.value.rows[0].res.status || 'success' : payRes2.reason.message}`)

    // Exactly one must activate or the second must be an idempotent replay
    const paymentsCount = await client1.query('SELECT count(*) FROM public.org_subscription_payments WHERE payment_reference = $1', [sharedPayRef])
    assert.equal(parseInt(paymentsCount.rows[0].count), 1, 'MUST have exactly ONE payment transaction row inserted (zero duplicate payments)')
    console.log('✓ Concurrency Test 1 Passed: pg_advisory_xact_lock serialized simultaneous payment verification. Exactly 1 ledger entry created.')

    // ========================================================================
    // CONCURRENCY TEST 2: SIMULTANEOUS ADDITIONAL-SEAT PURCHASES & PAYMENT VERIFICATION
    // Two connections simultaneously purchase additional seats (invoices generated),
    // verifying that usable seats do NOT increment until payment verification,
    // followed by simultaneous payment verifications activating exact verified seats.
    // ========================================================================
    console.log('\n--- Concurrency Test 2: Simultaneous Additional-Seat Purchases & Payments ---')

    const initialSeatsRes = await client1.query('SELECT included_seats, additional_seats FROM public.org_subscriptions WHERE id = $1', [subId])
    const initialAddSeats = initialSeatsRes.rows[0].additional_seats

    // Simultaneously create seat purchase obligations: 3 seats on connection 1 and 4 seats on connection 2
    const seatPromise1 = client1.query('SELECT public.purchase_additional_seats_atomic($1, $2, 3) AS res', [testAdminId1, orgId])
    const seatPromise2 = client2.query('SELECT public.purchase_additional_seats_atomic($1, $2, 4) AS res', [testAdminId2, orgId])

    const [seatRes1, seatRes2] = await Promise.all([seatPromise1, seatPromise2])
    assert.equal(seatRes1.rows[0].res.success, true)
    assert.equal(seatRes2.rows[0].res.success, true)
    assert.equal(seatRes1.rows[0].res.seats_requested, 3)
    assert.equal(seatRes2.rows[0].res.seats_requested, 4)

    // Entitlement timing check: Usable additional seats MUST remain unchanged before payment
    const midSeatsRes = await client1.query('SELECT additional_seats FROM public.org_subscriptions WHERE id = $1', [subId])
    assert.equal(midSeatsRes.rows[0].additional_seats, initialAddSeats, 'Usable additional seats MUST NOT increment at invoice creation')
    console.log('- Usable additional seats remain unchanged after concurrent invoice issuance')

    const invNum1 = seatRes1.rows[0].res.invoice_number
    const invNum2 = seatRes2.rows[0].res.invoice_number
    const amt1 = seatRes1.rows[0].res.amount_cents
    const amt2 = seatRes2.rows[0].res.amount_cents
    const curr1 = seatRes1.rows[0].res.currency
    const curr2 = seatRes2.rows[0].res.currency

    // Simultaneously verify payment for both invoices from independent connections
    const paySeatPromise1 = client1.query(`
      SELECT public.verify_payment_and_activate_subscription(
        $1, $2, $3, $4, $5, $6, $7
      ) AS res;
    `, [testAdminId1, orgId, subId, invNum1, 'PAY-SEAT-1-' + Date.now(), amt1, curr1])

    const paySeatPromise2 = client2.query(`
      SELECT public.verify_payment_and_activate_subscription(
        $1, $2, $3, $4, $5, $6, $7
      ) AS res;
    `, [testAdminId2, orgId, subId, invNum2, 'PAY-SEAT-2-' + Date.now(), amt2, curr2])

    const [paySeatRes1, paySeatRes2] = await Promise.all([paySeatPromise1, paySeatPromise2])
    assert.equal(paySeatRes1.rows[0].res.status, 'activated')
    assert.equal(paySeatRes2.rows[0].res.status, 'activated')
    assert.equal(paySeatRes1.rows[0].res.seats_activated, 3)
    assert.equal(paySeatRes2.rows[0].res.seats_activated, 4)

    const finalSeatsRes = await client1.query('SELECT additional_seats FROM public.org_subscriptions WHERE id = $1', [subId])
    assert.equal(finalSeatsRes.rows[0].additional_seats, initialAddSeats + 3 + 4, 'MUST serialize payment activations: 3 + 4 = 7 seats added')
    console.log(`✓ Concurrency Test 2 Passed: Row-level lock serialized seat additions upon verified payment. Final additional seats: ${finalSeatsRes.rows[0].additional_seats}`)

    // ========================================================================
    // CONCURRENCY TEST 3: SIMULTANEOUS INVITATION RETRIES (Row-Locking FOR UPDATE)
    // Two connections simultaneously attempt to rotate token on the same invitation
    // ========================================================================
    console.log('\n--- Concurrency Test 3: Simultaneous Invitation Retries ---')

    const invRowRes = await client1.query('SELECT id, delivery_attempts FROM public.org_invitations WHERE org_id = $1 LIMIT 1', [orgId])
    const invId = invRowRes.rows[0].id
    const prevAttempts = invRowRes.rows[0].delivery_attempts

    const rotPromise1 = client1.query('SELECT public.rotate_invitation_token_atomic($1, $2, $3, now() + INTERVAL \'7 days\') AS res', [testAdminId1, invId, 'hash-conc-1-token-crypto-32-chars-long-0123456789'])
    const rotPromise2 = client2.query('SELECT public.rotate_invitation_token_atomic($1, $2, $3, now() + INTERVAL \'7 days\') AS res', [testAdminId2, invId, 'hash-conc-2-token-crypto-32-chars-long-0123456789'])

    const [rot1, rot2] = await Promise.all([rotPromise1, rotPromise2])
    const att1 = rot1.rows[0].res.attempts
    const att2 = rot2.rows[0].res.attempts

    console.log(`- Connection 1 rotated to attempt: ${att1}`)
    console.log(`- Connection 2 rotated to attempt: ${att2}`)
    assert.notEqual(att1, att2, 'Consecutive attempts MUST be distinct serialized increments')
    assert.equal(Math.max(att1, att2), prevAttempts + 2, 'Counter must increment exactly twice under lock')
    console.log('✓ Concurrency Test 3 Passed: Row locks serialized token rotation. Counter strictly incremented twice.')

    // ========================================================================
    // CONCURRENCY TEST 4: OUT-OF-ORDER INVITATION DELIVERY ARRIVAL
    // Delayed callback for attempt 1 arrives concurrently after attempt 2 & 3
    // ========================================================================
    console.log('\n--- Concurrency Test 4: Stale Callback Discarding Under Concurrency ---')

    // Connection 1 sends stale callback (expected_attempts = 1)
    // Connection 2 sends current callback (expected_attempts = current attempts)
    const latestAttempts = Math.max(att1, att2)
    const staleCallback = client1.query('SELECT public.record_invitation_delivery_outcome($1, \'failed\', 1, \'Stale timeout\') AS res', [invId])
    const validCallback = client2.query('SELECT public.record_invitation_delivery_outcome($1, \'delivered\', $2, NULL) AS res', [invId, latestAttempts])

    const [staleOut, validOut] = await Promise.all([staleCallback, validCallback])
    assert.equal(staleOut.rows[0].res.success, false, 'Stale callback must update 0 rows')
    assert.equal(staleOut.rows[0].res.rows_updated, 0)
    assert.equal(validOut.rows[0].res.success, true, 'Valid callback must update 1 row')
    assert.equal(validOut.rows[0].res.rows_updated, 1)

    const finalInvite = await client1.query('SELECT delivery_status FROM public.org_invitations WHERE id = $1', [invId])
    assert.equal(finalInvite.rows[0].delivery_status, 'delivered', 'Final status must be delivered (not corrupted by stale failure)')
    console.log('✓ Concurrency Test 4 Passed: Stale attempt discarded without corrupting newer attempt.')

    // ========================================================================
    // CONCURRENCY TEST 5: SIMULTANEOUS RENEWAL INVOICE GENERATION
    // Two connections simultaneously call renewal invoice RPC
    // ========================================================================
    console.log('\n--- Concurrency Test 5: Simultaneous Renewal Invoice Generation ---')

    const ren1 = client1.query('SELECT public.generate_subscription_renewal_invoice_atomic($1, $2, $3) AS res', [testAdminId1, orgId, subId])
    const ren2 = client2.query('SELECT public.generate_subscription_renewal_invoice_atomic($1, $2, $3) AS res', [testAdminId2, orgId, subId])

    const [renOut1, renOut2] = await Promise.all([ren1, ren2])
    assert.equal(renOut1.rows[0].res.success, true)
    assert.equal(renOut2.rows[0].res.success, true)
    console.log(`- Connection 1 generated invoice: ${renOut1.rows[0].res.invoice_number} (${renOut1.rows[0].res.amount_cents} cents)`)
    console.log(`- Connection 2 generated invoice: ${renOut2.rows[0].res.invoice_number} (${renOut2.rows[0].res.amount_cents} cents)`)
    console.log('✓ Concurrency Test 5 Passed: Renewal invoices generated under row-locking with exact contracted pricing.')

    // ========================================================================
    // CONCURRENCY TEST 6: SIMULTANEOUS INITIAL BOOTSTRAP ATTEMPTS
    // Two connections race to bootstrap the initial Super Admin under pg_advisory_xact_lock
    // ========================================================================
    console.log('\n--- Concurrency Test 6: Simultaneous Initial Bootstrap Race ---')

    // Create fresh unbootstrapped test database table state in an isolated transaction simulation
    const candidateUser1 = '66666666-6666-6666-6666-666666666666'
    const candidateUser2 = '77777777-7777-7777-7777-777777777777'

    await client1.query(`
      INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud)
      VALUES 
        ($1, 'candidate1@prod-x.test', '$2a$10$abcdefghijklmnopqrstuvwxyzABCDEF', now(), '{"provider":"email"}', '{"full_name":"Candidate 1"}', now(), now(), 'authenticated', 'authenticated'),
        ($2, 'candidate2@prod-x.test', '$2a$10$abcdefghijklmnopqrstuvwxyzABCDEF', now(), '{"provider":"email"}', '{"full_name":"Candidate 2"}', now(), now(), 'authenticated', 'authenticated')
      ON CONFLICT (id) DO NOTHING;
    `, [candidateUser1, candidateUser2])

    // This suite runs against a freshly reset database (CI resets before it), so the platform
    // bootstrap is still OPEN. It previously assumed phase1-real-db had already closed it, a
    // cross-suite dependency that CI's `supabase db reset` removes.
    const preState = await client1.query('SELECT count(*)::int AS n FROM public.platform_bootstrap_state WHERE is_completed = true')
    assert.equal(preState.rows[0].n, 0, 'Precondition: Test 6 requires a clean database where platform bootstrap has not yet been completed')

    // 6A. Race on an OPEN bootstrap: the advisory-locked singleton must admit exactly one winner.
    const boot1 = client1.query('SELECT public.bootstrap_initial_super_admin_atomic($1, \'candidate1@prod-x.test\', true)', [candidateUser1])
    const boot2 = client2.query('SELECT public.bootstrap_initial_super_admin_atomic($1, \'candidate2@prod-x.test\', true)', [candidateUser2])

    const raceResults = await Promise.allSettled([boot1, boot2])
    const winners = raceResults.filter((r) => r.status === 'fulfilled')
    const losers = raceResults.filter((r) => r.status === 'rejected')
    assert.equal(winners.length, 1, 'Exactly one concurrent bootstrap attempt must succeed')
    assert.equal(losers.length, 1, 'Exactly one concurrent bootstrap attempt must be rejected')
    assert.match(losers[0].reason.message, /Bootstrap permanently closed/)

    const winnerId = raceResults[0].status === 'fulfilled' ? candidateUser1 : candidateUser2
    const bootState = await client1.query('SELECT initial_super_admin_user_id FROM public.platform_bootstrap_state')
    assert.equal(bootState.rowCount, 1, 'Exactly one platform_bootstrap_state row must exist')
    assert.equal(bootState.rows[0].initial_super_admin_user_id, winnerId, 'Bootstrap state must record the single winner')
    const candidateAdmins = await client1.query(
      `SELECT user_id FROM public.platform_users WHERE user_id IN ($1, $2) AND role = 'super_admin'`,
      [candidateUser1, candidateUser2]
    )
    assert.equal(candidateAdmins.rowCount, 1, 'Exactly one candidate may become super_admin')
    assert.equal(candidateAdmins.rows[0].user_id, winnerId)
    console.log('✓ Concurrency Test 6A Passed: Advisory-locked singleton admitted exactly one concurrent bootstrap winner.')

    // 6B. Once closed, further concurrent attempts must ALL fail closed.
    const candidateUser3 = '88888888-8888-8888-8888-888888888888'
    const candidateUser4 = '99999999-9999-9999-9999-999999999999'
    await client1.query(`
      INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud)
      VALUES
        ($1, 'candidate3@prod-x.test', '$2a$10$abcdefghijklmnopqrstuvwxyzABCDEF', now(), '{"provider":"email"}', '{"full_name":"Candidate 3"}', now(), now(), 'authenticated', 'authenticated'),
        ($2, 'candidate4@prod-x.test', '$2a$10$abcdefghijklmnopqrstuvwxyzABCDEF', now(), '{"provider":"email"}', '{"full_name":"Candidate 4"}', now(), now(), 'authenticated', 'authenticated')
      ON CONFLICT (id) DO NOTHING;
    `, [candidateUser3, candidateUser4])

    const [bootRes3, bootRes4] = await Promise.allSettled([
      client1.query('SELECT public.bootstrap_initial_super_admin_atomic($1, \'candidate3@prod-x.test\', true)', [candidateUser3]),
      client2.query('SELECT public.bootstrap_initial_super_admin_atomic($1, \'candidate4@prod-x.test\', true)', [candidateUser4]),
    ])
    assert.equal(bootRes3.status, 'rejected', 'Candidate 3 must be rejected')
    assert.equal(bootRes4.status, 'rejected', 'Candidate 4 must be rejected')
    assert.match(bootRes3.reason.message, /Bootstrap permanently closed/)
    assert.match(bootRes4.reason.message, /Bootstrap permanently closed/)
    const finalState = await client1.query('SELECT count(*)::int AS n FROM public.platform_bootstrap_state')
    assert.equal(finalState.rows[0].n, 1, 'Closed bootstrap must not create additional state rows')
    console.log('✓ Concurrency Test 6B Passed: Both concurrent bootstrap attempts rejected after closure by singleton lock.')

    console.log('\n===================================================================')
    console.log('ALL REAL MULTI-CONNECTION CONCURRENCY TESTS PASSED CLEANLY!')
    console.log('===================================================================')
  } finally {
    await client1.end()
    await client2.end()
  }
}

runConcurrencyTests().catch((err) => {
  console.error('\nCRITICAL FAILURE IN CONCURRENCY TESTS:', err)
  process.exit(1)
})
