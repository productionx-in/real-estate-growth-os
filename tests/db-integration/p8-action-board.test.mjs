// tests/db-integration/p8-action-board.test.mjs — home dashboard definitions (real lib/dal/action-board.ts).
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) { console.error('FATAL: Supabase env required.'); process.exit(1) }
const RUN = crypto.randomBytes(4).toString('hex')
let passed = 0
async function test(name, fn) { try { await fn(); passed++; console.log(`  ✓ ${name}`) } catch (e) { console.error(`  ✗ ${name}`); throw e } }

async function main() {
  if (!globalThis.WebSocket) globalThis.WebSocket = class UnusedRealtimeTransport {}
  const jiti = createJiti(import.meta.url, { alias: { '@': root } })
  const ab = await jiti.import(path.join(root, 'lib/dal/action-board.ts'))
  const { createServiceClient } = await jiti.import(path.join(root, 'lib/supabase/server.ts'))
  const pg = await import('pg')
  const db = new (pg.default || pg).Client({ connectionString: DATABASE_URL })
  await db.connect()
  const one = async (s, p) => (await db.query(s, p)).rows[0]
  const mkProfile = async (n) => {
    const id = crypto.randomUUID()
    await db.query(`INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
      VALUES ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),now(),now(),'{}',$3)`, [id, `${n}-${RUN}@repx.test`, JSON.stringify({ full_name: n })])
    return (await one('SELECT id FROM public.profiles WHERE auth_user_id=$1', [id])).id
  }
  console.log('P8 — ACTION BOARD')
  const org = (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,'developer') RETURNING id`, [`AB ${RUN}`, `ab-${RUN}`])).id
  try {
    const asha = await mkProfile('Asha'), ravi = await mkProfile('Ravi')
    for (const p of [asha, ravi]) await db.query(`INSERT INTO public.org_members (org_id, profile_id, role) VALUES ($1,$2,'sales_exec')`, [org, p])
    await db.query(`INSERT INTO public.lead_response_settings (org_id, first_response_minutes) VALUES ($1, 5) ON CONFLICT (org_id) DO UPDATE SET first_response_minutes = 5`, [org])
    let n = 0
    const lead = async (o) => {
      n++
      const r = await one(`INSERT INTO public.leads (org_id, name, phone, source, status, assigned_to, created_at, first_action_at, next_follow_up_at)
        VALUES ($1,$2,$3,'website',$4,$5, now() - ($6 || ' minutes')::interval, $7, $8) RETURNING id`,
        [org, `Lead ${n}`, `90000${RUN.slice(0, 3)}${String(n).padStart(2, '0')}`.replace(/[a-f]/g, '1'), o.status ?? 'new', o.to ?? null, String(o.ageMin ?? 1),
         o.acted ? new Date().toISOString() : null, o.next ?? null])
      // Auto-assignment gives new leads an owner on insert; an "unassigned" lead is one whose owner was cleared.
      if (!o.to) await db.query('UPDATE public.leads SET assigned_to = NULL WHERE id = $1', [r.id])
      return r.id
    }
    // waiting: never called or messaged (one assigned 30 min ago, one unassigned, one 2 minutes old)
    await lead({ ageMin: 30, to: asha }); await lead({ ageMin: 40 })
    await lead({ ageMin: 2, to: asha })
    // contacted with nothing scheduled → no next step
    await lead({ status: 'contacted', acted: true, to: ravi })
    // overdue follow-up
    await lead({ status: 'qualified', acted: true, to: asha, next: new Date(Date.now() - 3600_000).toISOString() })
    // future follow-up: neither overdue nor no-next-step
    await lead({ status: 'qualified', acted: true, to: ravi, next: new Date(Date.now() + 3600_000).toISOString() })
    // visited, not booked, nothing scheduled → visited AND no next step
    await lead({ status: 'site_visited', acted: true, to: asha })
    // closed: never counted as waiting/unassigned
    await lead({ status: 'booked', acted: true, to: ravi }); await lead({ status: 'junk' })

    await test('organisation counts match the definitions', async () => {
      const b = await ab.getActionBoard({ orgId: org, profileId: null, period: '7d', includeTeam: true })
      assert.deepEqual(
        { waiting: b.counts.waiting, unassigned: b.counts.unassigned, overdue: b.counts.overdue, no_next_step: b.counts.no_next_step, visited: b.counts.visited },
        { waiting: 3, unassigned: 1, overdue: 1, no_next_step: 2, visited: 1 })
      assert.equal(b.counts.newLeads, 9)
      assert.equal(b.waitingLeads.length, 3)
      assert.equal(b.waitingLeads[0].name, 'Lead 2', 'oldest first')
    })
    await test('a salesperson sees only their own leads', async () => {
      const b = await ab.getActionBoard({ orgId: org, profileId: asha, period: '7d', includeTeam: true })
      assert.deepEqual([b.counts.waiting, b.counts.unassigned, b.counts.overdue, b.counts.no_next_step, b.counts.visited], [2, 0, 1, 1, 1])
      assert.equal(b.team, null, 'no team table in a personal view')
    })
    await test('the funnel counts leads at or beyond each stage, and closed ones separately', async () => {
      const b = await ab.getActionBoard({ orgId: org, profileId: null, period: '7d', includeTeam: false })
      const f = Object.fromEntries(b.funnel.map((s) => [s.status, s.reached]))
      assert.deepEqual(f, { new: 8, contacted: 5, qualified: 4, site_visit_scheduled: 2, site_visited: 2, negotiation: 1, booked: 1 })
      assert.deepEqual([b.closedLost, b.closedJunk], [0, 1])
    })
    await test('the team table adds up per person', async () => {
      const b = await ab.getActionBoard({ orgId: org, profileId: null, period: '7d', includeTeam: true })
      const by = Object.fromEntries(b.team.map((r) => [r.name, [r.open, r.waiting, r.overdue, r.noNextStep, r.bookings]]))
      assert.deepEqual(by.Asha, [4, 2, 1, 1, 0])
      assert.deepEqual(by.Ravi, [2, 0, 0, 1, 1])
    })
    await test('the lead list filter returns exactly the leads each tile counts', async () => {
      const svc = createServiceClient()
      for (const focus of Object.keys(ab.FOCI)) {
        const { data, error } = await ab.applyFocus(svc.from('leads').select('id').eq('org_id', org), focus, new Date())
        assert.equal(error, null)
        const b = await ab.getActionBoard({ orgId: org, profileId: null, period: '30d', includeTeam: false })
        assert.equal(data.length, b.counts[focus], focus)
      }
    })
    await test('another organisation sees none of these leads', async () => {
      const other = (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,'developer') RETURNING id`, [`AB2 ${RUN}`, `ab2-${RUN}`])).id
      const b = await ab.getActionBoard({ orgId: other, profileId: null, period: '30d', includeTeam: true })
      assert.deepEqual([b.counts.waiting, b.counts.newLeads, b.team.length], [0, 0, 0])
      await db.query('DELETE FROM public.organisations WHERE id=$1', [other])
    })
    console.log(`\nP8 action board: ${passed} checks passed.`)
  } finally {
    await db.query('DELETE FROM public.organisations WHERE id=$1', [org]).catch(() => {})
    await db.end()
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
