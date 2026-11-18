// tests/db-integration/p18-lead-foundation.test.mjs — stage timing, tags and merge (migration 20260057,
// lib/integrations/inbound.ts, lib/dal/reports.ts, merge_leads) against the local Supabase stack.
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
  const inbound = await jiti.import(path.join(root, 'lib/integrations/inbound.ts'))
  const reports = await jiti.import(path.join(root, 'lib/dal/reports.ts'))
  const search = await jiti.import(path.join(root, 'lib/dal/search.ts'))
  const { createServiceClient } = await jiti.import(path.join(root, 'lib/supabase/server.ts'))
  const pg = await import('pg')
  const db = new (pg.default || pg).Client({ connectionString: DATABASE_URL })
  await db.connect()
  const one = async (s, p) => (await db.query(s, p)).rows[0]

  console.log('P18 — LEAD FOUNDATION (timing, tags, merge)')
  const org = (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,'developer') RETURNING id`, [`Found ${RUN}`, `found-${RUN}`])).id
  const other = (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,'developer') RETURNING id`, [`Found2 ${RUN}`, `found2-${RUN}`])).id
  try {
    const uid = crypto.randomUUID()
    await db.query(`INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
      VALUES ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),now(),now(),'{}','{"full_name":"Meera"}')`, [uid, `meera-${RUN}@regrow.test`])
    const manager = (await one('SELECT id FROM public.profiles WHERE auth_user_id=$1', [uid])).id
    await db.query(`INSERT INTO public.org_members (org_id, profile_id, role) VALUES ($1,$2,'manager')`, [org, manager])

    let metaLead
    await test('timing: a webhook lead records when it was submitted and received; the report measures each step', async () => {
      const receivedAt = new Date(Date.now() - 2000)
      const submitted = new Date(receivedAt.getTime() - 40_000).toISOString()
      const r = await inbound.processInboundLead(org, {
        provider: 'meta_ads', externalLeadId: `ml-${RUN}`, name: 'Priya Sharma', phone: '9811200001', email: 'priya@buyer.test', submittedAt: submitted,
      }, { receivedAt })
      assert.equal(r.success, true)
      metaLead = r.leadId
      const row = await one('SELECT received_at, source_submitted_at, created_at, assigned_at FROM public.leads WHERE id=$1', [metaLead])
      assert.equal(row.received_at.toISOString(), receivedAt.toISOString())
      assert.equal(row.source_submitted_at.toISOString(), submitted)
      const t = await reports.getPipelineTiming(org, '7d')
      assert.equal(t.stages.submit_to_receipt.n, 1)
      assert.equal(Math.round(t.stages.submit_to_receipt.p50), 40)
      assert.ok(t.stages.receipt_to_saved.p50 >= 1 && t.stages.receipt_to_saved.p50 < 30)
      assert.deepEqual([t.saved_within_30s, t.saved_measured], [1, 1])
    })

    await test('timing: a lead added by hand has no receipt time and is not counted in the first steps', async () => {
      await db.query(`INSERT INTO public.leads (org_id, name, phone, source, status) VALUES ($1,'Walk-in Ravi','9811200009','walk_in','new')`, [org])
      const t = await reports.getPipelineTiming(org, '7d')
      assert.equal(t.leads, 2)
      assert.equal(t.saved_measured, 1)
    })

    await test('tags: the database refuses bad tags and more than 10; the tag filter finds the lead', async () => {
      await db.query(`UPDATE public.leads SET tags='{nri,hot}' WHERE id=$1`, [metaLead])
      for (const bad of [`{"Hot"}`, `{"-x"}`, `{"${'a'.repeat(31)}"}`, `{${Array.from({ length: 11 }, (_, i) => `t${i}`).join(',')}}`]) {
        await assert.rejects(db.query('UPDATE public.leads SET tags=$1 WHERE id=$2', [bad, metaLead]), /leads_tags_valid/, bad)
      }
      const { data } = await createServiceClient().from('leads').select('id').eq('org_id', org).contains('tags', ['nri'])
      assert.deepEqual(data.map((d) => d.id), [metaLead])
    })

    let dupLead
    await test('duplicates: a second enquiry from the same phone is linked to the first; filter syntax in the email cannot widen the match', async () => {
      const r = await inbound.processInboundLead(org, { provider: 'website', idempotencyToken: `w-${RUN}`, name: 'Priya S', phone: '9811200001', email: 'p2@buyer.test' })
      dupLead = r.leadId
      assert.equal(r.duplicateOfId, metaLead)
      // An email crafted to add "or status = new" would have matched every new lead before the fix.
      const sneaky = await inbound.processInboundLead(org, { provider: 'website', idempotencyToken: `s-${RUN}`, name: 'Nobody', phone: '9811299999', email: 'x@y.z,status.eq.new' })
      assert.equal(sneaky.isDuplicate, false, 'no unrelated lead is treated as a match')
    })

    await test('merge: history moves to the main lead, gaps are filled, the duplicate stays as a closed link, and it is audited', async () => {
      await db.query(`INSERT INTO public.lead_activities (lead_id, actor_id, type, note) VALUES ($1,$2,'note_added','called from the duplicate')`, [dupLead, manager])
      await db.query(`INSERT INTO public.lead_tasks (org_id, lead_id, assigned_to, kind, due_at, status, created_by) VALUES ($1,$2,$3,'call',now()+interval '1 day','open',$3)`, [org, dupLead, manager])
      await db.query(`UPDATE public.leads SET tags='{investor}', budget_max=12000000 WHERE id=$1`, [dupLead])
      const { data, error } = await createServiceClient().rpc('merge_leads', { p_org: org, p_target: metaLead, p_source: dupLead, p_actor_profile: manager })
      assert.ifError(error)
      assert.equal(data.moved.activities >= 1, true)
      assert.equal(data.moved.tasks, 1)
      const main = await one('SELECT tags, budget_max, email FROM public.leads WHERE id=$1', [metaLead])
      assert.deepEqual(main.tags.sort(), ['hot', 'investor', 'nri'])
      assert.equal(Number(main.budget_max), 12000000)
      assert.equal(main.email, 'priya@buyer.test', 'what the main lead already had is kept')
      const dup = await one('SELECT status, merged_into_id FROM public.leads WHERE id=$1', [dupLead])
      assert.deepEqual([dup.status, dup.merged_into_id], ['junk', metaLead])
      assert.ok(await one(`SELECT 1 FROM public.org_audit_logs WHERE org_id=$1 AND action='lead.merged' AND target_id=$2`, [org, metaLead]))
      assert.equal(Number((await one('SELECT count(*) n FROM public.lead_activities WHERE lead_id=$1', [dupLead])).n), 0)
    })

    await test('merge: never twice, never across organisations; merged records leave search and duplicate matching', async () => {
      const again = await createServiceClient().rpc('merge_leads', { p_org: org, p_target: metaLead, p_source: dupLead, p_actor_profile: manager })
      assert.match(again.error?.message ?? '', /already merged/)
      const foreign = (await one(`INSERT INTO public.leads (org_id, name, phone, source, status) VALUES ($1,'Elsewhere','9811200077','website','new') RETURNING id`, [other])).id
      const cross = await createServiceClient().rpc('merge_leads', { p_org: org, p_target: metaLead, p_source: foreign, p_actor_profile: manager })
      assert.match(cross.error?.message ?? '', /not found/)
      const found = await search.searchWorkspace(org, { role: 'manager', profileId: manager }, 'priya')
      assert.deepEqual(found.leads.map((l) => l.id), [metaLead], 'the merged record is not offered')
      const third = await inbound.processInboundLead(org, { provider: 'website', idempotencyToken: `t-${RUN}`, name: 'Priya again', phone: '9811200001' })
      assert.equal(third.duplicateOfId, metaLead, 'a new enquiry links to the main lead, not the merged record')
    })

    console.log(`\nP18 lead foundation: ${passed} checks passed.`)
  } finally {
    for (const id of [org, other]) {
      await db.query('DELETE FROM public.leads WHERE org_id=$1', [id]).catch((e) => console.error('cleanup', e.message))
      await db.query('DELETE FROM public.org_members WHERE org_id=$1', [id]).catch(() => {})
      await db.query('DELETE FROM public.organisations WHERE id=$1', [id]).catch((e) => console.error('cleanup', e.message))
    }
    await db.end()
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
