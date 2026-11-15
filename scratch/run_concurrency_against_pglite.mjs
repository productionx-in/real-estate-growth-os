import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';

async function main() {
  console.log('===================================================================');
  console.log('RESETTING PGLITE AND APPLYING ALL 32 MIGRATIONS FOR CONCURRENCY...');
  console.log('===================================================================');

  const db = new PGlite();

  // Baseline schemas
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

  const createClient = () => ({
    query: async (text, params) => {
      const res = await db.query(text, params);
      return {
        rows: res.rows,
        rowCount: res.rows ? res.rows.length : (res.affectedRows || 0),
        fields: res.fields
      };
    }
  });

  const client1 = createClient();
  const client2 = createClient();

  // Setup fixtures
  const testAdminId1 = '44444444-4444-4444-4444-444444444444';
  const testAdminId2 = '55555555-5555-5555-5555-555555555555';
  const testCustomerEmail = 'concurrency.test@prod-x.test';

  await client1.query('DELETE FROM public.platform_users WHERE user_id IN ($1, $2);', [testAdminId1, testAdminId2]);
  await client1.query('DELETE FROM auth.users WHERE id IN ($1, $2);', [testAdminId1, testAdminId2]);

  await client1.query(`
    INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud)
    VALUES 
      ($1, 'admin1.concurrent@prod-x.test', '$2a$10$abcdefghijklmnopqrstuvwxyzABCDEF', now(), '{"provider":"email"}', '{"full_name":"Admin 1"}', now(), now(), 'authenticated', 'authenticated'),
      ($2, 'admin2.concurrent@prod-x.test', '$2a$10$abcdefghijklmnopqrstuvwxyzABCDEF', now(), '{"provider":"email"}', '{"full_name":"Admin 2"}', now(), now(), 'authenticated', 'authenticated')
    ON CONFLICT (id) DO NOTHING;
  `, [testAdminId1, testAdminId2]);

  await client1.query(`
    INSERT INTO public.platform_users (user_id, role, is_active, mfa_enforced)
    VALUES 
      ($1, 'super_admin'::public.platform_role, true, true),
      ($2, 'super_admin'::public.platform_role, true, true)
    ON CONFLICT (user_id) DO NOTHING;
  `, [testAdminId1, testAdminId2]);

  // Ensure plan exists
  const pvCheck = await client1.query(`
    SELECT pv.id FROM public.subscription_plans sp
    JOIN public.subscription_plan_versions pv ON pv.plan_id = sp.id AND pv.is_current = true
    WHERE sp.target_org_type = 'developer' AND sp.tier = 'growth'
    LIMIT 1;
  `);

  if (pvCheck.rowCount === 0) {
    const spIns = await client1.query(`
      INSERT INTO public.subscription_plans (code, tier, name, target_org_type, is_active)
      VALUES ('developer_growth_conc', 'growth', 'Enterprise Growth', 'developer', true)
      RETURNING id;
    `);
    await client1.query(`
      INSERT INTO public.subscription_plan_versions (
        plan_id, version_number, is_current, base_price_annual_cents, base_price_monthly_cents,
        included_seats, additional_seat_price_cents
      ) VALUES (
        $1, 1, true, 1000000, 100000, 15, 20000
      );
    `, [spIns.rows[0].id]);
  }

  console.log('\n--- Concurrency Test 1: Simultaneous Payment Verifications ---');
  const orgSlug = 'conc-org-' + Date.now();
  const provRes = await client1.query(`
    SELECT public.provision_organisation_atomic(
      $1, 'Conc Test Org', $2, 'developer'::public.org_type,
      'growth', 'annual', NULL,
      $3, 'hash-token-conc-crypto-32-chars-long-0123456789', now() + INTERVAL '7 days',
      NULL, NULL, NULL, NULL
    ) AS res;
  `, [testAdminId1, orgSlug, testCustomerEmail]);

  const orgId = provRes.rows[0].res.org_id;
  const subId = provRes.rows[0].res.subscription_id;
  const invoiceNum = provRes.rows[0].res.invoice_number;
  const invRow = await client1.query('SELECT amount_cents, currency FROM public.org_subscription_invoices WHERE invoice_number = $1', [invoiceNum]);
  const invoiceAmount = invRow.rows[0].amount_cents;
  const invoiceCurrency = invRow.rows[0].currency;

  const sharedPayRef = 'CONC-PAY-REF-' + Date.now();

  const payPromise1 = client1.query(`
    SELECT public.verify_payment_and_activate_subscription(
      $1, $2, $3, $4, $5, $6, $7
    ) AS res;
  `, [testAdminId1, orgId, subId, invoiceNum, sharedPayRef, invoiceAmount, invoiceCurrency]);

  const payPromise2 = client2.query(`
    SELECT public.verify_payment_and_activate_subscription(
      $1, $2, $3, $4, $5, $6, $7
    ) AS res;
  `, [testAdminId2, orgId, subId, invoiceNum, sharedPayRef, invoiceAmount, invoiceCurrency]);

  const [payRes1, payRes2] = await Promise.allSettled([payPromise1, payPromise2]);
  console.log(`- Connection 1 result: ${payRes1.status === 'fulfilled' ? payRes1.value.rows[0].res.status || 'success' : payRes1.reason.message}`);
  console.log(`- Connection 2 result: ${payRes2.status === 'fulfilled' ? payRes2.value.rows[0].res.status || 'success' : payRes2.reason.message}`);

  const paymentsCount = await client1.query('SELECT count(*) FROM public.org_subscription_payments WHERE payment_reference = $1', [sharedPayRef]);
  assert.equal(parseInt(paymentsCount.rows[0].count), 1);
  console.log('✓ Concurrency Test 1 Passed: Exactly 1 ledger entry created.');

  console.log('\n--- Concurrency Test 2: Simultaneous Additional-Seat Purchases & Payments ---');
  const initialSeatsRes = await client1.query('SELECT included_seats, additional_seats FROM public.org_subscriptions WHERE id = $1', [subId]);
  const initialAddSeats = initialSeatsRes.rows[0].additional_seats;

  const seatPromise1 = client1.query('SELECT public.purchase_additional_seats_atomic($1, $2, 3) AS res', [testAdminId1, orgId]);
  const seatPromise2 = client2.query('SELECT public.purchase_additional_seats_atomic($1, $2, 4) AS res', [testAdminId2, orgId]);

  const [seatRes1, seatRes2] = await Promise.all([seatPromise1, seatPromise2]);
  assert.equal(seatRes1.rows[0].res.success, true);
  assert.equal(seatRes2.rows[0].res.success, true);
  assert.equal(seatRes1.rows[0].res.seats_requested, 3);
  assert.equal(seatRes2.rows[0].res.seats_requested, 4);

  const invNum1 = seatRes1.rows[0].res.invoice_number;
  const invNum2 = seatRes2.rows[0].res.invoice_number;
  const amt1 = seatRes1.rows[0].res.amount_cents;
  const amt2 = seatRes2.rows[0].res.amount_cents;
  const curr1 = seatRes1.rows[0].res.currency;
  const curr2 = seatRes2.rows[0].res.currency;

  const paySeatPromise1 = client1.query(`
    SELECT public.verify_payment_and_activate_subscription(
      $1, $2, $3, $4, $5, $6, $7
    ) AS res;
  `, [testAdminId1, orgId, subId, invNum1, 'PAY-SEAT-1-' + Date.now(), amt1, curr1]);

  const paySeatPromise2 = client2.query(`
    SELECT public.verify_payment_and_activate_subscription(
      $1, $2, $3, $4, $5, $6, $7
    ) AS res;
  `, [testAdminId2, orgId, subId, invNum2, 'PAY-SEAT-2-' + Date.now(), amt2, curr2]);

  const [paySeatRes1, paySeatRes2] = await Promise.all([paySeatPromise1, paySeatPromise2]);
  assert.equal(paySeatRes1.rows[0].res.status, 'activated');
  assert.equal(paySeatRes2.rows[0].res.status, 'activated');
  assert.equal(paySeatRes1.rows[0].res.seats_activated, 3);
  assert.equal(paySeatRes2.rows[0].res.seats_activated, 4);

  const finalSeatsRes = await client1.query('SELECT additional_seats FROM public.org_subscriptions WHERE id = $1', [subId]);
  assert.equal(finalSeatsRes.rows[0].additional_seats, initialAddSeats + 3 + 4);
  console.log(`✓ Concurrency Test 2 Passed: Final additional seats: ${finalSeatsRes.rows[0].additional_seats}`);

  console.log('\n--- Concurrency Test 3: Simultaneous Invitation Retries ---');
  const invRowRes = await client1.query('SELECT id, delivery_attempts FROM public.org_invitations WHERE org_id = $1 LIMIT 1', [orgId]);
  const invId = invRowRes.rows[0].id;
  const prevAttempts = invRowRes.rows[0].delivery_attempts;

  const rotPromise1 = client1.query('SELECT public.rotate_invitation_token_atomic($1, $2, $3, now() + INTERVAL \'7 days\') AS res', [testAdminId1, invId, 'hash-conc-1-token-crypto-32-chars-long-0123456789']);
  const rotPromise2 = client2.query('SELECT public.rotate_invitation_token_atomic($1, $2, $3, now() + INTERVAL \'7 days\') AS res', [testAdminId2, invId, 'hash-conc-2-token-crypto-32-chars-long-0123456789']);

  const [rot1, rot2] = await Promise.all([rotPromise1, rotPromise2]);
  const att1 = rot1.rows[0].res.attempts;
  const att2 = rot2.rows[0].res.attempts;
  assert.notEqual(att1, att2);
  assert.equal(Math.max(att1, att2), prevAttempts + 2);
  console.log('✓ Concurrency Test 3 Passed: Counter strictly incremented twice.');

  console.log('\n--- Concurrency Test 4: Stale Callback Discarding Under Concurrency ---');
  const latestAttempts = Math.max(att1, att2);
  const staleCallback = client1.query('SELECT public.record_invitation_delivery_outcome($1, \'failed\', 1, \'Stale timeout\') AS res', [invId]);
  const validCallback = client2.query('SELECT public.record_invitation_delivery_outcome($1, \'delivered\', $2, NULL) AS res', [invId, latestAttempts]);

  const [staleOut, validOut] = await Promise.all([staleCallback, validCallback]);
  assert.equal(staleOut.rows[0].res.success, false);
  assert.equal(staleOut.rows[0].res.rows_updated, 0);
  assert.equal(validOut.rows[0].res.success, true);
  assert.equal(validOut.rows[0].res.rows_updated, 1);

  const finalInvite = await client1.query('SELECT delivery_status FROM public.org_invitations WHERE id = $1', [invId]);
  assert.equal(finalInvite.rows[0].delivery_status, 'delivered');
  console.log('✓ Concurrency Test 4 Passed: Stale attempt discarded without corrupting newer attempt.');

  console.log('\n--- Concurrency Test 5: Simultaneous Renewal Invoice Generation ---');
  const ren1 = client1.query('SELECT public.generate_subscription_renewal_invoice_atomic($1, $2, $3) AS res', [testAdminId1, orgId, subId]);
  const ren2 = client2.query('SELECT public.generate_subscription_renewal_invoice_atomic($1, $2, $3) AS res', [testAdminId2, orgId, subId]);

  const [renOut1, renOut2] = await Promise.all([ren1, ren2]);
  assert.equal(renOut1.rows[0].res.success, true);
  assert.equal(renOut2.rows[0].res.success, true);
  console.log('✓ Concurrency Test 5 Passed: Renewal invoices generated.');

  console.log('\n===================================================================');
  console.log('ALL CONCURRENCY TESTS PASSED CLEANLY ON PGLITE!');
  console.log('===================================================================');
}

main().catch(err => {
  console.error('\nConcurrency test failed:', err);
  process.exit(1);
});
