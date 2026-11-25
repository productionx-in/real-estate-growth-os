// tests/deal-credit.test.mjs — shared deal credit (lib/sales/deal-credit.ts, migration 20260098): the share rules, who
// may change a split, the closer's remainder, fractional credit in the performance totals with actual deals counted
// apart, and that the API, page and database follow the rules (server checks, audit, server-only tables).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const C = await jiti.import(path.join(root, 'lib/sales/deal-credit.ts'))
const D = await jiti.import(path.join(root, 'lib/dal/performance.ts'))
const T = await jiti.import(path.join(root, 'lib/teams/structure.ts'))
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
let passed = 0
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`) }
console.log('SHARED DEAL CREDIT')

const closer = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222', c = '33333333-3333-4333-8333-333333333333'

test('a 70/30 or 50/50 split is accepted; the closer keeps the remainder so the total is exactly 100%', () => {
  const r = C.normaliseShares([{ profileId: b, sharePct: 30 }], closer)
  assert.equal(r.error, null); assert.equal(C.closerRemainder(r.value), 70)
  assert.equal(C.closerRemainder(C.normaliseShares([{ profileId: b, sharePct: 50 }], closer).value), 50)
  assert.equal(C.closerRemainder(C.normaliseShares([{ profileId: b, sharePct: 33.33 }, { profileId: c, sharePct: 33.33 }], closer).value), 33.34)
  assert.equal(C.closerRemainder([]), 100)
})
test('shares can never reach 100%, include the closer, repeat a person, be zero, or have more than two decimals', () => {
  const bad = (s) => assert.ok(C.normaliseShares(s, closer).error, JSON.stringify(s))
  bad([{ profileId: b, sharePct: 60 }, { profileId: c, sharePct: 40 }])
  bad([{ profileId: b, sharePct: 100 }])
  bad([{ profileId: closer, sharePct: 10 }])
  bad([{ profileId: b, sharePct: 10 }, { profileId: b, sharePct: 10 }])
  bad([{ profileId: b, sharePct: 0 }]); bad([{ profileId: b, sharePct: -5 }])
  bad([{ profileId: b, sharePct: 10.125 }]); bad([{ profileId: b, sharePct: '10' }])
  bad([{ profileId: 'not-a-person', sharePct: 10 }]); bad('everything')
  bad(Array.from({ length: 10 }, (_, i) => ({ profileId: `${String(i).padStart(8, '0')}-0000-4000-8000-000000000000`, sharePct: 1 })))
})
test('owners, admins and managers manage splits; a team lead only for their own team’s closer; nobody else', () => {
  for (const r of ['owner', 'admin', 'manager']) assert.equal(C.canManageDealCredit(r, 'x', []), true)
  assert.equal(C.canManageDealCredit('team_lead', 'lead1', ['lead1']), true)
  assert.equal(C.canManageDealCredit('team_lead', 'lead2', ['lead1']), false)
  for (const r of ['sales_exec', 'post_sales', 'readonly']) assert.equal(C.canManageDealCredit(r, 'x', ['x']), false)
})
test('fractional deals read naturally', () => {
  assert.equal(C.fmtDeals(1), '1'); assert.equal(C.fmtDeals(0.5), '0.5'); assert.equal(C.fmtDeals(2.25), '2.25'); assert.equal(C.fmtDeals(0.3333), '0.33'); assert.equal(C.fmtDeals(-1), '0')
  assert.match(D.fmtAmount('closed', 1.5), /^1\.5 /); assert.match(D.fmtAmount('closed', 2), /^2 /)
})
test('totals: "closed" is credit, "deals" is actual deals; shared revenue counts for the sharer; old rows still count', () => {
  const ev = (profile_id, kind, units, value, xp, credit) => ({ profile_id, kind, units, value, xp, occurred_at: '2026-11-01T00:00:00Z', detail: null, credit })
  const t = D.tally([
    ev('a', 'deal_closed', 1, 0, 100, 1), ev('a', 'revenue', 0, 1000000, 0, 0),
    ev('a', 'deal_credit', 0, -300000, -30, -0.3), ev('b', 'deal_credit', 0, 300000, 30, 0.3),
    ev('a', 'deal_closed', 1, 0, 100, undefined), // before 20260098: no credit column
  ])
  assert.deepEqual([t.get('a').closed, t.get('a').deals, t.get('a').revenue, t.get('a').xp], [1.7, 2, 700000, 170])
  assert.deepEqual([t.get('b').closed, t.get('b').deals, t.get('b').revenue, t.get('b').xp], [0.3, 0, 300000, 30])
  const team = T.teamTotals(['a', 'b'], t)
  assert.equal(team.closed, 2); assert.equal(team.deals, 2)
})
test('conversion is actual deals ÷ leads assigned, so sharing never inflates it', () => {
  const team = T.teamTotals(['a', 'b'], new Map([['a', { assigned: 4, deals: 1, closed: 0.5 }], ['b', { assigned: 4, deals: 0, closed: 0.5 }]]))
  assert.equal(team.conversionPct, 13)
  assert.match(read('lib/dal/team-overview.ts'), /t\.deals \/ t\.assigned/)
  assert.match(read('lib/dal/performance.ts'), /monthT\.deals \/ monthT\.assigned/)
})
test('wiring: the API checks the person and the shares on the server, audits each change, and reads leads under row-level security', () => {
  const api = read('app/api/leads/[leadId]/deal-credit/route.ts')
  assert.match(api, /canManageDealCredit\(access\.context\.role, access\.context\.profile\.id/)
  assert.match(api, /normaliseShares\(parsed\.data\.shares, closer\)/)
  assert.match(api, /auditMember\(request, access\.context, lead\.org_id, 'lead\.credit_shared'/)
  assert.match(api, /createClient\(\)[\s\S]*from\('leads'\)/)
  assert.match(api, /status !== 'booked'/)
  assert.match(read('lib/dal/deal-credit.ts'), /rpc\('set_deal_credit'/)
  assert.match(read('app/(dashboard)/[orgSlug]/leads/[leadId]/page.tsx'), /lead\.status === 'booked' && <DealCredit leadId=\{leadId\} \/>/)
})
test('database: server-only tables, the share limits, the closer’s remainder, and no double counting', () => {
  const sql = read('supabase/migrations/20260098_shared_deal_credit.sql')
  for (const t of ['deal_credit_splits', 'deal_credit_history']) {
    assert.match(sql, new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY`))
    assert.match(sql, new RegExp(`REVOKE ALL ON public\\.${t} FROM PUBLIC, anon, authenticated`))
  }
  assert.match(sql, /share_pct > 0 AND share_pct < 100/)
  assert.match(sql, /IF v_total >= 100 THEN RAISE EXCEPTION 'over_100'/)
  assert.match(sql, /pg_advisory_xact_lock/)
  assert.match(sql, /ON CONFLICT \(org_id, dedupe_key\) DO NOTHING/)
  assert.match(sql, /WHEN 'deals'   THEN sum\(e\.units\)/)
  // perf_rewards is copied verbatim apart from the added kind.
  const base = read('supabase/migrations/20260094_performance_engine.sql')
  const fn = (s) => s.slice(s.indexOf('CREATE OR REPLACE FUNCTION public.perf_rewards()'), s.indexOf('END $$;', s.indexOf('CREATE OR REPLACE FUNCTION public.perf_rewards()')))
  assert.equal(fn(sql), fn(base).replace("'revenue', 'lead_assigned')", "'revenue', 'lead_assigned', 'deal_credit')"))
})

console.log(`\nShared deal credit: ${passed} checks passed.`)
