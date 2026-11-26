// tests/db-integration/p0-invitation-email.test.mjs
// Accepting an invitation requires the signed-in account to own the invited email (verified).
// Real lib/dal/invitations.ts against the local Supabase stack (auth users created through the Admin API).
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const API = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!API || !KEY) { console.error('FATAL: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.'); process.exit(1) }
const RUN = crypto.randomBytes(4).toString('hex')
let passed = 0
async function test(name, fn) { try { await fn(); passed++; console.log(`  ✓ ${name}`) } catch (e) { console.error(`  ✗ ${name}`); throw e } }

async function main() {
  if (!globalThis.WebSocket) globalThis.WebSocket = class UnusedRealtimeTransport {}
  const jiti = createJiti(import.meta.url, { alias: { '@': root } })
  const dal = await jiti.import(path.join(root, 'lib/dal/invitations.ts'))
  const pg = await import('pg')
  const db = new (pg.default || pg).Client({ connectionString: DATABASE_URL })
  await db.connect()
  const one = async (s, p) => (await db.query(s, p)).rows[0]

  const mkAuthUser = async (email, confirmed) => {
    const res = await fetch(`${API}/auth/v1/admin/users`, {
      method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: `Pw-${RUN}-1234567`, email_confirm: confirmed }),
    })
    const body = await res.json()
    assert.ok(res.ok, JSON.stringify(body))
    const profile = await one('SELECT id FROM public.profiles WHERE auth_user_id = $1', [body.id])
    return { authId: body.id, profileId: profile.id }
  }
  const invite = async (orgId, invitedBy, email) => {
    const token = crypto.randomBytes(32).toString('hex')
    await db.query(`INSERT INTO public.org_invitations (org_id, email, role, invited_by, token_hash) VALUES ($1,$2,'sales_exec',$3,$4)`,
      [orgId, email, invitedBy, dal.hashInvitationToken(token)])
    return token
  }

  console.log('P0 — INVITATION EMAIL MUST MATCH (real lib/dal/invitations.ts)')
  try {
    const org = (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,'developer') RETURNING id`, [`Inv ${RUN}`, `inv-${RUN}`])).id
    const owner = await mkAuthUser(`owner-${RUN}@repx.test`, true)
    await db.query(`INSERT INTO public.org_members (org_id, profile_id, role) VALUES ($1,$2,'owner')`, [org, owner.profileId])
    const invited = `asha-${RUN}@repx.test`
    const asha = await mkAuthUser(invited, true)
    const mallory = await mkAuthUser(`mallory-${RUN}@repx.test`, true)

    await test('another account holding the link cannot join (403), and the invitation stays pending', async () => {
      const token = await invite(org, owner.profileId, invited)
      const r = await dal.acceptEmployeeInvitation(token, mallory.profileId, mallory.authId)
      assert.equal(r.success, false)
      assert.equal(r.status, 403)
      assert.match(r.error, /different email/)
      assert.equal((await one(`SELECT count(*)::int n FROM public.org_members WHERE org_id=$1 AND profile_id=$2`, [org, mallory.profileId])).n, 0)
      assert.equal((await one(`SELECT status FROM public.org_invitations WHERE token_hash=$1`, [dal.hashInvitationToken(token)])).status, 'pending')
      // …and the invited person can still use the same link afterwards
      const ok = await dal.acceptEmployeeInvitation(token, asha.profileId, asha.authId)
      assert.equal(ok.success, true, ok.error)
      assert.equal(ok.orgSlug, `inv-${RUN}`)
    })
    await test('the invited email is matched case-insensitively', async () => {
      const upper = await mkAuthUser(`ravi-${RUN}@repx.test`, true)
      const token = await invite(org, owner.profileId, `Ravi-${RUN}@RePx.test`)
      const r = await dal.acceptEmployeeInvitation(token, upper.profileId, upper.authId)
      assert.equal(r.success, true, r.error)
    })
    await test('an unverified account with the right email must verify first (403)', async () => {
      const email = `unverified-${RUN}@repx.test`
      const u = await mkAuthUser(email, false)
      const token = await invite(org, owner.profileId, email)
      const r = await dal.acceptEmployeeInvitation(token, u.profileId, u.authId)
      assert.deepEqual([r.success, r.status], [false, 403])
      assert.match(r.error, /Verify your email/)
    })
  } finally {
    await db.end()
  }
  console.log(`\nALL ${passed} INVITATION EMAIL TESTS PASSED`)
}
main().catch((e) => { console.error('\nTEST SUITE FAILED:', e?.message || e); process.exit(1) })
