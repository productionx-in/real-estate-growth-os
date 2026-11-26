// tests/activity-feed.test.mjs — the sales activity feed (lib/feed/items.ts, lib/dal/feed.ts, migration 20260101): who
// may see it and its booking values, how a new leader is spotted, the settings, and that the feed is built from existing
// records only, never names a customer, and checks every reaction on the server.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const F = await jiti.import(path.join(root, 'lib/feed/items.ts'))
const R = await jiti.import(path.join(root, 'lib/performance/rules.ts'))
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
let passed = 0
function test(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`) }
console.log('ACTIVITY FEED')

test('settings: on for everyone by default, booking values for managers only, reactions on; stored values respected', () => {
  assert.deepEqual(R.DEFAULT_GAMIFICATION.feed, { enabled: true, visibleTo: 'everyone', showAmounts: false, reactions: true })
  const s = R.normaliseGamification({ feed: { enabled: true, visibleTo: 'managers', showAmounts: true, reactions: false } }).value
  assert.deepEqual(s.feed, { enabled: true, visibleTo: 'managers', showAmounts: true, reactions: false })
  assert.equal(R.normaliseGamification({ feed: { visibleTo: 'nobody' } }).value.feed.visibleTo, 'everyone')
})
test('who sees the feed and its values follows the settings; points off means no feed', () => {
  const s = (feed, enabled = true) => ({ ...R.DEFAULT_GAMIFICATION, enabled, feed: { ...R.DEFAULT_GAMIFICATION.feed, ...feed } })
  assert.equal(F.canSeeFeed(s({}), false), true)
  assert.equal(F.canSeeFeed(s({ visibleTo: 'managers' }), false), false)
  assert.equal(F.canSeeFeed(s({ visibleTo: 'managers' }), true), true)
  assert.equal(F.canSeeFeed(s({ enabled: false }), true), false)
  assert.equal(F.canSeeFeed(s({}, false), true), false)
  assert.equal(F.seesAmounts(s({}), false), false); assert.equal(F.seesAmounts(s({}), true), true); assert.equal(F.seesAmounts(s({ showAmounts: true }), false), true)
})
test('a new leader on this week’s board is spotted; a tie or the same leader is not news', () => {
  const now = new Date('2026-11-26T12:00:00Z'), old = '2026-11-24T10:00:00Z', recent = '2026-11-26T10:00:00Z'
  assert.deepEqual(F.leaderChange([{ profile_id: 'a', xp: 100, occurred_at: old }, { profile_id: 'b', xp: 150, occurred_at: recent }], now), { leader: 'b', before: 'a', at: recent })
  assert.equal(F.leaderChange([{ profile_id: 'a', xp: 100, occurred_at: old }, { profile_id: 'b', xp: 100, occurred_at: recent }], now), null)
  assert.equal(F.leaderChange([{ profile_id: 'a', xp: 100, occurred_at: old }, { profile_id: 'a', xp: 10, occurred_at: recent }], now), null)
  assert.deepEqual(F.leaderChange([{ profile_id: 'a', xp: 10, occurred_at: recent }], now)?.leader, 'a')
  assert.equal(F.leaderChange([], now), null)
})
test('reactions and item keys are a fixed set', () => {
  assert.deepEqual(Object.keys(F.REACTIONS), ['clap', 'fire', 'heart', 'trophy'])
  assert.ok(F.ITEM_KEY.test('deal:2f0c1e8a-0000-4000-8000-000000000000'))
  assert.ok(!F.ITEM_KEY.test('deal:x; drop table'))
  assert.ok(!F.ITEM_KEY.test('lead_name:abc'))
})
test('built from existing records only, never naming a customer; reversed bookings are not celebrated', () => {
  const dal = read('lib/dal/feed.ts')
  // The only read of a lead is its project's name — never the lead's own name, phone or e-mail.
  assert.deepEqual(dal.match(/from\('leads_all'\)\.select\('[^']*'\)/g), ["from('leads_all').select('id, projects(name)')"])
  assert.match(dal, /if \(gone\.has\(d\.dedupe_key\)\) continue/)
  assert.match(dal, /amount: opts\.amounts &&/)
  assert.match(dal, /\.in\('status', \['approved', 'fulfilled', 'redeemed'\]\)/, 'a reward shows only once approved')
  assert.ok(!/\.(insert|update)\(/.test(dal.replace(/from\('feed_reactions'\)\.insert/, '')), 'the feed writes nothing but reactions')
})
test('API and page: settings checked on the server; a reaction only on an item this person can see', () => {
  const get = read('app/api/feed/route.ts'), react = read('app/api/feed/react/route.ts'), page = read('app/(dashboard)/[orgSlug]/performance/activity/page.tsx')
  assert.match(get, /if \(!canSeeFeed\(s, manager\)\)/)
  assert.match(react, /if \(!canSeeFeed\(s, manager\) \|\| !s\.feed\.reactions\)/)
  assert.match(react, /if \(!items\.some\(\(i\) => i\.key === itemKey\)\)/)
  assert.match(page, /if \(!canSeeFeed\(s, manager\)\)/)
  assert.ok(!/\p{Extended_Pictographic}/u.test(read('components/feed/ActivityFeed.tsx')), 'icons, not emoji')
})
test('database: reactions are server-only, members only, one of each kind per person per item', () => {
  const sql = read('supabase/migrations/20260101_activity_feed.sql')
  assert.match(sql, /PRIMARY KEY \(org_id, item_key, profile_id, kind\)/)
  assert.match(sql, /ALTER TABLE public\.feed_reactions ENABLE ROW LEVEL SECURITY/)
  assert.match(sql, /REVOKE ALL ON public\.feed_reactions FROM PUBLIC, anon, authenticated/)
  assert.match(sql, /Only active members of this organisation can react/)
})

console.log(`\nActivity feed: ${passed} checks passed.`)
