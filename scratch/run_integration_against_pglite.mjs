import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';

async function main() {
  console.log('===================================================================');
  console.log('RESETTING PGLITE AND APPLYING ALL 32 MIGRATIONS...');
  console.log('===================================================================');

  const db = new PGlite();

  // Setup Supabase baseline environment
  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE SCHEMA IF NOT EXISTS storage;
    CREATE SCHEMA IF NOT EXISTS extensions;

    DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE ROLE service_role; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE ROLE supabase_admin; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE ROLE supabase_auth_admin; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE ROLE authenticator; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE ROLE dashboard_user; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    CREATE TABLE IF NOT EXISTS auth.users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT UNIQUE,
      encrypted_password TEXT,
      email_confirmed_at TIMESTAMPTZ,
      raw_app_meta_data JSONB DEFAULT '{}'::jsonb,
      raw_user_meta_data JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now(),
      role TEXT DEFAULT 'authenticated',
      aud TEXT DEFAULT 'authenticated'
    );

    CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
      SELECT NULL::UUID;
    $$ LANGUAGE sql STABLE;

    CREATE OR REPLACE FUNCTION auth.role() RETURNS TEXT AS $$
      SELECT 'authenticated'::TEXT;
    $$ LANGUAGE sql STABLE;

    CREATE OR REPLACE FUNCTION auth.jwt() RETURNS JSONB AS $$
      SELECT '{}'::JSONB;
    $$ LANGUAGE sql STABLE;
  `);

  const dir = 'supabase/migrations';
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    await db.exec(sql);
  }
  console.log(`Applied all ${files.length} migrations cleanly.`);

  // Create client wrapper around PGlite
  const client = {
    query: async (text, params) => {
      // PGlite db.query returns { rows, fields } or similar, let's map rowCount:
      const res = await db.query(text, params);
      return {
        rows: res.rows,
        rowCount: res.rows ? res.rows.length : (res.affectedRows || 0),
        fields: res.fields
      };
    }
  };

  console.log('\n===================================================================');
  console.log('RUNNING PHASE 1 REAL DB INTEGRATION SUITE');
  console.log('===================================================================');

  const testAdminUserId = '11111111-1111-1111-1111-111111111111';
  const testApproverAdminUserId = '22222222-2222-2222-2222-222222222222';
  const testCustomerUserId = '33333333-3333-3333-3333-333333333333';
  const testAdminEmail = 'superadmin.integration@productionx.test';
  const testApproverEmail = 'approver.admin@productionx.test';
  const testCustomerEmail = 'customer.owner@productionx.test';

  // Clean up
  await client.query('DELETE FROM public.platform_bootstrap_state WHERE initial_super_admin_user_id IN ($1, $2);', [testAdminUserId, testApproverAdminUserId]);
  await client.query('DELETE FROM public.platform_users WHERE user_id IN ($1, $2);', [testAdminUserId, testApproverAdminUserId]);
  await client.query('DELETE FROM auth.users WHERE id IN ($1, $2, $3);', [testAdminUserId, testApproverAdminUserId, testCustomerUserId]);

  // Insert test users into auth.users
  await client.query(`
    INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud)
    VALUES 
      ($1, $2, '$2a$10$abcdefghijklmnopqrstuvwxyzABCDEF', now(), '{"provider":"email"}', '{"full_name":"Test Admin"}', now(), now(), 'authenticated', 'authenticated'),
      ($3, $4, '$2a$10$abcdefghijklmnopqrstuvwxyzABCDEF', now(), '{"provider":"email"}', '{"full_name":"Test Approver"}', now(), now(), 'authenticated', 'authenticated'),
      ($5, $6, '$2a$10$abcdefghijklmnopqrstuvwxyzABCDEF', now(), '{"provider":"email"}', '{"full_name":"Test Customer"}', now(), now(), 'authenticated', 'authenticated')
    ON CONFLICT (id) DO NOTHING;
  `, [testAdminUserId, testAdminEmail, testApproverAdminUserId, testApproverEmail, testCustomerUserId, testCustomerEmail]);

  // ========================================================================
  // B. BOOTSTRAP SECURITY TESTS
  // ========================================================================
  console.log('\n--- Section B: Real Bootstrap Security Tests ---');
  const b1 = await client.query(
    'SELECT public.bootstrap_initial_super_admin_atomic($1, $2, true) AS res',
    [testAdminUserId, testAdminEmail]
  );
  const b1Result = b1.rows[0].res;
  assert.equal(b1Result.status, 'bootstrapped');
  assert.equal(b1Result.user_id, testAdminUserId);
  console.log('✓ B1: Initial Super Admin successfully bootstrapped into real database');

  const bState = await client.query('SELECT * FROM public.platform_bootstrap_state');
  assert.equal(bState.rowCount, 1);
  assert.equal(bState.rows[0].is_completed, true);
  assert.equal(bState.rows[0].initial_super_admin_user_id, testAdminUserId);
  console.log('✓ B1b: platform_bootstrap_state singleton verified in database');

  await assert.rejects(
    async () => {
      await client.query(
        'SELECT public.bootstrap_initial_super_admin_atomic($1, $2, true)',
        [testApproverAdminUserId, testApproverEmail]
      );
    },
    /Bootstrap permanently closed/
  );
  console.log('✓ B2: Repeated bootstrap rejected by real database singleton');

  await assert.rejects(
    async () => {
      await client.query('DELETE FROM public.platform_bootstrap_state');
    },
    /platform_bootstrap_state is immutable/
  );
  await assert.rejects(
    async () => {
      await client.query('UPDATE public.platform_bootstrap_state SET is_completed = false');
    },
    /platform_bootstrap_state is immutable/
  );
  console.log('✓ B3: WORM trigger prevented DELETE and UPDATE on bootstrap state');

  // Setup second admin manually as authorized super_admin for two-person approvals
  await client.query(`
    INSERT INTO public.platform_users (user_id, role, is_active, mfa_enforced)
    VALUES ($1, 'super_admin'::public.platform_role, true, true)
    ON CONFLICT (user_id) DO NOTHING;
  `, [testApproverAdminUserId]);

  // ========================================================================
  // E. COMMERCIAL OVERRIDES TESTS
  // ========================================================================
  console.log('\n--- Section E: Real Commercial Overrides Tests ---');
  const pvCheck = await client.query(`
    SELECT pv.id, sp.tier, sp.target_org_type, pv.base_price_annual_cents, pv.additional_seat_price_cents
    FROM public.subscription_plans sp
    JOIN public.subscription_plan_versions pv ON pv.plan_id = sp.id AND pv.is_current = true
    WHERE sp.target_org_type = 'developer' AND sp.tier = 'growth'
    LIMIT 1;
  `);

  let testPlanVersionId;
  if (pvCheck.rowCount > 0) {
    testPlanVersionId = pvCheck.rows[0].id;
  } else {
    const spIns = await client.query(`
      INSERT INTO public.subscription_plans (code, tier, name, target_org_type, is_active)
      VALUES ('developer_growth', 'growth', 'Enterprise Growth', 'developer', true)
      RETURNING id;
    `);
    const pvIns = await client.query(`
      INSERT INTO public.subscription_plan_versions (
        plan_id, version_number, is_current, base_price_annual_cents, base_price_monthly_cents,
        included_seats, additional_seat_price_cents
      ) VALUES (
        $1, 1, true, 1000000, 100000, 15, 20000
      ) RETURNING id;
    `, [spIns.rows[0].id]);
    testPlanVersionId = pvIns.rows[0].id;
  }

  const overrideCode = 'COMM-TEST-' + Date.now();
  const ovrRes = await client.query(`
    SELECT public.create_commercial_override_atomic(
      $1, $2, $3, 'developer'::public.org_type, 25, 'Special Pilot Agreement', 850000, NULL, 15000
    ) AS res;
  `, [testAdminUserId, overrideCode, testPlanVersionId]);
  const ovrData = ovrRes.rows[0].res;
  assert.equal(ovrData.code, overrideCode);
  assert.equal(ovrData.status, 'pending_approval');
  console.log('✓ E1: Commercial override created with pending_approval status');

  await assert.rejects(
    async () => {
      await client.query(`
        SELECT public.approve_commercial_override_atomic($1, $2);
      `, [testAdminUserId, ovrData.override_id]);
    },
    /cannot self-approve|Self-approval prohibited|no_self_approval/
  );
  console.log('✓ E2: Creator self-approval strictly rejected by real database constraint');

  const appRes = await client.query(`
    SELECT public.approve_commercial_override_atomic($1, $2) AS res;
  `, [testApproverAdminUserId, ovrData.override_id]);
  assert.equal(appRes.rows[0].res.status, 'approved');
  console.log('✓ E3: Independent Super Admin approval succeeded');

  // ========================================================================
  // A. ORGANISATION PROVISIONING TESTS
  // ========================================================================
  console.log('\n--- Section A: Real Organisation Provisioning Tests ---');
  const testOrgSlug = 'test-org-' + Date.now();
  const testTokenHash = 'hash-token-crypto-32-chars-long-abcdef0123456789';

  const provRes = await client.query(`
    SELECT public.provision_organisation_atomic(
      $1, 'Test Realty Ltd', $2, 'developer'::public.org_type,
      'growth', 'annual', NULL,
      $3, $4, now() + INTERVAL '7 days',
      NULL, NULL, NULL, $5
    ) AS res;
  `, [testAdminUserId, testOrgSlug, testCustomerEmail, testTokenHash, overrideCode]);

  const provData = provRes.rows[0].res;
  assert.equal(provData.status, 'provisioned');
  const createdOrgId = provData.org_id;
  const createdSubId = provData.subscription_id;
  const createdInvoiceId = provData.invoice_id;
  const createdInvoiceNum = provData.invoice_number;
  console.log(`✓ A1: Organisation provisioned with atomic subscription, invoice, and invitation: ${createdOrgId}`);

  const subRow = await client.query('SELECT * FROM public.org_subscriptions WHERE id = $1', [createdSubId]);
  assert.equal(subRow.rows[0].contracted_base_price_cents, 850000);
  assert.equal(subRow.rows[0].contracted_additional_seat_price_cents, 15000);
  assert.equal(subRow.rows[0].included_seats, 25);
  assert.equal(subRow.rows[0].status, 'pending_payment');
  console.log('✓ A1b: Contracted pricing snapshot verified on real subscription row');

  const invRow = await client.query('SELECT * FROM public.org_subscription_invoices WHERE id = $1', [createdInvoiceId]);
  assert.equal(invRow.rows[0].amount_cents, 850000);
  assert.equal(invRow.rows[0].status, 'issued');
  console.log('✓ A1c: Authoritative initial invoice verified in database');

  // ========================================================================
  // C. INVITATIONS & DELIVERY COUNTER TESTS
  // ========================================================================
  console.log('\n--- Section C: Real Invitation Lifecycle & Counter Tests ---');
  const inviteRow = await client.query('SELECT * FROM public.org_invitations WHERE org_id = $1', [createdOrgId]);
  assert.equal(inviteRow.rowCount, 1);
  const invitationId = inviteRow.rows[0].id;
  assert.equal(inviteRow.rows[0].delivery_attempts, 1);
  assert.equal(inviteRow.rows[0].delivery_status, 'pending');
  console.log('✓ C1: Initial invitation delivery_attempts = 1 verified');

  const del1 = await client.query(`
    SELECT public.record_invitation_delivery_outcome($1, 'delivered', 1, NULL) AS res;
  `, [invitationId]);
  assert.equal(del1.rows[0].res.success, true);
  assert.equal(del1.rows[0].res.rows_updated, 1);
  console.log('✓ C2: Initial delivery outcome (attempt 1) recorded as delivered');

  const newHash = 'hash-retry-2-crypto-32-chars-long-0123456789abcdef';
  const rotRes = await client.query(`
    SELECT public.rotate_invitation_token_atomic($1, $2, $3, now() + INTERVAL '7 days') AS res;
  `, [testAdminUserId, invitationId, newHash]);
  assert.equal(rotRes.rows[0].res.attempts, 2);
  console.log('✓ C3: Invitation token rotated atomically; counter incremented to 2');

  const staleRes = await client.query(`
    SELECT public.record_invitation_delivery_outcome($1, 'failed', 1, 'Late timeout') AS res;
  `, [invitationId]);
  assert.equal(staleRes.rows[0].res.success, false);
  assert.equal(staleRes.rows[0].res.rows_updated, 0);

  const recheckInvite = await client.query('SELECT delivery_status, delivery_attempts FROM public.org_invitations WHERE id = $1', [invitationId]);
  assert.equal(recheckInvite.rows[0].delivery_status, 'pending');
  assert.equal(recheckInvite.rows[0].delivery_attempts, 2);
  console.log('✓ C4: Out-of-order callback prevented from corrupting newer attempt state');

  // ========================================================================
  // D. PAYMENT VERIFICATION TESTS
  // ========================================================================
  console.log('\n--- Section D: Real Payment Verification Tests ---');
  const paymentRef = 'PAY-REF-' + Date.now();

  await assert.rejects(
    async () => {
      await client.query(`
        SELECT public.verify_payment_and_activate_subscription(
          $1, $2, $3, $4, $5, 999999, 'INR'
        );
      `, [testAdminUserId, createdOrgId, createdSubId, createdInvoiceNum, paymentRef]);
    },
    /does not match invoice obligation/
  );
  console.log('✓ D1: Mismatched payment amount strictly rejected');

  const payRes = await client.query(`
    SELECT public.verify_payment_and_activate_subscription(
      $1, $2, $3, $4, $5, 850000, 'INR'
    ) AS res;
  `, [testAdminUserId, createdOrgId, createdSubId, createdInvoiceNum, paymentRef]);
  assert.equal(payRes.rows[0].res.subscription_status, 'active');
  console.log('✓ D2: Valid payment verified; subscription activated with established anniversary dates');

  const replayRes = await client.query(`
    SELECT public.verify_payment_and_activate_subscription(
      $1, $2, $3, $4, $5, 850000, 'INR'
    ) AS res;
  `, [testAdminUserId, createdOrgId, createdSubId, createdInvoiceNum, paymentRef]);
  assert.equal(replayRes.rows[0].res.status, 'already_verified');
  console.log('✓ D3: Idempotent replay of identical payment reference handled safely');

  // ========================================================================
  // F & G. PRODUCTION CONTRACTED PRICING WORKFLOWS (Renewal & Seat Expansion)
  // ========================================================================
  console.log('\n--- Section F & G: Real Renewal & Additional Seat Expansion Tests ---');
  await client.query(`
    UPDATE public.subscription_plan_versions
    SET base_price_annual_cents = 2000000, additional_seat_price_cents = 50000
    WHERE id = $1;
  `, [testPlanVersionId]);
  console.log('Altered catalog plan version to higher price (2,000,000 / 50,000)...');

  const renRes = await client.query(`
    SELECT public.generate_subscription_renewal_invoice_atomic($1, $2, $3) AS res;
  `, [testAdminUserId, createdOrgId, createdSubId]);
  const renData = renRes.rows[0].res;
  assert.equal(renData.success, true);
  assert.equal(renData.amount_cents, 850000);
  console.log('✓ F1: Production renewal invoice generated using contracted snapshot (850,000 cents)');

  const seatRes = await client.query(`
    SELECT public.purchase_additional_seats_atomic($1, $2, 5) AS res;
  `, [testAdminUserId, createdOrgId]);
  const seatData = seatRes.rows[0].res;
  assert.equal(seatData.success, true);
  assert.equal(seatData.seats_requested, 5);
  assert.equal(seatData.usable_additional_seats, 0);
  assert.equal(seatData.total_usable_seats, 25);
  assert.equal(seatData.status, 'issued_pending_payment');
  assert.equal(seatData.amount_cents, 75000);
  const seatInvoiceNum = seatData.invoice_number;
  console.log('✓ G1: Additional seat obligation & invoice created at contracted price (75,000 cents); usable seats untouched');

  const subPrePay = await client.query('SELECT additional_seats FROM public.org_subscriptions WHERE id = $1', [createdSubId]);
  assert.equal(subPrePay.rows[0].additional_seats, 0);

  const seatInvRow = await client.query('SELECT * FROM public.org_subscription_invoices WHERE invoice_number = $1', [seatInvoiceNum]);
  assert.equal(seatInvRow.rows[0].invoice_type, 'additional_seats');
  assert.equal(seatInvRow.rows[0].seat_quantity, 5);
  assert.equal(seatInvRow.rows[0].unit_price_cents, 15000);
  assert.equal(seatInvRow.rows[0].status, 'issued');
  console.log('✓ G2: Seat expansion invoice row verified with invoice_type=additional_seats, quantity=5, status=issued');

  const seatPayRef = 'SEAT-PAY-REF-' + Date.now();
  const verifySeatPay = await client.query(`
    SELECT public.verify_payment_and_activate_subscription(
      $1, $2, $3, $4, $5, 75000, 'INR'
    ) AS res;
  `, [testAdminUserId, createdOrgId, createdSubId, seatInvoiceNum, seatPayRef]);
  const verifySeatData = verifySeatPay.rows[0].res;
  assert.equal(verifySeatData.status, 'activated');
  assert.equal(verifySeatData.invoice_type, 'additional_seats');
  assert.equal(verifySeatData.seats_activated, 5);
  assert.equal(verifySeatData.total_usable_seats, 30);
  console.log('✓ G3: Payment verified for seat invoice; 5 additional seats activated (total usable: 30)');

  const subPostPay = await client.query('SELECT additional_seats FROM public.org_subscriptions WHERE id = $1', [createdSubId]);
  assert.equal(subPostPay.rows[0].additional_seats, 5);

  const replaySeatPay = await client.query(`
    SELECT public.verify_payment_and_activate_subscription(
      $1, $2, $3, $4, $5, 75000, 'INR'
    ) AS res;
  `, [testAdminUserId, createdOrgId, createdSubId, seatInvoiceNum, seatPayRef]);
  assert.equal(replaySeatPay.rows[0].res.status, 'already_verified');

  const subPostReplay = await client.query('SELECT additional_seats FROM public.org_subscriptions WHERE id = $1', [createdSubId]);
  assert.equal(subPostReplay.rows[0].additional_seats, 5);
  console.log('✓ G4: Duplicate payment reference replay strictly handled without double-granting seats');

  console.log('\n===================================================================');
  console.log('ALL PHASE 1 REAL DATABASE INTEGRATION TESTS PASSED CLEANLY ON PGLITE!');
  console.log('===================================================================');
}

main().catch(err => {
  console.error('\nTest failed:', err);
  process.exit(1);
});
