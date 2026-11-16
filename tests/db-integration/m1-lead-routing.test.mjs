// tests/db-integration/m1-lead-routing.test.mjs
// REGrow M1 — real-database tests for migrations 20260037 (active membership everywhere) and
// 20260038 (teams & lead routing). Routing logic lives in the database trigger, so these tests exercise
// the production code path directly by inserting leads exactly as the application does.
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
  const many = async (sql, params) => (await q(sql, params)).rows

  let inTransaction = false
  /** Statement must fail with `pattern`; its effects are always rolled back. */
  async function expectError(sql, params, pattern) {
    await q(inTransaction ? 'SAVEPOINT e' : 'BEGIN')
    try {
      await q(sql, params)
      assert.fail(`should have failed: ${sql}`)
    } catch (err) {
      if (err.code === 'ERR_ASSERTION') throw err
      assert.match(err.message, pattern)
    } finally {
      await q(inTransaction ? 'ROLLBACK TO SAVEPOINT e' : 'ROLLBACK')
    }
  }

  /** Run fn as an authenticated end user (RLS applies), inside a rolled-back transaction. */
  async function asUser(authUserId, fn) {
    await q('BEGIN')
    inTransaction = true
    try {
      await q(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: authUserId, role: 'authenticated' })])
      await q('SET LOCAL ROLE authenticated')
      return await fn()
    } finally {
      inTransaction = false
      await q('ROLLBACK')
    }
  }

  console.log('===================================================================')
  console.log('M1 — TEAMS & LEAD ROUTING (migrations 20260037, 20260038) REAL-DB TESTS')
  console.log('===================================================================')

  // ------------------------------------------------------------------ fixtures
  let phoneSeq = 0
  const nextPhone = () => `98${RUN.replace(/\D/g, '').padEnd(4, '7').slice(0, 4)}${String(++phoneSeq).padStart(4, '0')}`
  const mkUser = async (label) => {
    const id = crypto.randomUUID()
    await q(`INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud)
             VALUES ($1, '00000000-0000-0000-0000-000000000000', $2, 'x', now(), '{"provider":"email"}', '{}', now(), now(), 'authenticated', 'authenticated')`,
      [id, `m1-${label}-${RUN}@regrow.test`])
    const p = await one('SELECT id FROM public.profiles WHERE auth_user_id = $1', [id])
    const profileId = p ? p.id : (await one('INSERT INTO public.profiles (auth_user_id, full_name) VALUES ($1, $2) RETURNING id', [id, label])).id
    return { authId: id, profileId }
  }
  const mkOrg = async (label) =>
    (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1, $2, 'developer') RETURNING id`, [`M1 ${label} ${RUN}`, `m1-${label}-${RUN}`])).id
  const addMember = (org, user, role, status = 'active') =>
    q(`INSERT INTO public.org_members (org_id, profile_id, role, status) VALUES ($1, $2, $3, $4)`, [org, user.profileId, role, status])
  const mkProject = async (org, label) =>
    (await one(`INSERT INTO public.projects (org_id, name, slug) VALUES ($1, $2, $3) RETURNING id`, [org, `P ${label}`, `m1-${label}-${RUN}`])).id
  const mkTeam = async (org, name) => (await one(`INSERT INTO public.teams (org_id, name) VALUES ($1, $2) RETURNING id`, [org, name])).id
  const addToTeam = (org, team, user, opts = {}) =>
    q(`INSERT INTO public.team_members (org_id, team_id, profile_id, weight, daily_capacity, is_on_duty) VALUES ($1, $2, $3, $4, $5, $6)`,
      [org, team, user.profileId, opts.weight ?? 1, opts.capacity ?? null, opts.onDuty ?? true])
  const mkRule = async (org, team, opts = {}) =>
    (await one(`INSERT INTO public.routing_rules (org_id, name, priority, team_id, strategy, sticky_days, match_project_ids, match_sources)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8::public.lead_source[]) RETURNING id`,
      [org, opts.name ?? 'rule', opts.priority ?? 100, team, opts.strategy ?? 'round_robin', opts.stickyDays ?? 90,
       opts.projects ?? [], opts.sources ?? []])).id
  const mkLead = async (org, opts = {}) =>
    one(`INSERT INTO public.leads (org_id, project_id, name, phone, source, assigned_to)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, assigned_to`,
      [org, opts.project ?? null, opts.name ?? 'Buyer', opts.phone ?? nextPhone(), opts.source ?? 'website', opts.assignedTo ?? null])
  const decision = (leadId) => one(`SELECT outcome, assigned_to, rule_id, team_id, strategy FROM public.lead_routing_decisions WHERE lead_id = $1`, [leadId])

  try {
    // ================================================================ phone normalisation
    console.log('\nphone normalisation (M1-10)')
    await test('Indian mobile formats normalise to the same E.164 value', async () => {
      const forms = ['9876543210', '09876543210', '+91 98765 43210', '91-98765-43210', '+91-9876543210', '0091 9876543210', '(+91) 98765.43210']
      const r = await many(`SELECT public.normalize_phone_in(x) AS e FROM unnest($1::text[]) x`, [forms])
      assert.deepEqual(r.map((x) => x.e), forms.map(() => '+919876543210'))
    })
    await test('international numbers keep their country code; garbage is NULL', async () => {
      const r = await one(`SELECT public.normalize_phone_in('+971 50 123 4567') a, public.normalize_phone_in('+1 (415) 555-0100') b,
                                  public.normalize_phone_in('12345') c, public.normalize_phone_in('') d, public.normalize_phone_in(NULL) e`)
      assert.deepEqual(r, { a: '+971501234567', b: '+14155550100', c: null, d: null, e: null })
    })

    // ================================================================ 0037: active membership
    console.log('\nactive membership everywhere (migration 20260037)')
    const legacyOrg = await mkOrg('legacy')
    const lgActive = await mkUser('lg-active')
    const lgDeact = await mkUser('lg-deact')
    await addMember(legacyOrg, lgDeact, 'sales_exec', 'deactivated') // joined first: legacy used to pick this one
    await addMember(legacyOrg, lgActive, 'sales_exec')

    await test('legacy distribution (no rules) never assigns to a deactivated sales exec', async () => {
      const lead = await mkLead(legacyOrg)
      assert.equal(lead.assigned_to, lgActive.profileId)
    })
    await test('a lead cannot be explicitly assigned to a deactivated member', async () => {
      await expectError(`INSERT INTO public.leads (org_id, name, phone, source, assigned_to) VALUES ($1, 'X', '9000000001', 'website', $2)`,
        [legacyOrg, lgDeact.profileId], /not an active member/)
    })
    await test('auth_is_member_of_org is false for a deactivated member (RLS reads)', async () => {
      const active = await asUser(lgActive.authId, () => one(`SELECT public.auth_is_member_of_org($1) m`, [legacyOrg]))
      const deact = await asUser(lgDeact.authId, () => one(`SELECT public.auth_is_member_of_org($1) m`, [legacyOrg]))
      assert.equal(active.m, true)
      assert.equal(deact.m, false)
    })

    // ================================================================ routing fixtures
    const org = await mkOrg('routing')
    const other = await mkOrg('other')
    const mgr = await mkUser('mgr'); await addMember(org, mgr, 'manager')
    const a = await mkUser('a'); await addMember(org, a, 'sales_exec')
    const b = await mkUser('b'); await addMember(org, b, 'sales_exec')
    const c = await mkUser('c'); await addMember(org, c, 'sales_exec')
    const d = await mkUser('d'); await addMember(org, d, 'sales_exec')
    const ro = await mkUser('ro'); await addMember(org, ro, 'readonly')
    const outsider = await mkUser('outsider'); await addMember(other, outsider, 'sales_exec')
    const projLuxury = await mkProject(org, 'luxury')
    const projPlots = await mkProject(org, 'plots')
    const projOther = await mkProject(other, 'other')

    const teamLux = await mkTeam(org, 'Luxury')
    const teamPortal = await mkTeam(org, 'Portal Desk')
    await addToTeam(org, teamLux, a)
    await addToTeam(org, teamLux, b)
    await addToTeam(org, teamLux, c)
    await addToTeam(org, teamPortal, d)

    // ================================================================ integrity of new tables
    console.log('\nrouting tables integrity')
    await test('cannot add a member of another organisation to a team', async () => {
      await expectError(`INSERT INTO public.team_members (org_id, team_id, profile_id) VALUES ($1, $2, $3)`, [org, teamLux, outsider.profileId], /active, non-readonly member/)
    })
    await test('cannot add a readonly member to a team', async () => {
      await expectError(`INSERT INTO public.team_members (org_id, team_id, profile_id) VALUES ($1, $2, $3)`, [org, teamLux, ro.profileId], /active, non-readonly member/)
    })
    await test("a rule cannot target another organisation's project", async () => {
      await expectError(`INSERT INTO public.routing_rules (org_id, name, team_id, match_project_ids) VALUES ($1, 'bad', $2, $3)`, [org, teamLux, [projOther]], /match_project_ids/)
    })
    await test("a rule cannot target another organisation's team", async () => {
      const otherTeam = await mkTeam(other, 'Other team')
      await expectError(`INSERT INTO public.routing_rules (org_id, name, team_id) VALUES ($1, 'bad', $2)`, [org, otherTeam], /team is not valid/)
    })

    // ================================================================ rule matching
    console.log('\nrule matching')
    const ruleLux = await mkRule(org, teamLux, { name: 'Luxury project', priority: 10, projects: [projLuxury] })
    const rulePortal = await mkRule(org, teamPortal, { name: 'Portal leads', priority: 20, sources: ['99acres', 'magicbricks', 'housing'] })

    await test('project rule routes to its team and logs the decision', async () => {
      const lead = await mkLead(org, { project: projLuxury, source: 'meta_ads' })
      assert.ok([a, b, c].map((u) => u.profileId).includes(lead.assigned_to))
      const dec = await decision(lead.id)
      assert.equal(dec.outcome, 'assigned')
      assert.equal(dec.rule_id, ruleLux)
      assert.equal(dec.team_id, teamLux)
    })
    await test('source rule routes portal leads to the portal desk', async () => {
      const lead = await mkLead(org, { project: projPlots, source: '99acres' })
      assert.equal(lead.assigned_to, d.profileId)
      assert.equal((await decision(lead.id)).rule_id, rulePortal)
    })
    await test('priority wins when two rules match (lower number first)', async () => {
      const lead = await mkLead(org, { project: projLuxury, source: 'housing' })
      assert.equal((await decision(lead.id)).rule_id, ruleLux)
    })
    await test('no matching rule → lead stays unassigned and the decision is logged', async () => {
      const lead = await mkLead(org, { project: projPlots, source: 'website' })
      assert.equal(lead.assigned_to, null)
      assert.equal((await decision(lead.id)).outcome, 'no_matching_rule')
    })
    await test('an explicit assignee on insert is respected (no routing decision)', async () => {
      const lead = await mkLead(org, { project: projLuxury, assignedTo: b.profileId })
      assert.equal(lead.assigned_to, b.profileId)
      assert.equal(await decision(lead.id), undefined)
    })

    // ================================================================ distribution
    console.log('\ndistribution')
    const fairOrg = await mkOrg('fair')
    const f1 = await mkUser('f1'); await addMember(fairOrg, f1, 'sales_exec')
    const f2 = await mkUser('f2'); await addMember(fairOrg, f2, 'sales_exec')
    const f3 = await mkUser('f3'); await addMember(fairOrg, f3, 'sales_exec')
    const fairTeam = await mkTeam(fairOrg, 'All')
    await addToTeam(fairOrg, fairTeam, f1); await addToTeam(fairOrg, fairTeam, f2); await addToTeam(fairOrg, fairTeam, f3)
    await mkRule(fairOrg, fairTeam, { stickyDays: 0 })
    const countBy = (rows) => rows.reduce((m, r) => ((m[r.assigned_to] = (m[r.assigned_to] || 0) + 1), m), {})

    await test('round robin spreads 9 leads 3/3/3 across three members', async () => {
      const rows = []
      for (let i = 0; i < 9; i++) rows.push(await mkLead(fairOrg))
      assert.deepEqual(Object.values(countBy(rows)).sort(), [3, 3, 3])
    })

    const wOrg = await mkOrg('weighted')
    const w1 = await mkUser('w1'); await addMember(wOrg, w1, 'sales_exec')
    const w2 = await mkUser('w2'); await addMember(wOrg, w2, 'sales_exec')
    const wTeam = await mkTeam(wOrg, 'Weighted')
    await addToTeam(wOrg, wTeam, w1, { weight: 2 }); await addToTeam(wOrg, wTeam, w2, { weight: 1 })
    await mkRule(wOrg, wTeam, { stickyDays: 0 })
    await test('weights are honoured (2:1 → 6 and 3 of 9 leads)', async () => {
      const rows = []
      for (let i = 0; i < 9; i++) rows.push(await mkLead(wOrg))
      const counts = countBy(rows)
      assert.equal(counts[w1.profileId], 6)
      assert.equal(counts[w2.profileId], 3)
    })

    const capOrg = await mkOrg('capacity')
    const k1 = await mkUser('k1'); await addMember(capOrg, k1, 'sales_exec')
    const k2 = await mkUser('k2'); await addMember(capOrg, k2, 'sales_exec')
    const k3 = await mkUser('k3'); await addMember(capOrg, k3, 'sales_exec')
    const k4 = await mkUser('k4'); await addMember(capOrg, k4, 'sales_exec', 'active')
    const capTeam = await mkTeam(capOrg, 'Capacity')
    await addToTeam(capOrg, capTeam, k1, { capacity: 1 })
    await addToTeam(capOrg, capTeam, k2, { onDuty: false })
    await addToTeam(capOrg, capTeam, k3)
    await addToTeam(capOrg, capTeam, k4)
    await q(`INSERT INTO public.member_leaves (org_id, profile_id, starts_on, ends_on) VALUES ($1, $2, (now() AT TIME ZONE 'Asia/Kolkata')::date, (now() AT TIME ZONE 'Asia/Kolkata')::date)`, [capOrg, k3.profileId])
    await q(`UPDATE public.org_members SET status = 'deactivated' WHERE org_id = $1 AND profile_id = $2`, [capOrg, k4.profileId])
    await mkRule(capOrg, capTeam, { stickyDays: 0 })
    await test('off-duty, on-leave and deactivated members are skipped; capacity is enforced', async () => {
      const first = await mkLead(capOrg)
      assert.equal(first.assigned_to, k1.profileId, 'only k1 is eligible')
      const second = await mkLead(capOrg)
      assert.equal(second.assigned_to, null, 'k1 reached daily capacity of 1')
      const dec = await decision(second.id)
      assert.equal(dec.outcome, 'no_available_member')
    })

    const loOrg = await mkOrg('leastopen')
    const l1 = await mkUser('l1'); await addMember(loOrg, l1, 'sales_exec')
    const l2 = await mkUser('l2'); await addMember(loOrg, l2, 'sales_exec')
    const loTeam = await mkTeam(loOrg, 'Least open')
    await addToTeam(loOrg, loTeam, l1); await addToTeam(loOrg, loTeam, l2)
    for (let i = 0; i < 3; i++) await mkLead(loOrg, { assignedTo: l1.profileId }) // l1 already busy (manual)
    await mkRule(loOrg, loTeam, { strategy: 'least_open', stickyDays: 0 })
    await test('least_open strategy picks the member with fewer open leads', async () => {
      assert.equal((await mkLead(loOrg)).assigned_to, l2.profileId)
    })

    // ================================================================ stickiness
    console.log('\nstickiness')
    const stOrg = await mkOrg('sticky')
    const s1 = await mkUser('s1'); await addMember(stOrg, s1, 'sales_exec')
    const s2 = await mkUser('s2'); await addMember(stOrg, s2, 'sales_exec')
    const stTeam = await mkTeam(stOrg, 'Sticky')
    await addToTeam(stOrg, stTeam, s1); await addToTeam(stOrg, stTeam, s2)
    await mkRule(stOrg, stTeam, { stickyDays: 90 })
    await test('a returning buyer (different phone formatting) goes back to the same owner', async () => {
      const firstLead = await mkLead(stOrg, { phone: '9123456780' })
      for (let i = 0; i < 3; i++) {
        const again = await mkLead(stOrg, { phone: ['+91 91234 56780', '091234-56780', '91 9123456780'][i] })
        assert.equal(again.assigned_to, firstLead.assigned_to)
        assert.equal((await decision(again.id)).outcome, 'sticky')
      }
    })
    await test('stickiness is skipped when the previous owner has been deactivated', async () => {
      const firstLead = await mkLead(stOrg, { phone: '9223456780' })
      await q(`UPDATE public.org_members SET status = 'deactivated' WHERE org_id = $1 AND profile_id = $2`, [stOrg, firstLead.assigned_to])
      const again = await mkLead(stOrg, { phone: '+919223456780' })
      assert.notEqual(again.assigned_to, firstLead.assigned_to)
      assert.equal((await decision(again.id)).outcome, 'assigned')
      await q(`UPDATE public.org_members SET status = 'active' WHERE org_id = $1 AND profile_id = $2`, [stOrg, firstLead.assigned_to])
    })

    // ================================================================ concurrency
    console.log('\nconcurrency')
    const ccOrg = await mkOrg('concurrent')
    const c1 = await mkUser('c1'); await addMember(ccOrg, c1, 'sales_exec')
    const c2 = await mkUser('c2'); await addMember(ccOrg, c2, 'sales_exec')
    const ccTeam = await mkTeam(ccOrg, 'Concurrent')
    await addToTeam(ccOrg, ccTeam, c1); await addToTeam(ccOrg, ccTeam, c2)
    await mkRule(ccOrg, ccTeam, { stickyDays: 0 })
    await test('10 leads inserted concurrently from 10 connections split exactly 5/5', async () => {
      const conns = await Promise.all(Array.from({ length: 10 }, async () => {
        const cl = new Client({ connectionString: DATABASE_URL }); await cl.connect(); return cl
      }))
      try {
        const rows = await Promise.all(conns.map((cl, i) =>
          cl.query(`INSERT INTO public.leads (org_id, name, phone, source) VALUES ($1, $2, $3, 'website') RETURNING assigned_to`,
            [ccOrg, `Concurrent ${i}`, nextPhone()]).then((r) => r.rows[0])))
        assert.deepEqual(Object.values(countBy(rows)).sort(), [5, 5])
      } finally {
        await Promise.all(conns.map((cl) => cl.end()))
      }
    })

    // ================================================================ decision log immutability
    console.log('\ndecision log')
    await test('routing decisions cannot be updated or deleted', async () => {
      const lead = await mkLead(org, { project: projLuxury })
      await expectError(`UPDATE public.lead_routing_decisions SET outcome = 'sticky' WHERE lead_id = $1`, [lead.id], /append-only/)
      await expectError(`UPDATE public.lead_routing_decisions SET rule_id = NULL WHERE lead_id = $1`, [lead.id], /append-only/)
      await expectError(`DELETE FROM public.lead_routing_decisions WHERE lead_id = $1`, [lead.id], /only be removed with their lead/)
    })
    await test('deleting a rule keeps its decisions (reference nulled by cascade, names preserved)', async () => {
      const tmpTeam = await mkTeam(org, 'Temporary desk')
      await addToTeam(org, tmpTeam, a)
      const tmpRule = await mkRule(org, tmpTeam, { name: 'Temporary rule', priority: 1, sources: ['walk_in'], stickyDays: 0 })
      const lead = await mkLead(org, { source: 'walk_in' })
      assert.equal(lead.assigned_to, a.profileId)
      await q(`DELETE FROM public.routing_rules WHERE id = $1`, [tmpRule])
      await q(`DELETE FROM public.teams WHERE id = $1`, [tmpTeam])
      const dec = await one(`SELECT outcome, rule_id, team_id, detail FROM public.lead_routing_decisions WHERE lead_id = $1`, [lead.id])
      assert.deepEqual([dec.outcome, dec.rule_id, dec.team_id], ['assigned', null, null])
      assert.deepEqual([dec.detail.rule_name, dec.detail.team_name], ['Temporary rule', 'Temporary desk'])
    })

    // ================================================================ RLS
    console.log('\nRLS (authenticated end users)')
    await test('sales exec can read teams and rules but cannot change them', async () => {
      await asUser(a.authId, async () => {
        assert.ok((await many(`SELECT id FROM public.teams WHERE org_id = $1`, [org])).length >= 2)
        assert.ok((await many(`SELECT id FROM public.routing_rules WHERE org_id = $1`, [org])).length >= 2)
        await expectError(`INSERT INTO public.routing_rules (org_id, name, team_id) VALUES ($1, 'exec rule', $2)`, [org, teamLux], /row-level security/)
        const upd = await q(`UPDATE public.team_members SET weight = 10 WHERE org_id = $1`, [org])
        assert.equal(upd.rowCount, 0, 'update must affect no rows')
      })
    })
    await test('manager can create teams and rules', async () => {
      await asUser(mgr.authId, async () => {
        const t = await one(`INSERT INTO public.teams (org_id, name) VALUES ($1, 'Weekend desk') RETURNING id`, [org])
        assert.ok(t.id)
        const r = await one(`INSERT INTO public.routing_rules (org_id, name, team_id) VALUES ($1, 'Weekend', $2) RETURNING id`, [org, t.id])
        assert.ok(r.id)
      })
    })
    await test('members of another organisation see nothing', async () => {
      await asUser(outsider.authId, async () => {
        assert.equal((await many(`SELECT id FROM public.teams WHERE org_id = $1`, [org])).length, 0)
        assert.equal((await many(`SELECT id FROM public.routing_rules WHERE org_id = $1`, [org])).length, 0)
        assert.equal((await many(`SELECT id FROM public.lead_routing_decisions WHERE org_id = $1`, [org])).length, 0)
      })
    })
    await test('a sales exec sees only routing decisions that assigned leads to them', async () => {
      await asUser(a.authId, async () => {
        const rows = await many(`SELECT assigned_to FROM public.lead_routing_decisions WHERE org_id = $1`, [org])
        assert.ok(rows.every((r) => r.assigned_to === a.profileId))
      })
    })
    await test('anon has no access to routing tables', async () => {
      for (const t of ['teams', 'team_members', 'member_leaves', 'routing_rules', 'lead_routing_decisions']) {
        const r = await one(`SELECT has_table_privilege('anon', $1, 'SELECT') s, has_table_privilege('anon', $1, 'INSERT') i`, [`public.${t}`])
        assert.deepEqual(r, { s: false, i: false }, t)
      }
    })
  } finally {
    await db.end()
  }

  console.log('\n===================================================================')
  console.log(`ALL ${passed} M1 LEAD ROUTING TESTS PASSED`)
  console.log('===================================================================')
}

main().catch((err) => {
  console.error('\nTEST SUITE FAILED:', err?.message || err)
  process.exit(1)
})
