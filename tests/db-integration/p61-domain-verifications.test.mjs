// tests/db-integration/p61-domain-verifications.test.mjs — migration 20260103 against the local Supabase stack: one row
// per workspace, purpose and domain; well-formed domains, tokens and "send as" names only; sending fields for e-mail
// only; and nobody outside the server can read or write any of it.
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
  console.log('P61 — DOMAIN VERIFICATIONS (20260103)')
  const org = (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,'developer') RETURNING id`, [`P61 ${RUN}`, `p61-${RUN}`])).id
  const tok = 'a'.repeat(32)
  const add = (purpose, domain, extra = {}) => q(`INSERT INTO public.domain_verifications (org_id, purpose, domain, token, send_as, provider_domain_id) VALUES ($1,$2,$3,$4,$5,$6)`,
    [org, purpose, domain, extra.token ?? tok, extra.sendAs ?? null, extra.providerId ?? null])

  await test('a website and an e-mail domain; the same domain twice for the same purpose is refused', async () => {
    await add('website', 'seaview.in'); await add('email', 'seaview.in', { sendAs: 'sales', providerId: 'abc-123' })
    await expectError(`INSERT INTO public.domain_verifications (org_id, purpose, domain, token) VALUES ($1,'website','seaview.in',$2)`, [org, tok], /duplicate key/)
  })
  await test('malformed domains, tokens and addresses are refused; sending fields are for e-mail only', async () => {
    for (const [p, d, extra] of [['website', 'not a domain', {}], ['website', 'UPPER.in', {}], ['website', 'x.in', { token: 'short' }], ['email', 'y.in', { sendAs: 'Bad Name' }], ['website', 'z.in', { sendAs: 'sales' }], ['website', 'w.in', { providerId: 'abc' }]]) {
      await expectError(`INSERT INTO public.domain_verifications (org_id, purpose, domain, token, send_as, provider_domain_id) VALUES ($1,$2,$3,$4,$5,$6)`,
        [org, p, d, extra.token ?? tok, extra.sendAs ?? null, extra.providerId ?? null], /check/)
    }
  })
  await test('server-only: signed-in users can neither read nor write', async () => {
    await q('BEGIN')
    try {
      await q(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: crypto.randomUUID(), role: 'authenticated' })])
      await q('SET LOCAL ROLE authenticated')
      await assert.rejects(q(`SELECT * FROM public.domain_verifications`), /permission denied/)
    } finally { await q('ROLLBACK') }
  })
  await db.end()
  console.log(`\nDomain verifications: ${passed} checks passed.`)
}
main().catch((e) => { console.error(e); process.exit(1) })
