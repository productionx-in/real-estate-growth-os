// tests/db-integration/m3-reporting.test.mjs — lead_response_report() (migration 20260042) on known data.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const RUN = crypto.randomBytes(4).toString('hex')
let passed = 0
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`) } catch (err) { console.error(`  ✗ ${name}`); throw err }
}

async function main() {
  const pg = await import('pg')
  const db = new (pg.default || pg).Client({ connectionString: DATABASE_URL })
  await db.connect()
  const q = (s, p) => db.query(s, p)
  const one = async (s, p) => (await q(s, p)).rows[0]
  console.log('M3 — SPEED-TO-LEAD REPORT (migration 20260042)')
  try {
    const mkUser = async (label) => {
      const id = crypto.randomUUID()
      await q(`INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud)
               VALUES ($1,'00000000-0000-0000-0000-000000000000',$2,'x',now(),'{"provider":"email"}','{}',now(),now(),'authenticated','authenticated')`, [id, `m3-${label}-${RUN}@regrow.test`])
      const p = (await one('SELECT id FROM public.profiles WHERE auth_user_id=$1', [id])).id
      await q(`UPDATE public.profiles SET full_name=$2 WHERE id=$1`, [p, label])
      return p
    }
    const org = (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,'developer') RETURNING id`, [`M3 ${RUN}`, `m3-${RUN}`])).id
    const other = (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,'developer') RETURNING id`, [`M3b ${RUN}`, `m3b-${RUN}`])).id
    const a = await mkUser('Asha'); const r = await mkUser('Ravi')
    await q(`INSERT INTO public.org_members (org_id, profile_id, role) VALUES ($1,$2,'sales_exec'),($1,$3,'sales_exec')`, [org, a, r])
    // Leads with controlled response times (minutes): Asha 1, 3, 10; Ravi 2; one never contacted; one junk; one duplicate (excluded)
    const t0 = new Date(Date.now() - 2 * 86_400_000)
    let n = 0
    const add = async (owner, source, status, responseMin, sla, dup = false) => {
      const created = new Date(t0.getTime() + (n++) * 3600_000)
      const fa = responseMin === null ? null : new Date(created.getTime() + responseMin * 60_000)
      await q(`INSERT INTO public.leads (org_id, name, phone, source, status, assigned_to, created_at) VALUES ($1,$2,$3,$4,'qualified',$5,$6)`,
        [org, `L${n}`, `95${RUN.slice(0, 4).replace(/\D/g, '1')}${String(n).padStart(4, '0')}`, source, owner, created])
      await q(`UPDATE public.leads SET status=$2, first_action_at=$3, sla_state=$4, is_duplicate=$5 WHERE org_id=$1 AND name=$6`,
        [org, status, fa, sla, dup, `L${n}`])
    }
    await add(a, 'meta_ads', 'contacted', 1, 'met')
    await add(a, 'meta_ads', 'site_visit_scheduled', 3, 'met')
    await add(a, 'google_ads', 'booked', 10, 'breached')
    await add(r, 'meta_ads', 'qualified', 2, 'met')
    await add(r, 'housing', 'new', null, 'breached')
    await add(r, 'housing', 'junk', null, null)
    await add(a, 'meta_ads', 'contacted', 0, 'met', true)

    const rep = async (o) => (await one(`SELECT public.lead_response_report($1, now() - interval '7 days', now()) r`, [o])).r
    const report = await rep(org)

    await test('overall: duplicates excluded; median and p90 of response minutes', () => {
      const o = report.overall
      assert.equal(o.leads, 6)
      assert.equal(o.contacted, 4)
      assert.equal(Number(o.median_min), 2.5)       // 1,2,3,10
      assert.equal(Number(o.p90_min), 7.9)          // percentile_cont(0.9) of 1,2,3,10
    })
    await test('overall: on-time, missed, never contacted (junk is not counted as never contacted)', () => {
      const o = report.overall
      assert.deepEqual([o.within_target, o.missed, o.timed, o.never_contacted], [3, 2, 5, 1])
    })
    await test('by salesperson carries names and per-person figures', () => {
      const asha = report.by_rep.find((x) => x.label === 'Asha')
      const ravi = report.by_rep.find((x) => x.label === 'Ravi')
      assert.deepEqual([asha.leads, Number(asha.median_min), asha.booked], [3, 3, 1])
      assert.deepEqual([ravi.leads, ravi.never_contacted, ravi.junk], [3, 1, 1])
    })
    await test('by source: quality figures (junk, qualified-or-better, site visits)', () => {
      const meta = report.by_source.find((x) => x.key === 'meta_ads')
      const housing = report.by_source.find((x) => x.key === 'housing')
      assert.deepEqual([meta.leads, meta.qualified_plus, meta.site_visits], [3, 2, 1])
      assert.deepEqual([housing.leads, housing.junk], [2, 1])
    })
    await test('another organisation sees none of it; empty report has zeroed overall', async () => {
      const empty = await rep(other)
      assert.equal(empty.overall.leads, 0)
      assert.deepEqual([empty.by_rep, empty.by_source], [[], []])
    })
    await test('clients cannot call the report function directly', async () => {
      const r2 = await one(`SELECT has_function_privilege('authenticated', 'public.lead_response_report(uuid, timestamptz, timestamptz)', 'EXECUTE') ok`)
      assert.equal(r2.ok, false)
    })
  } finally {
    await db.end()
  }
  console.log(`\nALL ${passed} M3 REPORTING TESTS PASSED`)
}
main().catch((e) => { console.error('\nTEST SUITE FAILED:', e?.message || e); process.exit(1) })
