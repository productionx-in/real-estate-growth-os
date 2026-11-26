// tests/db-integration/p62-site-pageviews.test.mjs — migration 20260105 against the local Supabase stack: website
// page views accept only well-formed rows, keep 13 months, and nobody outside the server can read or write them.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const RUN = crypto.randomBytes(4).toString('hex')
let passed = 0
async function test(name, fn) { try { await fn(); passed++; console.log(`  ✓ ${name}`) } catch (e) { console.error(`  ✗ ${name}`); throw e } }

async function main() {
  const pg = await import('pg')
  const db = new (pg.default || pg).Client({ connectionString: DATABASE_URL }); await db.connect()
  const q = (s, p) => db.query(s, p)
  const one = async (s, p) => (await q(s, p)).rows[0]
  const expectError = async (sql, params, re) => {
    await q('BEGIN'); try { await q(sql, params); assert.fail('should have failed') } catch (e) { if (e.code === 'ERR_ASSERTION') throw e; assert.match(e.message, re) } finally { await q('ROLLBACK') }
  }
  const ins = (cols, vals) => `INSERT INTO public.site_pageviews (${cols}) VALUES (${vals})`
  console.log('P62 — WEBSITE PAGE VIEWS (20260105)')
  const visit = `v${RUN}abcd`

  await test('a page view with its source, country and device is stored', async () => {
    await q(ins('visit_id, seq, path, referrer_host, utm_source, country, device', '$1, 1, $2, $3, $4, $5, $6'), [visit, '/', 'google.com', 'meta', 'IN', 'mobile'])
    await q(ins('visit_id, seq, path, prev_path', '$1, 2, $2, $3'), [visit, '/demo', '/'])
    assert.equal((await one(`SELECT count(*)::int n FROM public.site_pageviews WHERE visit_id = $1`, [visit])).n, 2)
  })
  await test('malformed rows are refused', async () => {
    for (const [cols, vals, params] of [
      ['visit_id, path', '$1, $2', ['BAD ID!', '/']],
      ['visit_id, path', '$1, $2', [visit, 'https://x.example/']],
      ['visit_id, seq, path', '$1, 0, $2', [visit, '/']],
      ['visit_id, path, country', '$1, $2, $3', [visit, '/', 'india']],
      ['visit_id, path, device', '$1, $2, $3', [visit, '/', 'fridge']],
    ]) await expectError(ins(cols, vals), params, /check/)
  })
  await test('the purge keeps 13 months', async () => {
    await q(ins('at, visit_id, path', `now() - interval '14 months', $1, '/'`), [`old${RUN}abcd`])
    await q(`SELECT public.purge_site_pageviews()`)
    assert.equal((await one(`SELECT count(*)::int n FROM public.site_pageviews WHERE visit_id = $1`, [`old${RUN}abcd`])).n, 0)
    assert.equal((await one(`SELECT count(*)::int n FROM public.site_pageviews WHERE visit_id = $1`, [visit])).n, 2)
  })
  await test('server-only: visitors and signed-in users can neither read nor write', async () => {
    for (const role of ['anon', 'authenticated']) {
      await q('BEGIN')
      try {
        await q(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: crypto.randomUUID(), role })])
        await q(`SET LOCAL ROLE ${role}`)
        await assert.rejects(q(`SELECT * FROM public.site_pageviews`), /permission denied/)
      } finally { await q('ROLLBACK') }
      await q('BEGIN')
      try {
        await q(`SET LOCAL ROLE ${role}`)
        await assert.rejects(q(ins('visit_id, path', `'abcdefgh12', '/'`)), /permission denied/)
        await assert.rejects(q(`SELECT public.purge_site_pageviews()`), /permission denied/)
      } finally { await q('ROLLBACK') }
    }
  })
  await q(`DELETE FROM public.site_pageviews WHERE visit_id = $1`, [visit])
  await db.end()
  console.log(`\nWebsite page views: ${passed} checks passed.`)
}
main().catch((e) => { console.error(e); process.exit(1) })
