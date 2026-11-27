// tests/db-integration/p63-calendar-feeds.test.mjs — migration 20260112 against the local Supabase stack: calendar
// subscription links are stored as hashes only, one per person per workspace, and nobody outside the server can read
// or write them (not even the person they belong to, nor anyone in another workspace).
import assert from 'node:assert/strict'
import crypto from 'node:crypto'

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
let passed = 0
async function test(name, fn) { try { await fn(); passed++; console.log(`  ✓ ${name}`) } catch (e) { console.error(`  ✗ ${name}`); throw e } }

async function main() {
  const pg = await import('pg')
  const db = new (pg.default || pg).Client({ connectionString: DATABASE_URL }); await db.connect()
  const q = (s, p) => db.query(s, p)
  const one = async (s, p) => (await q(s, p)).rows[0]
  console.log('P63 — CALENDAR FEEDS (20260112)')
  const m = await one(`SELECT m.org_id, m.profile_id, p.auth_user_id FROM public.org_members m JOIN public.profiles p ON p.id = m.profile_id WHERE m.status = 'active' AND p.auth_user_id IS NOT NULL LIMIT 1`)
  assert.ok(m, 'needs one active member in the local database')
  const hash = crypto.createHash('sha256').update(crypto.randomBytes(32)).digest('hex')

  await test('a hash is stored; a second link for the same person and workspace replaces, never adds', async () => {
    await q(`INSERT INTO public.calendar_feeds (org_id, profile_id, token_hash) VALUES ($1, $2, $3)
             ON CONFLICT (org_id, profile_id) DO UPDATE SET token_hash = EXCLUDED.token_hash`, [m.org_id, m.profile_id, hash])
    await q('BEGIN')
    try { await assert.rejects(q(`INSERT INTO public.calendar_feeds (org_id, profile_id, token_hash) VALUES ($1, $2, $3)`, [m.org_id, m.profile_id, 'f'.repeat(64)]), /duplicate key/) } finally { await q('ROLLBACK') }
    await q('BEGIN')
    try { await assert.rejects(q(`INSERT INTO public.calendar_feeds (org_id, profile_id, token_hash) VALUES ($1, $2, 'plain-secret')`, [m.org_id, m.profile_id]), /check|duplicate/) } finally { await q('ROLLBACK') }
  })
  await test('server-only: visitors and signed-in users — including the owner — can neither read nor write', async () => {
    for (const [role, sub] of [['anon', crypto.randomUUID()], ['authenticated', m.auth_user_id], ['authenticated', crypto.randomUUID()]]) {
      await q('BEGIN')
      try {
        await q(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub, role })])
        await q(`SET LOCAL ROLE ${role}`)
        await assert.rejects(q(`SELECT * FROM public.calendar_feeds`), /permission denied/)
      } finally { await q('ROLLBACK') }
      await q('BEGIN')
      try { await q(`SET LOCAL ROLE ${role}`); await assert.rejects(q(`DELETE FROM public.calendar_feeds`), /permission denied/) } finally { await q('ROLLBACK') }
    }
  })
  await q(`DELETE FROM public.calendar_feeds WHERE token_hash = $1`, [hash])
  await db.end()
  console.log(`\nCalendar feeds: ${passed} checks passed.`)
}
main().catch((e) => { console.error(e); process.exit(1) })
