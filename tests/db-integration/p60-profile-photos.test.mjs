// tests/db-integration/p60-profile-photos.test.mjs — migration 20260102 against the local Supabase stack: the avatars
// bucket is public to read, limited to 2 MB of JPEG, PNG or WebP, and a signed-in user cannot write into it directly —
// not even into their own folder — so every photo goes through the server's checks.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
let passed = 0
async function test(name, fn) { try { await fn(); passed++; console.log(`  ✓ ${name}`) } catch (e) { console.error(`  ✗ ${name}`); throw e } }

async function main() {
  const pg = await import('pg')
  const db = new (pg.default || pg).Client({ connectionString: DATABASE_URL }); await db.connect()
  const q = (s, p) => db.query(s, p)
  console.log('P60 — PROFILE PHOTOS (20260102)')
  await test('the avatars bucket is public to read, 2 MB, images only', async () => {
    const b = (await q(`SELECT public, file_size_limit, allowed_mime_types FROM storage.buckets WHERE id = 'avatars'`)).rows[0]
    assert.equal(b.public, true); assert.equal(Number(b.file_size_limit), 2097152)
    assert.deepEqual([...b.allowed_mime_types].sort(), ['image/jpeg', 'image/png', 'image/webp'])
  })
  await test('a signed-in user cannot write into the bucket directly, even into their own folder', async () => {
    const uid = crypto.randomUUID()
    await q('BEGIN')
    try {
      await q(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: 'authenticated' })])
      await q('SET LOCAL ROLE authenticated')
      await assert.rejects(q(`INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('avatars', $1, $2)`, [`${uid}/x.png`, uid]), /row-level security|permission denied/)
    } finally { await q('ROLLBACK') }
  })
  await db.end()
  console.log(`\nProfile photos: ${passed} checks passed.`)
}
main().catch((e) => { console.error(e); process.exit(1) })
