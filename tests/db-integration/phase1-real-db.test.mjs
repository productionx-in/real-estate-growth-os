// tests/db-integration/phase1-real-db.test.mjs
// Production X — Phase 1 Real Disposable Database Integration Tests
// Executes directly against a running PostgreSQL/Supabase database daemon
import assert from 'node:assert/strict'
import { installStrictInt8Parser } from './pg-strict-int8.mjs'

const connectionString =
  process.env.DATABASE_URL ||
  process.env.SUPABASE_DB_URL ||
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

async function runRealDbIntegrationTests() {
  console.log('===================================================================')
  console.log('STARTING REAL DATABASE INTEGRATION TEST SUITE')
  console.log(`Connecting to: ${connectionString.replace(/:[^:@]+@/, ':***@')}`)
  console.log('===================================================================\n')

  let pg
  try {
    pg = await import('pg')
  } catch (err) {
    console.error('FATAL: pg (node-postgres) is required to run real database tests.')
    console.error('Please ensure pg is installed in the test environment (e.g. npm install pg).')
    process.exit(1)
  }

  installStrictInt8Parser(pg)
  const { Client } = pg.default || pg
  const client = new Client({ connectionString })
  await client.connect()

  // Diagnostic: Query database version and backend pid
  const verRes = await client.query('SELECT version(), current_database(), current_user, pg_backend_pid()')
  console.log('Connected to PostgreSQL Daemon:')
  console.log(`- Database: ${verRes.rows[0].current_database}`)
  console.log(`- User:     ${verRes.rows[0].current_user}`)
  console.log(`- PID:      ${verRes.rows[0].pg_backend_pid}`)
  console.log(`- Version:  ${verRes.rows[0].version}\n`)

  try {
    // ------------------------------------------------------------------------
    // SETUP TEST FIXTURES IN auth.users
    // ------------------------------------------------------------------------
    console.log('Setting up isolated test fixtures in auth.users and public tables...')
    const testAdminUserId = '11111111-1111-1111-1111-111111111111'
    const testApproverAdminUserId = '22222222-2222-2222-2222-222222222222'
    const testCustomerUserId = '33333333-3333-3333-3333-333333333333'
    const testAdminEmail = 'superadmin.integration@productionx.test'
    const testApproverEmail = 'approver.admin@productionx.test'
    const testCustomerEmail = 'customer.owner@productionx.test'

    // Clean up any previous test runs
    await client.query('DELETE FROM public.platform_bootstrap_state WHERE initial_super_admin_user_id IN ($1, $2);', [testAdminUserId, testApproverAdminUserId])
    await client.query('DELETE FROM public.platform_users WHERE user_id IN ($1, $2);', [testAdminUserId, testApproverAdminUserId])
    await client.query('DELETE FROM auth.users WHERE id IN ($1, $2, $3);', [testAdminUserId, testApproverAdminUserId, testCustomerUserId])

    // Check if auth.users has instance_id column
    const colCheck = await client.query(`
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'instance_id'
      LIMIT 1;
    `)
    const hasInstanceId = colCheck.rowCount > 0

    if (hasInstanceId) {
      await client.query(`
        INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud)
        VALUES 
          ($1, '00000000-0000-0000-0000-000000000000', $2, '$2a$10$abcdefghijklmnopqrstuvwxyzABCDEF', now(), '{"provider":"email"}', '{"full_name":"Test Admin"}', now(), now(), 'authenticated', 'authenticated'),
          ($3, '00000000-0000-0000-0000-000000000000', $4, '$2a$10$abcdefghijklmnopqrstuvwxyzABCDEF', now(), '{"provider":"email"}', '{"full_name":"Test Approver"}', now(), now(), 'authenticated', 'authenticated'),
          ($5, '00000000-0000-0000-0000-000000000000', $6, '$2a$10$abcdefghijklmnopqrstuvwxyzABCDEF', now(), '{"provider":"email"}', '{"full_name":"Test Customer"}', now(), now(), 'authenticated', 'authenticated')
        ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, updated_at = now();
      `, [testAdminUserId, testAdminEmail, testApproverAdminUserId, testApproverEmail, testCustomerUserId, testCustomerEmail])
    } else {
      await client.query(`
        INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud)
        VALUES 
          ($1, $2, '$2a$10$abcdefghijklmnopqrstuvwxyzABCDEF', now(), '{"provider":"email"}', '{"full_name":"Test Admin"}', now(), now(), 'authenticated', 'authenticated'),
          ($3, $4, '$2a$10$abcdefghijklmnopqrstuvwxyzABCDEF', now(), '{"provider":"email"}', '{"full_name":"Test Approver"}', now(), now(), 'authenticated', 'authenticated'),
          ($5, $6, '$2a$10$abcdefghijklmnopqrstuvwxyzABCDEF', now(), '{"provider":"email"}', '{"full_name":"Test Customer"}', now(), now(), 'authenticated', 'authenticated')
        ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, updated_at = now();
      `, [testAdminUserId, testAdminEmail, testApproverAdminUserId, testApproverEmail, testCustomerUserId, testCustomerEmail])
    }

    // ========================================================================
    // B. BOOTSTRAP SECURITY TESTS
    // ========================================================================
    console.log('\n--- Section B: Real Bootstrap Security Tests ---')

    // B1: First bootstrap succeeds under valid conditions
    const b1 = await client.query(
      'SELECT public.bootstrap_initial_super_admin_atomic($1, $2, true) AS res',
      [testAdminUserId, testAdminEmail]
    )
    const b1Result = b1.rows[0].res
    assert.equal(b1Result.status, 'bootstrapped', 'Initial bootstrap must return status = bootstrapped')
    assert.equal(b1Result.user_id, testAdminUserId, 'Bootstrap must return target user_id')
    console.log('✓ B1: Initial Super Admin successfully bootstrapped into real database')

    // Verify platform_bootstrap_state singleton and audit log
    const bState = await client.query('SELECT * FROM public.platform_bootstrap_state')
    assert.equal(bState.rowCount, 1, 'platform_bootstrap_state must contain exactly 1 row')
    assert.equal(bState.rows[0].is_completed, true, 'is_completed must be true')
    assert.equal(bState.rows[0].initial_super_admin_user_id, testAdminUserId)
    console.log('✓ B1b: platform_bootstrap_state singleton verified in database')

    // B2: Repeated bootstrap fails closed
    await assert.rejects(
      async () => {
        await client.query(
          'SELECT public.bootstrap_initial_super_admin_atomic($1, $2, true)',
          [testApproverAdminUserId, testApproverEmail]
        )
      },
      /Bootstrap permanently closed/,
      'Repeated bootstrap must be rejected by singleton check'
    )
    console.log('✓ B2: Repeated bootstrap rejected by real database singleton')

    // B3: Bootstrap state is immutable (WORM Trigger)
    await assert.rejects(
      async () => {
        await client.query('DELETE FROM public.platform_bootstrap_state')
      },
      /platform_bootstrap_state is immutable/,
      'WORM trigger must prevent DELETE on platform_bootstrap_state'
    )
    await assert.rejects(
      async () => {
        await client.query('UPDATE public.platform_bootstrap_state SET is_completed = false')
      },
      /platform_bootstrap_state is immutable/,
      'WORM trigger must prevent UPDATE on platform_bootstrap_state'
    )
    console.log('✓ B3: WORM trigger prevented DELETE and UPDATE on bootstrap state')

    // Setup second admin manually as authorized super_admin for two-person approvals
    await client.query(`
      INSERT INTO public.platform_users (user_id, role, is_active, mfa_enforced)
      VALUES ($1, 'super_admin'::public.platform_role, true, true)
      ON CONFLICT (user_id) DO NOTHING;
    `, [testApproverAdminUserId])

    // ========================================================================
    // E. COMMERCIAL OVERRIDES TESTS
    // ========================================================================
    console.log('\n--- Section E: Real Commercial Overrides Tests ---')

    // Ensure plan versions exist for 'developer' organisation type
    const pvCheck = await client.query(`
      SELECT pv.id, sp.tier, sp.target_org_type, pv.base_price_annual_cents, pv.additional_seat_price_cents
      FROM public.subscription_plans sp
      JOIN public.subscription_plan_versions pv ON pv.plan_id = sp.id AND pv.is_current = true
      WHERE sp.target_org_type = 'developer' AND sp.tier = 'growth'
      LIMIT 1;
    `)

    let testPlanVersionId
    if (pvCheck.rowCount > 0) {
      testPlanVersionId = pvCheck.rows[0].id
    } else {
      // Seed minimal plan and plan_version if not present
      const spIns = await client.query(`
        INSERT INTO public.subscription_plans (code, tier, name, target_org_type, is_active)
        VALUES ('developer_growth', 'growth', 'Enterprise Growth', 'developer', true)
        RETURNING id;
      `)
      const pvIns = await client.query(`
        INSERT INTO public.subscription_plan_versions (
          plan_id, version_number, is_current, base_price_annual_cents, base_price_monthly_cents,
          included_seats, additional_seat_price_cents
        ) VALUES (
          $1, 1, true, 1000000, 100000, 15, 20000
        ) RETURNING id;
      `, [spIns.rows[0].id])
      testPlanVersionId = pvIns.rows[0].id
    }

    // E1: Create Commercial Override (Seat & Price)
    const overrideCode = 'COMM-TEST-' + Date.now()
    const ovrRes = await client.query(`
      SELECT public.create_commercial_override_atomic(
        $1, $2, $3, 'developer'::public.org_type, 25, 'Special Pilot Agreement', 850000, NULL, 15000
      ) AS res;
    `, [testAdminUserId, overrideCode, testPlanVersionId])
    const ovrData = ovrRes.rows[0].res
    assert.equal(ovrData.code, overrideCode)
    assert.equal(ovrData.status, 'pending_approval')
    console.log('✓ E1: Commercial override created with pending_approval status')

    // E2: Creator cannot approve their own override (no_self_approval constraint)
    await assert.rejects(
      async () => {
        await client.query(`
          SELECT public.approve_commercial_override_atomic($1, $2);
        `, [testAdminUserId, ovrData.override_id])
      },
      /cannot self-approve|Self-approval prohibited|no_self_approval/,
      'Self-approval must be rejected by database constraint'
    )
    console.log('✓ E2: Creator self-approval strictly rejected by real database constraint')

    // E3: Independent Super Admin approves override
    const appRes = await client.query(`
      SELECT public.approve_commercial_override_atomic($1, $2) AS res;
    `, [testApproverAdminUserId, ovrData.override_id])
    assert.equal(appRes.rows[0].res.status, 'approved')
    console.log('✓ E3: Independent Super Admin approval succeeded')

    // ========================================================================
    // A. ORGANISATION PROVISIONING TESTS
    // ========================================================================
    console.log('\n--- Section A: Real Organisation Provisioning Tests ---')

    const testOrgSlug = 'test-org-' + Date.now()
    const testRawToken = 'test-token-bytes-1234567890abcdef'
    const testTokenHash = 'hash-token-crypto-32-chars-long-abcdef0123456789'

    // A1: Valid organisation provisioning with commercial override
    const provRes = await client.query(`
      SELECT public.provision_organisation_atomic(
        $1, 'Test Realty Ltd', $2, 'developer'::public.org_type,
        'growth', 'annual', NULL,
        $3, $4, now() + INTERVAL '7 days',
        NULL, NULL, NULL, $5
      ) AS res;
    `, [testAdminUserId, testOrgSlug, testCustomerEmail, testTokenHash, overrideCode])

    const provData = provRes.rows[0].res
    assert.equal(provData.status, 'provisioned')
    const createdOrgId = provData.org_id
    const createdSubId = provData.subscription_id
    const createdInvoiceId = provData.invoice_id
    const createdInvoiceNum = provData.invoice_number
    console.log(`✓ A1: Organisation provisioned with atomic subscription, invoice, and invitation: ${createdOrgId}`)

    // Verify snapshot immutability on subscription row
    const subRow = await client.query('SELECT * FROM public.org_subscriptions WHERE id = $1', [createdSubId])
    assert.equal(subRow.rows[0].contracted_base_price_cents, 850000, 'Must record override base price')
    assert.equal(subRow.rows[0].contracted_additional_seat_price_cents, 15000, 'Must record override seat price')
    assert.equal(subRow.rows[0].included_seats, 25, 'Must record override included seats')
    assert.equal(subRow.rows[0].status, 'pending_payment', 'Paid subscription must start in pending_payment')
    console.log('✓ A1b: Contracted pricing snapshot verified on real subscription row')

    // Verify authoritative invoice row
    const invRow = await client.query('SELECT * FROM public.org_subscription_invoices WHERE id = $1', [createdInvoiceId])
    assert.equal(invRow.rows[0].amount_cents, 850000, 'Invoice obligation must equal contracted base price')
    assert.equal(invRow.rows[0].status, 'issued')
    console.log('✓ A1c: Authoritative initial invoice verified in database')

    // ========================================================================
    // C. INVITATIONS & DELIVERY COUNTER TESTS
    // ========================================================================
    console.log('\n--- Section C: Real Invitation Lifecycle & Counter Tests ---')

    const inviteRow = await client.query('SELECT * FROM public.org_invitations WHERE org_id = $1', [createdOrgId])
    assert.equal(inviteRow.rowCount, 1)
    const invitationId = inviteRow.rows[0].id
    assert.equal(inviteRow.rows[0].delivery_attempts, 1, 'Initial provisioning must set delivery_attempts = 1')
    assert.equal(inviteRow.rows[0].delivery_status, 'pending')
    console.log('✓ C1: Initial invitation delivery_attempts = 1 verified')

    // C2: Initial Delivery Outcome recording (Success)
    const del1 = await client.query(`
      SELECT public.record_invitation_delivery_outcome($1, 'delivered', 1, NULL) AS res;
    `, [invitationId])
    assert.equal(del1.rows[0].res.success, true)
    assert.equal(del1.rows[0].res.rows_updated, 1)
    console.log('✓ C2: Initial delivery outcome (attempt 1) recorded as delivered')

    // C3: Retry Token Rotation increments counter to 2
    const newHash = 'hash-retry-2-crypto-32-chars-long-0123456789abcdef'
    const rotRes = await client.query(`
      SELECT public.rotate_invitation_token_atomic($1, $2, $3, now() + INTERVAL '7 days') AS res;
    `, [testAdminUserId, invitationId, newHash])
    assert.equal(rotRes.rows[0].res.attempts, 2, 'First retry must increment attempts to 2')
    console.log('✓ C3: Invitation token rotated atomically; counter incremented to 2')

    // C4: Stale callback from attempt 1 arriving now cannot overwrite attempt 2
    const staleRes = await client.query(`
      SELECT public.record_invitation_delivery_outcome($1, 'failed', 1, 'Late timeout') AS res;
    `, [invitationId])
    assert.equal(staleRes.rows[0].res.success, false, 'Stale expected_attempts = 1 must update 0 rows')
    assert.equal(staleRes.rows[0].res.rows_updated, 0)

    const recheckInvite = await client.query('SELECT delivery_status, delivery_attempts FROM public.org_invitations WHERE id = $1', [invitationId])
    assert.equal(recheckInvite.rows[0].delivery_status, 'pending', 'Status must remain pending (not overwritten by stale callback)')
    assert.equal(recheckInvite.rows[0].delivery_attempts, 2)
    console.log('✓ C4: Out-of-order callback prevented from corrupting newer attempt state')

    // ========================================================================
    // D. PAYMENT VERIFICATION TESTS
    // ========================================================================
    console.log('\n--- Section D: Real Payment Verification Tests ---')

    const paymentRef = 'PAY-REF-' + Date.now()

    // D1: Amount mismatch rejected
    await assert.rejects(
      async () => {
        await client.query(`
          SELECT public.verify_payment_and_activate_subscription(
            $1, $2, $3, $4, $5, 999999, 'INR'
          );
        `, [testAdminUserId, createdOrgId, createdSubId, createdInvoiceNum, paymentRef])
      },
      /does not match invoice obligation/,
      'Payment with mismatched amount must be rejected'
    )
    console.log('✓ D1: Mismatched payment amount strictly rejected')

    // D2: Valid payment verification succeeds
    const payRes = await client.query(`
      SELECT public.verify_payment_and_activate_subscription(
        $1, $2, $3, $4, $5, 850000, 'INR'
      ) AS res;
    `, [testAdminUserId, createdOrgId, createdSubId, createdInvoiceNum, paymentRef])
    assert.equal(payRes.rows[0].res.subscription_status, 'active')
    console.log('✓ D2: Valid payment verified; subscription activated with established anniversary dates')

    // D3: Idempotent replay of same payment reference returns already_verified
    const replayRes = await client.query(`
      SELECT public.verify_payment_and_activate_subscription(
        $1, $2, $3, $4, $5, 850000, 'INR'
      ) AS res;
    `, [testAdminUserId, createdOrgId, createdSubId, createdInvoiceNum, paymentRef])
    assert.equal(replayRes.rows[0].res.status, 'already_verified')
    console.log('✓ D3: Idempotent replay of identical payment reference handled safely')

    // ========================================================================
    // F & G. PRODUCTION CONTRACTED PRICING WORKFLOWS (Renewal & Seat Expansion)
    // ========================================================================
    console.log('\n--- Section F & G: Real Renewal & Additional Seat Expansion Tests ---')

    // Simulate catalog price alteration (+100% price hike)
    await client.query(`
      UPDATE public.subscription_plan_versions
      SET base_price_annual_cents = 2000000, additional_seat_price_cents = 50000
      WHERE id = $1;
    `, [testPlanVersionId])
    console.log('Altered catalog plan version to higher price (2,000,000 / 50,000)...')

    // F1: Generate Renewal Invoice strictly uses customer contracted snapshot
    const renRes = await client.query(`
      SELECT public.generate_subscription_renewal_invoice_atomic($1, $2, $3) AS res;
    `, [testAdminUserId, createdOrgId, createdSubId])
    const renData = renRes.rows[0].res
    assert.equal(renData.success, true)
    // Contracted base was 850,000; additional seats = 0; expected = 850,000
    assert.equal(renData.amount_cents, 850000, 'Renewal amount must strictly use contracted base price, ignoring catalog increase')
    console.log('✓ F1: Production renewal invoice generated using contracted snapshot (850,000 cents)')

    // G1: Additional Seat Purchase strictly uses customer contracted seat price
    // Note: Usable seats are NOT increased at invoice issuance
    const seatRes = await client.query(`
      SELECT public.purchase_additional_seats_atomic($1, $2, 5) AS res;
    `, [testAdminUserId, createdOrgId])
    const seatData = seatRes.rows[0].res
    assert.equal(seatData.success, true)
    assert.equal(seatData.seats_requested, 5)
    assert.equal(seatData.usable_additional_seats, 0, 'Usable additional seats must remain 0 at invoice creation')
    assert.equal(seatData.total_usable_seats, 25, 'Total usable seats must remain 25 before payment verification')
    assert.equal(seatData.status, 'issued_pending_payment')
    // 5 * 15,000 = 75,000 cents (NOT 5 * 50,000 from catalog!)
    assert.equal(seatData.amount_cents, 75000, 'Additional seat purchase must use contracted additional seat price (15,000/seat)')
    const seatInvoiceNum = seatData.invoice_number
    console.log('✓ G1: Additional seat obligation & invoice created at contracted price (75,000 cents); usable seats untouched')

    // Verify database state: usable seats NOT increased
    const subPrePay = await client.query('SELECT additional_seats FROM public.org_subscriptions WHERE id = $1', [createdSubId])
    assert.equal(subPrePay.rows[0].additional_seats, 0, 'Database usable additional seats must remain 0 before payment')

    // Verify invoice row
    const seatInvRow = await client.query('SELECT * FROM public.org_subscription_invoices WHERE invoice_number = $1', [seatInvoiceNum])
    assert.equal(seatInvRow.rows[0].invoice_type, 'additional_seats')
    assert.equal(seatInvRow.rows[0].seat_quantity, 5)
    assert.equal(seatInvRow.rows[0].unit_price_cents, 15000)
    assert.equal(seatInvRow.rows[0].status, 'issued')
    console.log('✓ G2: Seat expansion invoice row verified with invoice_type=additional_seats, quantity=5, status=issued')

    // G3: Payment verification activates the additional seats
    const seatPayRef = 'SEAT-PAY-REF-' + Date.now()
    const verifySeatPay = await client.query(`
      SELECT public.verify_payment_and_activate_subscription(
        $1, $2, $3, $4, $5, 75000, 'INR'
      ) AS res;
    `, [testAdminUserId, createdOrgId, createdSubId, seatInvoiceNum, seatPayRef])
    const verifySeatData = verifySeatPay.rows[0].res
    assert.equal(verifySeatData.status, 'activated')
    assert.equal(verifySeatData.invoice_type, 'additional_seats')
    assert.equal(verifySeatData.seats_activated, 5)
    assert.equal(verifySeatData.total_usable_seats, 30)
    console.log('✓ G3: Payment verified for seat invoice; 5 additional seats activated (total usable: 30)')

    // Verify database state: usable seats NOW increased to 5
    const subPostPay = await client.query('SELECT additional_seats FROM public.org_subscriptions WHERE id = $1', [createdSubId])
    assert.equal(subPostPay.rows[0].additional_seats, 5, 'Database usable additional seats must now be 5')

    // G4: Idempotent replay of same payment reference does not grant seats again
    const replaySeatPay = await client.query(`
      SELECT public.verify_payment_and_activate_subscription(
        $1, $2, $3, $4, $5, 75000, 'INR'
      ) AS res;
    `, [testAdminUserId, createdOrgId, createdSubId, seatInvoiceNum, seatPayRef])
    assert.equal(replaySeatPay.rows[0].res.status, 'already_verified')

    const subPostReplay = await client.query('SELECT additional_seats FROM public.org_subscriptions WHERE id = $1', [createdSubId])
    assert.equal(subPostReplay.rows[0].additional_seats, 5, 'Idempotent replay must not grant additional seats twice')
    console.log('✓ G4: Duplicate payment reference replay strictly handled without double-granting seats')

    console.log('\n===================================================================')
    console.log('ALL REAL DATABASE INTEGRATION TESTS PASSED CLEANLY!')
    console.log('===================================================================')
  } finally {
    await client.end()
  }
}

runRealDbIntegrationTests().catch((err) => {
  console.error('\nCRITICAL FAILURE IN REAL DATABASE INTEGRATION TESTS:', err)
  process.exit(1)
})
