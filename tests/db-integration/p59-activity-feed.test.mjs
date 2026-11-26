// tests/db-integration/p59-activity-feed.test.mjs — migration 20260101 against the local Supabase stack: feed reactions
// are one of each kind per person per item, only from active members of the workspace, only for well-formed item keys,
// and out of reach of signed-in users (the server reads and writes them after checking the workspace's settings).
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
  const mkUser = async (label) => {
    const id = crypto.randomUUID()
    await q(`INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud)
             VALUES ($1, '00000000-0000-0000-0000-000000000000', $2, 'x', now(), '{"provider":"email"}', $3, now(), now(), 'authenticated', 'authenticated')`,
      [id, `p59-${label}-${RUN}@repx.test`, JSON.stringify({ full_name: `P59 ${label}` })])
    return { authId: id, profileId: (await one('SELECT id FROM public.profiles WHERE auth_user_id = $1', [id])).id }
  }
  const mkOrg = async (label) => (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1, $2, 'developer') RETURNING id`, [`P59 ${label} ${RUN}`, `p59-${label}-${RUN}`])).id
  const expectError = async (sql, params, re) => {
    await q('BEGIN'); try { await q(sql, params); assert.fail('should have failed') } catch (e) { if (e.code === 'ERR_ASSERTION') throw e; assert.match(e.message, re) } finally { await q('ROLLBACK') }
  }

  console.log('P59 — ACTIVITY FEED (20260101)')
  const org = await mkOrg('org'), other = await mkOrg('other')
  const a = await mkUser('a'), x = await mkUser('x'), gone = await mkUser('gone')
  await q(`INSERT INTO public.org_members (org_id, profile_id, role) VALUES ($1,$2,'sales_exec')`, [org, a.profileId])
  await q(`INSERT INTO public.org_members (org_id, profile_id, role, status) VALUES ($1,$2,'sales_exec','deactivated')`, [org, gone.profileId])
  await q(`INSERT INTO public.org_members (org_id, profile_id, role) VALUES ($1,$2,'sales_exec')`, [other, x.profileId])
  const key = `deal:${crypto.randomUUID()}`

  await test('a member reacts once per kind; a second of the same kind is refused, another kind is fine', async () => {
    await q(`INSERT INTO public.feed_reactions (org_id, item_key, profile_id, kind) VALUES ($1,$2,$3,'clap')`, [org, key, a.profileId])
    await expectError(`INSERT INTO public.feed_reactions (org_id, item_key, profile_id, kind) VALUES ($1,$2,$3,'clap')`, [org, key, a.profileId], /duplicate key/)
    await q(`INSERT INTO public.feed_reactions (org_id, item_key, profile_id, kind) VALUES ($1,$2,$3,'fire')`, [org, key, a.profileId])
  })
  await test('someone from another workspace, or no longer active, cannot react here', async () => {
    await expectError(`INSERT INTO public.feed_reactions (org_id, item_key, profile_id, kind) VALUES ($1,$2,$3,'heart')`, [org, key, x.profileId], /Only active members/)
    await expectError(`INSERT INTO public.feed_reactions (org_id, item_key, profile_id, kind) VALUES ($1,$2,$3,'heart')`, [org, key, gone.profileId], /Only active members/)
  })
  await test('only the fixed reactions, on well-formed item keys', async () => {
    await expectError(`INSERT INTO public.feed_reactions (org_id, item_key, profile_id, kind) VALUES ($1,$2,$3,'poop')`, [org, key, a.profileId], /check/)
    await expectError(`INSERT INTO public.feed_reactions (org_id, item_key, profile_id, kind) VALUES ($1,'customer:Ravi Sharma',$2,'clap')`, [org, a.profileId], /check/)
  })
  await test('reactions are server-only', async () => {
    await q('BEGIN')
    try {
      await q(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: a.authId, role: 'authenticated' })])
      await q('SET LOCAL ROLE authenticated')
      await assert.rejects(q(`SELECT * FROM public.feed_reactions`), /permission denied/)
    } finally { await q('ROLLBACK') }
  })

  await db.end()
  console.log(`\nActivity feed: ${passed} checks passed.`)
}
main().catch((e) => { console.error(e); process.exit(1) })
