// tests/db-integration/subscription-catalog-rls.test.mjs
// Production X — Regression tests for migration 20260035
// (secure_subscription_catalog_and_seat_purchases).
//
// Runs against a disposable local Supabase stack (`supabase start` / `supabase db reset`).
// Attacks go through the REAL PostgREST + GoTrue path using the public anon key and
// real signed-in users, exactly as a browser holding NEXT_PUBLIC_SUPABASE_ANON_KEY would.
// Fixtures and ground-truth reads use a direct superuser connection (DATABASE_URL).
//
// Required env (exported by CI, defaults match `supabase start`):
//   DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'http://127.0.0.1:54321'
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!ANON_KEY || !SERVICE_KEY) {
  console.error('FATAL: NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY must be set (see `supabase status -o env`).')
  process.exit(1)
}

const TABLES = ['subscription_plans', 'subscription_plan_versions', 'org_subscription_seat_purchases']
const RUN = crypto.randomBytes(4).toString('hex')
const PASSWORD = 'Rls-Test-' + crypto.randomBytes(8).toString('hex')

let passed = 0
async function test(name, fn) {
  try {
    await fn()
    passed++
    console.log(`  ✓ ${name}`)
  } catch (err) {
    console.error(`  ✗ ${name}`)
    throw err
  }
}

// CI runs Node 20, which has no native WebSocket; supabase-js constructs its realtime
// client eagerly and throws without one. These tests never open a realtime channel,
// so an inert transport is supplied only when native WebSocket is unavailable.
class UnusedRealtimeTransport {
  constructor() { throw new Error('Realtime is not used by these tests') }
}
const clientOpts = {
  auth: { persistSession: false, autoRefreshToken: false },
  ...(globalThis.WebSocket ? {} : { realtime: { transport: UnusedRealtimeTransport } }),
}
const anon = () => createClient(SUPABASE_URL, ANON_KEY, clientOpts)
const service = createClient(SUPABASE_URL, SERVICE_KEY, clientOpts)

