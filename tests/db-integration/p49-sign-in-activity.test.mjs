// tests/db-integration/p49-sign-in-activity.test.mjs — sign-in activity (20260090) against the local Supabase stack,
// through real GoTrue sign-ins: a sign-in is recorded with its browser and address, a refresh updates "last seen", a
// sign-out ends it; a failure inside the record never blocks a sign-in; an admin sees only their own workspace's
// people; clients cannot read the table.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) { console.error('FATAL: Supabase env (URL, service and anon keys) required.'); process.exit(1) }
const RUN = crypto.randomBytes(4).toString('hex')
const PASSWORD = 'SignIn-Test-' + crypto.randomBytes(8).toString('hex')
let passed = 0
async function test(name, fn) { try { await fn(); passed++; console.log(`  ✓ ${name}`) } catch (e) { console.error(`  ✗ ${name}`); throw e } }

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
async function gotrue(pathname, body, token) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/${pathname}`, {
    method: 'POST', headers: { apikey: ANON_KEY, 'Content-Type': 'application/json', 'User-Agent': UA, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body ?? {}),
  })
  return { status: res.status, json: await res.json().catch(() => ({})) }
}

async function main() {
  if (!globalThis.WebSocket) globalThis.WebSocket = class UnusedRealtimeTransport {}
  const jiti = createJiti(import.meta.url, { alias: { '@': root } })
  const A = await jiti.import(path.join(root, 'lib/dal/sign-in-activity.ts'))
  const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const pg = await import('pg')
  const db = new (pg.default || pg).Client({ connectionString: DATABASE_URL }); await db.connect()
  const one = async (s, p) => (await db.query(s, p)).rows[0]
  const authIds = [], orgIds = []
  const mkOrg = async (n) => { const id = (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,'developer') RETURNING id`, [`${n} ${RUN}`, `${n.toLowerCase()}-${RUN}`])).id; orgIds.push(id); return id }
  const mkUser = async (n, org, role) => {
    const email = `${n.toLowerCase()}-${RUN}@repx.test`
    const { data, error } = await service.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: n } })
    if (error) throw error
    authIds.push(data.user.id)
    const id = (await one('SELECT id FROM public.profiles WHERE auth_user_id=$1', [data.user.id])).id
    await db.query(`INSERT INTO public.org_members (org_id, profile_id, role) VALUES ($1,$2,$3)`, [org, id, role])
    return { profileId: id, authId: data.user.id, email }
  }
  const signIn = (email) => gotrue('token?grant_type=password', { email, password: PASSWORD })

  console.log('P49 — SIGN-IN ACTIVITY')
  const org = await mkOrg('Signin'), other = await mkOrg('Elsewhere')
  try {
    const asha = await mkUser('Asha', org, 'sales_exec'), rival = await mkUser('Rival', other, 'owner')
    let session

    await test('a sign-in is recorded with its browser and address', async () => {
      const r = await signIn(asha.email)
      assert.equal(r.status, 200)
      session = r.json
      const e = await one(`SELECT * FROM public.sign_in_events WHERE auth_user_id=$1 ORDER BY signed_in_at DESC LIMIT 1`, [asha.authId])
      assert.ok(e, 'recorded')
      assert.match(e.user_agent, /Chrome\/130/)
      assert.ok(e.ip)
      assert.equal(e.ended_at, null)
    })

    await test('a token refresh updates "last seen"; signing out ends the sign-in', async () => {
      const before = await one(`SELECT last_seen_at FROM public.sign_in_events WHERE auth_user_id=$1 ORDER BY signed_in_at DESC LIMIT 1`, [asha.authId])
      const r = await gotrue('token?grant_type=refresh_token', { refresh_token: session.refresh_token })
      assert.equal(r.status, 200)
      const after = await one(`SELECT last_seen_at FROM public.sign_in_events WHERE auth_user_id=$1 ORDER BY signed_in_at DESC LIMIT 1`, [asha.authId])
      assert.ok(after.last_seen_at && (!before.last_seen_at || after.last_seen_at >= before.last_seen_at))
      const out = await gotrue('logout?scope=global', {}, r.json.access_token)
      assert.ok([200, 204].includes(out.status), `logout ${out.status}`)
      const ended = await one(`SELECT count(*) FILTER (WHERE ended_at IS NULL) open FROM public.sign_in_events WHERE auth_user_id=$1`, [asha.authId])
      assert.equal(Number(ended.open), 0, 'every session of hers is closed')
    })

    await test('a failure inside the record never blocks a sign-in', async () => {
      await db.query(`ALTER TABLE public.sign_in_events ADD CONSTRAINT p49_refuse_everything CHECK (false) NOT VALID`)
      try {
        const r = await signIn(asha.email)
        assert.equal(r.status, 200, 'still signed in')
      } finally {
        await db.query(`ALTER TABLE public.sign_in_events DROP CONSTRAINT p49_refuse_everything`)
      }
    })

    await test('an admin sees only their own workspace’s people; devices and addresses are shown safely', async () => {
      await signIn(rival.email)
      const mine = await A.listSignIns(org)
      assert.ok(mine.rows.length >= 1)
      assert.ok(mine.rows.every((r) => r.name === 'Asha'), 'no one from another workspace')
      assert.equal(mine.rows[0].device, 'Chrome on Windows')
      assert.match(mine.rows[0].ip, /\.x$|…$/)
      assert.ok(!mine.people.some((p) => p.name === 'Rival'))
      const theirs = await A.listSignIns(other, { profileId: asha.profileId })
      assert.deepEqual(theirs.rows, [], 'asking for someone outside the workspace returns nothing')
    })

    await test('signed-in clients cannot read the table', async () => {
      const r = await signIn(asha.email)
      const client = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${r.json.access_token}` } } })
      const { data, error } = await client.from('sign_in_events').select('id')
      assert.ok(error || (data ?? []).length === 0)
    })
  } finally {
    await db.query('DELETE FROM public.sign_in_events WHERE auth_user_id = ANY($1)', [authIds]).catch(() => {})
    for (const id of orgIds) {
      await db.query('DELETE FROM public.org_members WHERE org_id=$1', [id]).catch(() => {})
      await db.query('DELETE FROM public.organisations WHERE id=$1', [id]).catch((e) => console.error('cleanup', e.message))
    }
    for (const id of authIds) await service.auth.admin.deleteUser(id).catch(() => {})
    await db.end()
  }
  console.log(`\nSign-in activity: ${passed} checks passed.`)
}
main().catch((e) => { console.error(e); process.exit(1) })
