// tests/rewards.test.mjs — rewards (lib/rewards/rules.ts, migration 20260100): the programme checks, who may take which
// step on a claim, the budget, and that the API, page and database follow the rules (server checks, audit, server-only,
// winners only from the database).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const R = await jiti.import(path.join(root, 'lib/rewards/rules.ts'))
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
let passed = 0
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`) }
console.log('REWARDS')

const base = { title: 'December sprint', rewardType: 'gadget', rewardDetail: 'iPhone 16', unitValue: 80000, budget: 240000, scope: 'person', eligibleRoles: ['sales_exec'], goalKind: 'reach', metric: 'deals', goalAmount: 5, startsOn: '2026-12-01', endsOn: '2026-12-31' }

test('every reward type the brief asks for: gadgets, travel, gift cards and vouchers, cash, custom', () => {
  assert.deepEqual(Object.keys(R.REWARD_TYPES), ['gadget', 'travel', 'gift_card', 'cash', 'custom'])
})
test('a well-formed programme passes; the budget pays for whole rewards', () => {
  const r = R.normaliseProgram(base)
  assert.equal(r.error, null); assert.equal(R.budgetSeats(r.value), 3)
  assert.equal(R.budgetSeats({ budget: null, unitValue: 5 }), null)
  assert.equal(R.goalText(r.value), 'Reach 5 deals closed')
  assert.equal(R.goalText({ goalKind: 'top', metric: 'revenue', topN: 3, goalAmount: null }), 'Top 3 by revenue')
})
test('the form refuses what makes no sense, saying what to fix', () => {
  const bad = (patch) => assert.ok(R.normaliseProgram({ ...base, ...patch }).error, JSON.stringify(patch))
  bad({ title: '' }); bad({ rewardType: 'car' }); bad({ rewardDetail: '' }); bad({ unitValue: -1 }); bad({ budget: 1000 })
  bad({ eligibleRoles: [] }); bad({ eligibleRoles: ['readonly'] }); bad({ goalKind: 'luck' }); bad({ metric: 'assigned' })
  bad({ goalAmount: 0 }); bad({ goalKind: 'top', topN: 0 }); bad({ goalKind: 'top', topN: 51 }); bad({ maxWinners: 0 })
  bad({ endsOn: '2026-11-30' }); bad({ startsOn: '2026-01-01', endsOn: '2027-12-31' }); bad({ startsOn: 'soon' })
})
test('claims: managers approve, reject and give; the winner can only confirm receipt; nobody else does anything', () => {
  assert.deepEqual(R.claimSteps('pending', { manager: true, winner: false }), ['approved', 'rejected'])
  assert.deepEqual(R.claimSteps('pending', { manager: false, winner: true }), [])
  assert.deepEqual(R.claimSteps('approved', { manager: true, winner: false }), ['fulfilled', 'rejected'])
  assert.deepEqual(R.claimSteps('fulfilled', { manager: false, winner: true }), ['redeemed'])
  assert.deepEqual(R.claimSteps('fulfilled', { manager: false, winner: false }), [])
  for (const s of ['rejected', 'redeemed']) assert.deepEqual(R.claimSteps(s, { manager: true, winner: true }), [])
  for (const r of ['owner', 'admin', 'manager']) assert.equal(R.canManageRewards(r), true)
  for (const r of ['team_lead', 'sales_exec', 'readonly', 'post_sales']) assert.equal(R.canManageRewards(r), false)
})
test('wiring: server checks, audit, winners only from the database', () => {
  const create = read('app/api/rewards/route.ts'), prog = read('app/api/rewards/[programId]/route.ts'), claim = read('app/api/rewards/claims/[claimId]/route.ts')
  assert.match(create, /authorizeOrgAccess\(orgId, \[\.\.\.REWARD_MANAGERS\]\)/); assert.match(create, /'reward\.program_created'/)
  assert.match(prog, /authorizeOrgAccess\(orgId, \[\.\.\.REWARD_MANAGERS\]\)/); assert.match(prog, /'reward\.program_cancelled'/)
  assert.match(claim, /claimSteps\(claim\.status, \{ manager, winner \}\)\.includes\(to\)/); assert.match(claim, /`reward\.claim_\$\{to\}`/)
  const dal = read('lib/dal/rewards.ts')
  assert.match(dal, /rpc\('reward_qualify'/); assert.match(dal, /rpc\('set_reward_claim_status'/)
  assert.ok(!/from\('reward_claims'\)\.(insert|update|upsert)/.test(dal), 'claims are never written directly')
  assert.match(read('app/(dashboard)/[orgSlug]/rewards/page.tsx'), /if \(role === 'readonly' \|\| role === 'post_sales'\) notFound\(\)/)
})
test('database: one reward per winner, budget and winner limits, ordered steps, frozen goals, server-only, hourly', () => {
  const sql = read('supabase/migrations/20260100_rewards.sql')
  assert.match(sql, /uq_reward_claim_person ON public\.reward_claims \(program_id, profile_id\)/)
  assert.match(sql, /uq_reward_claim_team ON public\.reward_claims \(program_id, team_id\)/)
  assert.match(sql, /EXIT WHEN g\.budget IS NOT NULL AND \(v_taken \+ 1\) \* g\.unit_value > g\.budget/)
  assert.match(sql, /EXIT WHEN g\.max_winners IS NOT NULL AND v_taken >= g\.max_winners/)
  assert.match(sql, /IF g\.goal_kind = 'top' AND v_to > now\(\) THEN RETURN 0/)
  assert.match(sql, /RAISE EXCEPTION 'invalid_step'/)
  assert.match(sql, /The goal of a programme with winners cannot change/)
  assert.match(sql, /public\.member_can_take_leads\(g\.org_id, m\.profile_id, m\.role\)/)
  for (const t of ['reward_programs', 'reward_claims', 'reward_claim_history']) {
    assert.match(sql, new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY`))
    assert.match(sql, new RegExp(`REVOKE ALL ON public\\.${t} FROM PUBLIC, anon, authenticated`))
  }
  assert.match(sql, /cron\.schedule\('regrow-reward-sweep', '7 \* \* \* \*'/)
})

console.log(`\nRewards: ${passed} checks passed.`)