async function signedIn(email) {
  const c = anon()
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`)
  return c
}

/** A client-side write must be refused: either an error, or zero rows affected. */
function assertWriteRefused(res, label) {
  const affected = Array.isArray(res.data) ? res.data.length : res.data ? 1 : 0
  assert.ok(res.error || affected === 0, `${label}: write must be refused (error=${res.error?.message}, rows=${affected})`)
}

async function main() {
  const pg = await import('pg')
  const { Client } = pg.default || pg
  const db = new Client({ connectionString: DATABASE_URL })
  await db.connect()
  const q = (sql, params) => db.query(sql, params)

  console.log('===================================================================')
  console.log('MIGRATION 20260035 — SUBSCRIPTION CATALOG & SEAT PURCHASE RLS TESTS')
  console.log('===================================================================')

  // -------------------------------------------------------------------------
  // Fixtures
  // -------------------------------------------------------------------------
  const users = {}
  for (const key of ['ownerA', 'ownerB', 'salesExecA', 'superAdmin', 'salesRep', 'supportAgent', 'stranger']) {
    const email = `rls-${key.toLowerCase()}-${RUN}@productionx.test`
    const { data, error } = await service.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true })
    if (error) throw new Error(`createUser ${key}: ${error.message}`)
    users[key] = { id: data.user.id, email }
  }
  const profileId = async (authId) => {
    const r = await q('SELECT id FROM public.profiles WHERE auth_user_id = $1', [authId])
    if (r.rowCount) return r.rows[0].id
    const ins = await q('INSERT INTO public.profiles (auth_user_id, full_name) VALUES ($1, $2) RETURNING id', [authId, 'RLS Test'])
    return ins.rows[0].id
  }

  const orgA = (await q(`INSERT INTO public.organisations (name, slug, type) VALUES ($1, $2, 'developer') RETURNING id`, [`RLS Org A ${RUN}`, `rls-a-${RUN}`])).rows[0].id
  const orgB = (await q(`INSERT INTO public.organisations (name, slug, type) VALUES ($1, $2, 'developer') RETURNING id`, [`RLS Org B ${RUN}`, `rls-b-${RUN}`])).rows[0].id

  await q(`INSERT INTO public.org_members (org_id, profile_id, role, status) VALUES ($1, $2, 'owner', 'active')`, [orgA, await profileId(users.ownerA.id)])
  await q(`INSERT INTO public.org_members (org_id, profile_id, role, status) VALUES ($1, $2, 'sales_exec', 'active')`, [orgA, await profileId(users.salesExecA.id)])
  await q(`INSERT INTO public.org_members (org_id, profile_id, role, status) VALUES ($1, $2, 'owner', 'active')`, [orgB, await profileId(users.ownerB.id)])

  // Org A: 2 included seats, both occupied (owner + sales_exec) => zero free seats.
  const subA = (await q(`INSERT INTO public.org_subscriptions (org_id, status, billing_cycle, included_seats, additional_seats)
                         VALUES ($1, 'active', 'annual', 2, 0) RETURNING id`, [orgA])).rows[0].id
  const subB = (await q(`INSERT INTO public.org_subscriptions (org_id, status, billing_cycle, included_seats, additional_seats)
                         VALUES ($1, 'active', 'annual', 5, 0) RETURNING id`, [orgB])).rows[0].id
  const seatB = (await q(`INSERT INTO public.org_subscription_seat_purchases (org_id, subscription_id, seats_added) VALUES ($1, $2, 3) RETURNING id`, [orgB, subB])).rows[0].id

  await q(`INSERT INTO public.platform_users (user_id, role, is_active) VALUES ($1, 'super_admin', true)`, [users.superAdmin.id])
  await q(`INSERT INTO public.platform_users (user_id, role, is_active) VALUES ($1, 'sales_rep', true)`, [users.salesRep.id])
  await q(`INSERT INTO public.platform_users (user_id, role, is_active) VALUES ($1, 'support_agent', true)`, [users.supportAgent.id])

  const planCode = `rls_test_plan_${RUN}`
  const planId = (await q(`INSERT INTO public.subscription_plans (code, name, target_org_type) VALUES ($1, 'RLS Test Plan', 'developer') RETURNING id`, [planCode])).rows[0].id
  const versionId = (await q(`INSERT INTO public.subscription_plan_versions (plan_id, version_number, is_current, included_seats, base_price_monthly_cents, base_price_annual_cents, additional_seat_price_cents)
                              VALUES ($1, 1, false, 5, 500000, 5000000, 100000) RETURNING id`, [planId])).rows[0].id

  const snapshot = async () => ({
    plan: (await q('SELECT name, is_active FROM public.subscription_plans WHERE id = $1', [planId])).rows[0],
    version: (await q('SELECT base_price_monthly_cents, additional_seat_price_cents FROM public.subscription_plan_versions WHERE id = $1', [versionId])).rows[0],
    seatsA: Number((await q(`SELECT COALESCE(SUM(seats_added),0) s FROM public.org_subscription_seat_purchases WHERE org_id = $1`, [orgA])).rows[0].s),
    seatsB: Number((await q(`SELECT COALESCE(SUM(seats_added),0) s FROM public.org_subscription_seat_purchases WHERE org_id = $1`, [orgB])).rows[0].s),
    planCount: Number((await q('SELECT count(*) c FROM public.subscription_plans')).rows[0].c),
  })
  const baseline = await snapshot()

  const invite = (client, email) => client.rpc('reserve_employee_seat_atomic', {
    p_org_id: orgA, p_email: email, p_role: 'sales_exec', p_expires_at: new Date(Date.now() + 86400000).toISOString(),
  })

  try {
    // -----------------------------------------------------------------------
    console.log('\nSection 1: Catalog — RLS state and privileges')
    // -----------------------------------------------------------------------
    for (const t of TABLES) {
      await test(`${t}: RLS enabled, not forced (owner-run SECURITY DEFINER functions keep working)`, async () => {
        const r = await q(`SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid = $1::regclass`, [`public.${t}`])
        assert.equal(r.rows[0].relrowsecurity, true)
        assert.equal(r.rows[0].relforcerowsecurity, false)
      })
      await test(`${t}: anon holds no privilege; authenticated holds SELECT only`, async () => {
        for (const priv of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) {
          const r = await q(`SELECT has_table_privilege('anon', $1, $2) a, has_table_privilege('authenticated', $1, $2) u`, [`public.${t}`, priv])
          assert.equal(r.rows[0].a, false, `anon must not hold ${priv} on ${t}`)
          assert.equal(r.rows[0].u, priv === 'SELECT', `authenticated ${priv} on ${t} must be ${priv === 'SELECT'}`)
        }
      })
      await test(`${t}: only SELECT policies exist (no client write policy)`, async () => {
        const r = await q(`SELECT cmd FROM pg_policies WHERE schemaname = 'public' AND tablename = $1`, [t])
        assert.ok(r.rowCount >= 1, 'at least one explicit policy')
        assert.ok(r.rows.every((p) => p.cmd === 'SELECT'), 'all policies must be SELECT-only')
      })
    }

    // -----------------------------------------------------------------------
    console.log('\nSection 2: anon key (unauthenticated browser) cannot read or modify')
    // -----------------------------------------------------------------------
    const a = anon()
    for (const t of TABLES) {
      await test(`anon cannot read ${t}`, async () => {
        const { data, error } = await a.from(t).select('*')
        assert.ok(error || (data || []).length === 0, `anon read of ${t} must return nothing`)
      })
    }
    await test('anon cannot insert seat purchases (self-granted seats)', async () => {
      assertWriteRefused(await a.from('org_subscription_seat_purchases').insert({ org_id: orgA, subscription_id: subA, seats_added: 1000 }).select(), 'anon insert')
    })
    await test('anon cannot change plan pricing', async () => {
      assertWriteRefused(await a.from('subscription_plan_versions').update({ base_price_monthly_cents: 1 }).eq('id', versionId).select(), 'anon update price')
    })
    await test('anon cannot insert a plan', async () => {
      assertWriteRefused(await a.from('subscription_plans').insert({ code: `evil_${RUN}`, name: 'x', target_org_type: 'developer' }).select(), 'anon insert plan')
    })
    await test('anon cannot delete seat purchases or plans', async () => {
      assertWriteRefused(await a.from('org_subscription_seat_purchases').delete().eq('id', seatB).select(), 'anon delete seats')
      assertWriteRefused(await a.from('subscription_plans').delete().eq('id', planId).select(), 'anon delete plan')
    })

    // -----------------------------------------------------------------------
    console.log('\nSection 3: signed-in customers cannot modify pricing or grant seats')
    // -----------------------------------------------------------------------
    const ownerA = await signedIn(users.ownerA.email)
    const salesExecA = await signedIn(users.salesExecA.email)
    const stranger = await signedIn(users.stranger.email)

    await test('customer owner cannot read the plan catalog or plan versions', async () => {
      for (const t of ['subscription_plans', 'subscription_plan_versions']) {
        const { data, error } = await ownerA.from(t).select('id')
        assert.ok(error || data.length === 0, `owner must not read ${t}`)
      }
    })
    await test('customer owner cannot insert seat purchases for own org', async () => {
      assertWriteRefused(await ownerA.from('org_subscription_seat_purchases').insert({ org_id: orgA, subscription_id: subA, seats_added: 50 }).select(), 'owner insert seats')
    })
    await test('customer owner cannot update another org\'s seat purchase onto own org', async () => {
      assertWriteRefused(await ownerA.from('org_subscription_seat_purchases').update({ org_id: orgA, subscription_id: subA }).eq('id', seatB).select(), 'owner steal seats')
    })
    await test('customer owner cannot change pricing, insert plans or delete plans', async () => {
      assertWriteRefused(await ownerA.from('subscription_plan_versions').update({ additional_seat_price_cents: 0 }).eq('id', versionId).select(), 'owner price')
      assertWriteRefused(await ownerA.from('subscription_plans').insert({ code: `evil2_${RUN}`, name: 'x', target_org_type: 'developer' }).select(), 'owner plan insert')
      assertWriteRefused(await ownerA.from('subscription_plans').delete().eq('id', planId).select(), 'owner plan delete')
    })
    await test('sales_exec and unaffiliated users read no seat purchases', async () => {
      for (const c of [salesExecA, stranger]) {
        const { data, error } = await c.from('org_subscription_seat_purchases').select('id')
        assert.ok(error || data.length === 0)
      }
    })
    await test('customer owner reads only own org seat purchases (none of org B)', async () => {
      const { data, error } = await ownerA.from('org_subscription_seat_purchases').select('id, org_id')
      assert.equal(error, null)
      assert.ok(data.every((r) => r.org_id === orgA), 'no cross-tenant rows')
    })
    await test('org B owner reads own seat purchase', async () => {
      const ownerB = await signedIn(users.ownerB.email)
      const { data, error } = await ownerB.from('org_subscription_seat_purchases').select('id, org_id')
      assert.equal(error, null)
      assert.deepEqual(data.map((r) => r.id), [seatB])
    })

    await test('ground truth: no attack above changed any row', async () => {
      assert.deepEqual(await snapshot(), baseline)
    })

    // -----------------------------------------------------------------------
    console.log('\nSection 4: platform administration continues to work')
    // -----------------------------------------------------------------------
    const superAdmin = await signedIn(users.superAdmin.email)
    const salesRep = await signedIn(users.salesRep.email)
    const supportAgent = await signedIn(users.supportAgent.email)

    await test('super_admin can read plans, versions and all seat purchases', async () => {
      const p = await superAdmin.from('subscription_plans').select('id').eq('id', planId)
      const v = await superAdmin.from('subscription_plan_versions').select('id').eq('id', versionId)
      const s = await superAdmin.from('org_subscription_seat_purchases').select('id').eq('id', seatB)
      assert.equal(p.data?.length, 1, p.error?.message)
      assert.equal(v.data?.length, 1, v.error?.message)
      assert.equal(s.data?.length, 1, s.error?.message)
    })
    await test('sales_rep can read the catalog (provisioning) but not seat purchases', async () => {
      const p = await salesRep.from('subscription_plans').select('id').eq('id', planId)
      assert.equal(p.data?.length, 1, p.error?.message)
      const s = await salesRep.from('org_subscription_seat_purchases').select('id')
      assert.ok(s.error || s.data.length === 0)
    })
    await test('support_agent cannot read the catalog', async () => {
      const p = await supportAgent.from('subscription_plans').select('id')
      assert.ok(p.error || p.data.length === 0)
    })
    await test('super_admin JWT cannot write directly (writes go through audited server routes)', async () => {
      assertWriteRefused(await superAdmin.from('subscription_plan_versions').update({ base_price_monthly_cents: 1 }).eq('id', versionId).select(), 'super_admin direct write')
    })
    await test('service_role (server-side admin operation) can create and edit plan versions', async () => {
      const ins = await service.from('subscription_plan_versions')
        .insert({ plan_id: planId, version_number: 2, is_current: false, included_seats: 7, base_price_monthly_cents: 600000, base_price_annual_cents: 6000000 })
        .select('id').single()
      assert.equal(ins.error, null, ins.error?.message)
      const upd = await service.from('subscription_plans').update({ is_active: true }).eq('id', planId).select('id')
      assert.equal(upd.error, null, upd.error?.message)
      assert.equal(upd.data.length, 1)
    })

    // -----------------------------------------------------------------------
    console.log('\nSection 5: legitimate employee seat reservation is preserved')
    // -----------------------------------------------------------------------
    await test('owner invite is blocked when org A is at capacity', async () => {
      const { data, error } = await invite(ownerA, `full-${RUN}@productionx.test`)
      assert.equal(error, null, error?.message)
      assert.equal(data[0].success, false)
    })
    await test('anon caller is rejected by reserve_employee_seat_atomic', async () => {
      const { data, error } = await invite(anon(), `anon-${RUN}@productionx.test`)
      assert.ok(error || data?.[0]?.success === false)
    })
    await test('authorised server-side seat purchase (service_role) raises capacity', async () => {
      const ins = await service.from('org_subscription_seat_purchases').insert({ org_id: orgA, subscription_id: subA, seats_added: 1 }).select('id').single()
      assert.equal(ins.error, null, ins.error?.message)
    })
    await test('owner invite succeeds using the purchased seat, then capacity is enforced again', async () => {
      const ok = await invite(ownerA, `seat1-${RUN}@productionx.test`)
      assert.equal(ok.error, null, ok.error?.message)
      assert.equal(ok.data[0].success, true, ok.data[0].error_message)
      assert.ok(ok.data[0].invitation_id)
      const over = await invite(ownerA, `seat2-${RUN}@productionx.test`)
      assert.equal(over.data[0].success, false, 'second invite must exceed capacity')
    })
    await test('sales_exec still cannot reserve seats', async () => {
      const r = await invite(salesExecA, `exec-${RUN}@productionx.test`)
      assert.ok(r.error || r.data[0].success === false)
    })

    // -----------------------------------------------------------------------
    console.log('\nSection 6: organisation provisioning still reads the protected catalog')
    // -----------------------------------------------------------------------
    await test('provision_organisation_atomic (service_role) resolves plan & pricing under RLS', async () => {
      // Dedicated current plan for an unambiguous tier/org-type match.
      const existing = await q(`SELECT 1 FROM public.subscription_plans sp JOIN public.subscription_plan_versions pv ON pv.plan_id = sp.id AND pv.is_current
                                WHERE (sp.tier = 'starter' OR sp.code IN ('starter','starter_channel_partner')) AND sp.target_org_type = 'channel_partner' AND sp.is_active`)
      if (existing.rowCount === 0) {
        const pid = (await q(`INSERT INTO public.subscription_plans (code, tier, name, target_org_type) VALUES ('rls_test_cp_starter', 'starter', 'RLS CP Starter', 'channel_partner') RETURNING id`)).rows[0].id
        await q(`INSERT INTO public.subscription_plan_versions (plan_id, version_number, is_current, included_seats, base_price_monthly_cents, base_price_annual_cents, additional_seat_price_cents)
                 VALUES ($1, 1, true, 4, 300000, 3000000, 50000)`, [pid])
      }
      const { data, error } = await service.rpc('provision_organisation_atomic', {
        p_actor_auth_id: users.superAdmin.id,
        p_org_name: `RLS Provisioned ${RUN}`,
        p_org_slug: `rls-prov-${RUN}`,
        p_org_type: 'channel_partner',
        p_plan_tier: 'starter',
        p_billing_cycle: 'annual',
        p_owner_email: `prov-owner-${RUN}@productionx.test`,
        p_invitation_token_hash: crypto.randomBytes(32).toString('hex'),
        p_token_expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
      })
      assert.equal(error, null, error?.message)
      assert.ok(data, 'provisioning must return a result')
      const sub = await q(`SELECT s.included_seats, s.plan_version_id FROM public.org_subscriptions s JOIN public.organisations o ON o.id = s.org_id WHERE o.slug = $1`, [`rls-prov-${RUN}`])
      assert.equal(sub.rowCount, 1)
      assert.ok(sub.rows[0].plan_version_id, 'subscription bound to a catalog plan version')
    })
    await test('authenticated users cannot call provision_organisation_atomic', async () => {
      const { error } = await superAdmin.rpc('provision_organisation_atomic', {
        p_actor_auth_id: users.superAdmin.id, p_org_name: 'x', p_org_slug: `x-${RUN}`, p_org_type: 'developer', p_plan_tier: 'starter', p_billing_cycle: 'annual',
      })
      assert.ok(error, 'must be refused')
    })

    console.log('\n===================================================================')
    console.log(`ALL ${passed} SUBSCRIPTION CATALOG RLS TESTS PASSED`)
    console.log('===================================================================')
  } finally {
    await db.end()
  }
}

main().catch((err) => {
  console.error('\nTEST SUITE FAILED:', err?.message || err)
  process.exit(1)
})
