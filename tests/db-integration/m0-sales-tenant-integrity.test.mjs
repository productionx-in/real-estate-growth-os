// tests/db-integration/m0-sales-tenant-integrity.test.mjs
// RE by PX M0 — real-database tests for migration 20260036 (enforce_sales_tenant_integrity).
// Runs against a disposable local Supabase stack (`supabase db reset`). Writes go through a superuser
// connection, which — like the application's service-role client — bypasses RLS but NOT triggers,
// so these tests exercise exactly the path the production DAL uses.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const RUN = crypto.randomBytes(4).toString('hex')

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

async function main() {
  const pg = await import('pg')
  const { Client } = pg.default || pg
  const db = new Client({ connectionString: DATABASE_URL })
  await db.connect()
  const q = (sql, params) => db.query(sql, params)
  const one = async (sql, params) => (await q(sql, params)).rows[0]

  /** Run a statement that must be rejected by the tenant-integrity trigger, inside a savepoint. */
  async function expectRejected(sql, params, pattern = /tenant_integrity/) {
    await q('SAVEPOINT s')
    try {
      await q(sql, params)
      assert.fail(`statement should have been rejected: ${sql}`)
    } catch (err) {
      if (err.code === 'ERR_ASSERTION') throw err
      assert.match(err.message, pattern)
      return err
    } finally {
      await q('ROLLBACK TO SAVEPOINT s')
    }
  }

  console.log('===================================================================')
  console.log('M0 — SALES TENANT INTEGRITY (migration 20260036) REAL-DB TESTS')
  console.log('===================================================================')

  await q('BEGIN') // everything below is rolled back at the end: the suite leaves no data behind

  try {
    // ---------------------------------------------------------------- fixtures
    const mkUser = async (label) => {
      const id = crypto.randomUUID()
      await q(
        `INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud)
         VALUES ($1, '00000000-0000-0000-0000-000000000000', $2, 'x', now(), '{"provider":"email"}', '{}', now(), now(), 'authenticated', 'authenticated')`,
        [id, `m0-${label}-${RUN}@repx.test`]
      )
      const p = await one('SELECT id FROM public.profiles WHERE auth_user_id = $1', [id])
      return p ? p.id : (await one('INSERT INTO public.profiles (auth_user_id, full_name) VALUES ($1, $2) RETURNING id', [id, label])).id
    }
    const mkOrg = async (label) =>
      (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1, $2, 'developer') RETURNING id`, [`M0 ${label}`, `m0-${label}-${RUN}`])).id
    const mkProject = async (org, label) =>
      (await one(`INSERT INTO public.projects (org_id, name, slug) VALUES ($1, $2, $3) RETURNING id`, [org, `P ${label}`, `m0-${label}-${RUN}`])).id
    const mkUnit = async (org, project, label) =>
      (await one(`INSERT INTO public.inventory_items (org_id, project_id, unit_number, category, area_value) VALUES ($1, $2, $3, 'apartments', 1200) RETURNING id`, [org, project, label])).id
    const mkLead = async (org, project, label) =>
      (await one(`INSERT INTO public.leads (org_id, project_id, name, phone) VALUES ($1, $2, $3, $4) RETURNING id`, [org, project, label, `+9190000${Math.floor(Math.random() * 90000 + 10000)}`])).id
    const mkCp = async (org, label) =>
      (await one(`INSERT INTO public.channel_partners (org_id, firm_name, contact_person, phone) VALUES ($1, $2, 'Contact', '+919000000000') RETURNING id`, [org, label])).id

    const orgA = await mkOrg('a')
    const orgB = await mkOrg('b')
    const activeA = await mkUser('active-a')
    const deactivatedA = await mkUser('deactivated-a')
    const memberB = await mkUser('member-b')
    await q(`INSERT INTO public.org_members (org_id, profile_id, role, status) VALUES ($1, $2, 'sales_exec', 'active')`, [orgA, activeA])
    await q(`INSERT INTO public.org_members (org_id, profile_id, role, status) VALUES ($1, $2, 'sales_exec', 'deactivated')`, [orgA, deactivatedA])
    await q(`INSERT INTO public.org_members (org_id, profile_id, role, status) VALUES ($1, $2, 'sales_exec', 'active')`, [orgB, memberB])

    const projA = await mkProject(orgA, 'a1')
    const projA2 = await mkProject(orgA, 'a2')
    const projB = await mkProject(orgB, 'b1')
    const unitA = await mkUnit(orgA, projA, 'A-101')
    const unitA2 = await mkUnit(orgA, projA2, 'A2-101')
    const unitB = await mkUnit(orgB, projB, 'B-101')
    const leadA = await mkLead(orgA, projA, 'Lead A')
    const leadB = await mkLead(orgB, projB, 'Lead B')
    const cpA = await mkCp(orgA, 'CP A')
    const cpB = await mkCp(orgB, 'CP B')

    // ---------------------------------------------------------------- site_visits
    console.log('\nsite_visits')
    const visitSql = `INSERT INTO public.site_visits (org_id, project_id, lead_id, assigned_to, scheduled_at) VALUES ($1, $2, $3, $4, now()) RETURNING id`
    let visitA
    await test('same-organisation site visit is accepted', async () => {
      visitA = (await one(visitSql, [orgA, projA, leadA, activeA])).id
      assert.ok(visitA)
    })
    await test("rejects another tenant's project", async () => { await expectRejected(visitSql, [orgA, projB, leadA, activeA]) })
    await test("rejects another tenant's lead", async () => { await expectRejected(visitSql, [orgA, projA, leadB, activeA]) })
    await test('rejects assignment to a member of another organisation', async () => { await expectRejected(visitSql, [orgA, projA, leadA, memberB]) })
    await test('rejects assignment to a deactivated member', async () => { await expectRejected(visitSql, [orgA, projA, leadA, deactivatedA]) })
    await test('rejects a non-existent project with the SAME message as a foreign one (no existence oracle)', async () => {
      const missing = await expectRejected(visitSql, [orgA, crypto.randomUUID(), leadA, activeA])
      const foreign = await expectRejected(visitSql, [orgA, projB, leadA, activeA])
      assert.equal(missing.message, foreign.message)
      assert.ok(!foreign.message.includes(orgB), 'error must not reveal the other organisation id')
      assert.ok(!foreign.message.includes(projB), 'error must not reveal the foreign record id')
    })
    await test('rejects moving a site visit to another organisation (org_id immutable)', async () => {
      await expectRejected('UPDATE public.site_visits SET org_id = $1 WHERE id = $2', [orgB, visitA])
    })
    await test('rejects re-pointing an existing visit at a foreign lead', async () => {
      await expectRejected('UPDATE public.site_visits SET lead_id = $1 WHERE id = $2', [leadB, visitA])
    })
    await test('unrelated updates still work after the assignee is deactivated (history stays editable)', async () => {
      await q(`UPDATE public.org_members SET status = 'deactivated' WHERE org_id = $1 AND profile_id = $2`, [orgA, activeA])
      await q(`UPDATE public.site_visits SET notes = 'rescheduled by manager' WHERE id = $1`, [visitA])
      await q(`UPDATE public.org_members SET status = 'active' WHERE org_id = $1 AND profile_id = $2`, [orgA, activeA])
    })

    // ---------------------------------------------------------------- deals
    console.log('\ndeals')
    const dealSql = `INSERT INTO public.deals (org_id, project_id, lead_id, inventory_id, channel_partner_id, assigned_to) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`
    await test('same-organisation deal is accepted', async () => { assert.ok((await one(dealSql, [orgA, projA, leadA, unitA, cpA, activeA])).id) })
    await test("rejects another tenant's channel partner", async () => { await expectRejected(dealSql, [orgA, projA, leadA, unitA, cpB, activeA]) })
    await test("rejects another tenant's inventory unit", async () => { await expectRejected(dealSql, [orgA, projA, leadA, unitB, null, activeA]) })
    await test('rejects a unit from a different project of the same organisation', async () => {
      await expectRejected(dealSql, [orgA, projA, leadA, unitA2, null, activeA], /does not belong to the referenced project/)
    })

    // ---------------------------------------------------------------- inventory_blockings
    console.log('\ninventory_blockings')
    const holdSql = `INSERT INTO public.inventory_blockings (org_id, project_id, inventory_id, lead_id, blocked_by, expires_at) VALUES ($1, $2, $3, $4, $5, now() + interval '48 hours') RETURNING id`
    let holdA
    await test('same-organisation hold is accepted', async () => { holdA = (await one(holdSql, [orgA, projA, unitA, leadA, activeA])).id })
    await test("rejects holding another tenant's unit", async () => { await expectRejected(holdSql, [orgA, projB, unitB, leadA, activeA]) })
    await test('rejects blocked_by from another organisation', async () => { await expectRejected(holdSql, [orgA, projA, unitA, leadA, memberB]) })

    // ---------------------------------------------------------------- bookings
    console.log('\nbookings')
    const bookingSql = `INSERT INTO public.bookings (org_id, project_id, inventory_id, lead_id, blocking_id, channel_partner_id, booking_number, base_price, total_amount) VALUES ($1, $2, $3, $4, $5, $6, $7, 5000000, 5000000) RETURNING id`
    let bookingA
    await test('same-organisation booking is accepted', async () => {
      bookingA = (await one(bookingSql, [orgA, projA, unitA, leadA, holdA, cpA, `BK-${RUN}-1`])).id
    })
    await test("rejects another tenant's lead on a booking", async () => { await expectRejected(bookingSql, [orgA, projA, unitA, leadB, null, null, `BK-${RUN}-2`]) })
    await test("rejects another tenant's channel partner on a booking", async () => { await expectRejected(bookingSql, [orgA, projA, unitA, leadA, null, cpB, `BK-${RUN}-3`]) })

    // ---------------------------------------------------------------- channel_partner_commissions
    console.log('\nchannel_partner_commissions')
    const commSql = `INSERT INTO public.channel_partner_commissions (org_id, booking_id, channel_partner_id, commission_rate, gross_commission_amount, net_commission_amount) VALUES ($1, $2, $3, 2, 100000, 95000) RETURNING id`
    await test('same-organisation commission is accepted', async () => { assert.ok((await one(commSql, [orgA, bookingA, cpA])).id) })
    await test("rejects a commission row in org B pointing at org A's booking", async () => { await expectRejected(commSql, [orgB, bookingA, cpB]) })

    // ---------------------------------------------------------------- channel_partners
    console.log('\nchannel_partners')
    await test('rejects moving a channel partner to another organisation', async () => {
      await expectRejected('UPDATE public.channel_partners SET org_id = $1 WHERE id = $2', [orgB, cpA])
    })

    // ---------------------------------------------------------------- catalog
    console.log('\ncatalog')
    await test('trigger is attached to all six sales tables', async () => {
      const r = await q(`SELECT c.relname FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
                         WHERE t.tgfoid = 'public.enforce_sales_tenant_integrity'::regproc AND NOT t.tgisinternal ORDER BY 1`)
      assert.deepEqual(r.rows.map((x) => x.relname),
        ['bookings', 'channel_partner_commissions', 'channel_partners', 'deals', 'inventory_blockings', 'site_visits'])
    })
    await test('trigger function is not executable by anon or authenticated', async () => {
      const r = await one(`SELECT has_function_privilege('anon', 'public.enforce_sales_tenant_integrity()', 'EXECUTE') a,
                                  has_function_privilege('authenticated', 'public.enforce_sales_tenant_integrity()', 'EXECUTE') u`)
      assert.equal(r.a, false)
      assert.equal(r.u, false)
    })
  } finally {
    await q('ROLLBACK').catch(() => {})
    await db.end()
  }

  console.log('\n===================================================================')
  console.log(`ALL ${passed} M0 SALES TENANT INTEGRITY TESTS PASSED`)
  console.log('===================================================================')
}

main().catch((err) => {
  console.error('\nTEST SUITE FAILED:', err?.message || err)
  process.exit(1)
})
