// tests/db-integration/p47-campaigns.test.mjs — marketing campaigns (20260088, lib/dal/campaigns.ts) on the local
// Supabase stack: only owners, admins and managers run campaigns (app and database); sending needs a complete message,
// a segment and the sender's consent confirmation; recipients are frozen once (a second click sends nothing more),
// one per address, with junk, opted-out and address-less leads left out and recorded; the sending job hands e-mails
// to the outbox (category marketing) and re-checks opt-outs at that moment; every e-mail has an unsubscribe link that
// works and is honoured even for e-mails already queued; stopping a campaign withdraws what has not gone out; WhatsApp
// STOP/START keep the opt-out list in step; another organisation can neither see nor touch a campaign.
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
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('FATAL: Supabase env required.'); process.exit(1) }
process.env.NEXT_PUBLIC_APP_URL ||= 'https://re.productionx.in'
const RUN = crypto.randomBytes(4).toString('hex')
const PASSWORD = 'Campaign-Test-' + crypto.randomBytes(8).toString('hex')
let passed = 0
async function test(name, fn) { try { await fn(); passed++; console.log(`  ✓ ${name}`) } catch (e) { console.error(`  ✗ ${name}`); throw e } }

async function main() {
  if (!globalThis.WebSocket) globalThis.WebSocket = class UnusedRealtimeTransport {}
  const jiti = createJiti(import.meta.url, { alias: { '@': root } })
  const C = await jiti.import(path.join(root, 'lib/dal/campaigns.ts'))
  const S = await jiti.import(path.join(root, 'lib/dal/segments.ts'))
  const T = await jiti.import(path.join(root, 'lib/email/templates.ts'))
  const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const pg = await import('pg')
  const db = new (pg.default || pg).Client({ connectionString: DATABASE_URL }); await db.connect()
  const one = async (s, p) => (await db.query(s, p)).rows[0]
  const all = async (s, p) => (await db.query(s, p)).rows
  const authIds = [], orgIds = []
  const mkOrg = async (name) => { const id = (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,'developer') RETURNING id`, [`${name} ${RUN}`, `${name.toLowerCase()}-${RUN}`])).id; orgIds.push(id); return id }
  const mkUser = async (name, org, role) => {
    const { data, error } = await service.auth.admin.createUser({ email: `${name.toLowerCase()}-${RUN}@repx.test`, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } })
    if (error) throw error
    authIds.push(data.user.id)
    const id = (await one('SELECT id FROM public.profiles WHERE auth_user_id=$1', [data.user.id])).id
    await db.query(`INSERT INTO public.org_members (org_id, profile_id, role) VALUES ($1,$2,$3)`, [org, id, role])
    return { profileId: id, role }
  }
  const lead = async (org, name, email, phone, status = 'qualified') => (await one(
    `INSERT INTO public.leads (org_id, name, email, phone, source, status, priority) VALUES ($1,$2,$3,$4,'website',$5,'high') RETURNING id`,
    [org, name, email, phone ?? `9${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`, status])).id
  const ok = (r) => { assert.equal(r.success, true, r.error); return r.data }
  const refused = (r, status, re) => { assert.equal(r.success, false, 'expected a refusal'); if (status) assert.equal(r.status, status, r.error); if (re) assert.match(r.error, re) }
  const outcomes = async (campaignId) => Object.fromEntries((await all(`SELECT address, status, skip_reason FROM public.campaign_recipient_outcomes WHERE campaign_id=$1`, [campaignId])).map((r) => [r.address, r.skip_reason ?? r.status]))

  console.log('P47 — CAMPAIGNS')
  const org = await mkOrg('Lakeside'), other = await mkOrg('Hillcrest')
  try {
    const owner = await mkUser('LkOwner', org, 'owner'), exec = await mkUser('LkExec', org, 'sales_exec')
    const rival = await mkUser('HcOwner', other, 'owner')
    const a = `asha-${RUN}@buyers.test`, b = `bala-${RUN}@buyers.test`, gone = `gone-${RUN}@buyers.test`
    await lead(org, 'Asha Rao', a)
    await lead(org, 'Asha Again', a.toUpperCase())           // same address, other lead → duplicate
    await lead(org, 'Bala Iyer', b)
    await lead(org, 'Gone Person', gone)                     // will have opted out
    await lead(org, 'No Mail', null)                         // no address
    await lead(org, 'Junk Lead', `junk-${RUN}@buyers.test`, null, 'junk')
    await db.query(`INSERT INTO public.marketing_suppressions (org_id, channel, address, source) VALUES ($1,'email',$2,'manual')`, [org, gone])
    const seg = ok(await S.createSegment(org, owner, { kind: 'dynamic', name: 'High priority', filters: { priority: ['high'] } }))

    let camp
    await test('only owners, admins and managers run campaigns (app and database)', async () => {
      refused(await C.createCampaign(org, exec, { name: 'X', channel: 'email', segmentId: seg.id }), 403)
      await assert.rejects(db.query(`INSERT INTO public.campaigns (org_id, name, channel, created_by) VALUES ($1,'x','email',$2)`, [org, exec.profileId]), /only owners, admins and managers/)
      camp = ok(await C.createCampaign(org, owner, { name: 'Diwali offer', channel: 'email', segmentId: seg.id }))
      assert.equal(camp.status, 'draft')
    })

    await test('sending needs a subject, a message, consent — and only {{first_name}} is a placeholder', async () => {
      refused(await C.sendCampaign(org, owner, camp.id, true), 400, /subject/i)
      refused(await C.updateDraft(org, owner, camp.id, { body: 'Hi {{name}}' }), 400, /only \{\{first_name\}\}/i)
      ok(await C.updateDraft(org, owner, camp.id, { subject: 'Hello {{first_name}}', body: 'Hi {{first_name}},\n\nNew homes are open.' }))
      refused(await C.sendCampaign(org, owner, camp.id, false), 400, /confirm/i)
      refused(await C.sendCampaign(org, exec, camp.id, true), 403)
    })

    await test('preview: one per address; duplicates, junk, opted-out and address-less leads are left out', async () => {
      const p = ok(await C.previewAudience(org, owner, camp.id))
      assert.equal(p.willSend, 2, 'Asha and Bala')
      assert.deepEqual(p.skipped, { duplicate: 1, opted_out: 1, no_address: 1, junk: 1 })
    })

    await test('sending freezes recipients once; a second click sends nothing more; the draft can no longer change', async () => {
      assert.deepEqual(ok(await C.sendCampaign(org, owner, camp.id, true)), { queued: 2, skipped: 4 })
      refused(await C.sendCampaign(org, owner, camp.id, true), 409, /already been sent/)
      refused(await C.updateDraft(org, owner, camp.id, { subject: 'Changed' }), 409)
      await assert.rejects(db.query(`UPDATE public.campaigns SET body='changed' WHERE id=$1`, [camp.id]), /cannot be edited/)
      assert.equal(Number((await one(`SELECT count(*) n FROM public.campaign_recipients WHERE campaign_id=$1`, [camp.id])).n), 6)
      assert.ok(await one(`SELECT 1 FROM public.scheduled_jobs WHERE dedupe_key=$1`, [`campaign.send:${camp.id}:0`]), 'the sending job is queued')
    })

    await test('the job hands e-mails to the outbox and re-checks opt-outs at that moment', async () => {
      await db.query(`INSERT INTO public.marketing_suppressions (org_id, channel, address, source) VALUES ($1,'email',$2,'unsubscribe_link')`, [org, b])
      assert.equal(await C.runCampaignBatch(camp.id), 'waiting', 'everyone handed over; Asha’s e-mail waits in the outbox')
      const o = await outcomes(camp.id)
      assert.equal(o[a], 'queued', 'Asha is in the outbox, not yet delivered')
      assert.equal(o[b], 'opted_out', 'Bala unsubscribed after sending started')
      const box = await one(`SELECT o.category, o.template, o.recipient FROM public.email_outbox o JOIN public.campaign_recipients r ON r.email_outbox_id=o.id WHERE r.campaign_id=$1`, [camp.id])
      assert.deepEqual(box, { category: 'marketing', template: 'campaign.email', recipient: a })
      assert.equal((await one(`SELECT status FROM public.campaigns WHERE id=$1`, [camp.id])).status, 'sending', 'still stoppable')
    })

    await test('the e-mail is personalised, escaped, carries a working unsubscribe link, and a late unsubscribe still stops it', async () => {
      const r = await one(`SELECT id, unsubscribe_token FROM public.campaign_recipients WHERE campaign_id=$1 AND address=$2`, [camp.id, a])
      const mail = await T.renderTemplate('campaign.email', { recipientId: r.id }, { db: service, orgId: org })
      assert.equal(mail.subject, 'Hello Asha')
      assert.match(mail.html, new RegExp(`/u/${r.unsubscribe_token}`))
      assert.match(mail.text, /Unsubscribe from these e-mails: https:\/\/re\.productionx\.in\/u\//)
      await assert.rejects(T.renderTemplate('campaign.email', { recipientId: r.id }, { db: service, orgId: other }), /not found in this organisation/)
      const target = await C.unsubscribeTarget(r.unsubscribe_token)
      assert.equal(target.done, false); assert.match(target.address, /^as•+@buyers\.test$/); assert.equal(target.orgName, `Lakeside ${RUN}`)
      assert.equal(await C.unsubscribe(r.unsubscribe_token), true)
      assert.equal((await C.unsubscribeTarget(r.unsubscribe_token)).done, true)
      assert.deepEqual(await T.renderTemplate('campaign.email', { recipientId: r.id }, { db: service, orgId: org }), { skip: 'The recipient unsubscribed.' })
      assert.equal(await C.unsubscribe(crypto.randomUUID()), false)
      // The outbox delivered (or here: settled) the e-mail → the campaign is finished.
      await db.query(`UPDATE public.email_outbox SET status='sent', sent_at=now() WHERE id=(SELECT email_outbox_id FROM public.campaign_recipients WHERE id=$1)`, [r.id])
      assert.equal(await C.runCampaignBatch(camp.id), 'done')
      assert.equal((await one(`SELECT status FROM public.campaigns WHERE id=$1`, [camp.id])).status, 'sent')
      assert.equal((await outcomes(camp.id))[a], 'sent')
    })

    await test('stopping a campaign withdraws e-mails that have not gone out', async () => {
      await db.query(`DELETE FROM public.marketing_suppressions WHERE org_id=$1 AND channel='email' AND address=$2`, [org, b])
      const c2 = ok(await C.createCampaign(org, owner, { name: 'Second', channel: 'email', segmentId: seg.id }))
      ok(await C.updateDraft(org, owner, c2.id, { subject: 'Again', body: 'Hello again' }))
      ok(await C.sendCampaign(org, owner, c2.id, true))
      await C.runCampaignBatch(c2.id)
      const res = ok(await C.cancelCampaign(org, owner, c2.id))
      assert.equal(res.withdrawn, 1, 'Bala’s queued e-mail (Asha is unsubscribed now)')
      const o = await outcomes(c2.id)
      assert.equal(o[b], 'failed', 'withdrawn from the outbox, shown as not delivered')
      refused(await C.cancelCampaign(org, owner, c2.id), 409)
      await assert.rejects(db.query(`UPDATE public.campaigns SET status='sending' WHERE id=$1`, [c2.id]), /finished campaign/)
    })

    await test('WhatsApp: STOP adds the number to the opt-out list, START removes it; no template, no sending', async () => {
      await C.recordWhatsAppConsent(org, '+91 98765 43210', true)
      assert.ok(await one(`SELECT 1 FROM public.marketing_suppressions WHERE org_id=$1 AND channel='whatsapp' AND address='919876543210' AND source='whatsapp_stop'`, [org]))
      await C.recordWhatsAppConsent(org, '919876543210', false)
      assert.equal(await one(`SELECT 1 FROM public.marketing_suppressions WHERE org_id=$1 AND channel='whatsapp' AND address='919876543210'`, [org]), undefined)
      const w = ok(await C.createCampaign(org, owner, { name: 'WA', channel: 'whatsapp', segmentId: seg.id }))
      refused(await C.updateDraft(org, owner, w.id, { waConnectionId: crypto.randomUUID(), waTemplateName: 'promo', waLanguage: 'en' }), 400, /approved marketing template/i)
      refused(await C.sendCampaign(org, owner, w.id, true), 400, /template/i)
      ok(await C.deleteDraft(org, owner, w.id))
    })

    await test('another organisation can neither see nor touch a campaign; recipients cannot cross organisations', async () => {
      assert.equal(await C.getCampaign(other, camp.id), null)
      refused(await C.cancelCampaign(other, rival, camp.id), 404)
      refused(await C.updateDraft(other, rival, camp.id, { name: 'Mine' }), 404)
      assert.equal((await C.listCampaigns(other)).length, 0)
      const rivalLead = await lead(other, 'Rival Buyer', `rival-${RUN}@buyers.test`)
      await assert.rejects(db.query(`INSERT INTO public.campaign_recipients (campaign_id, org_id, lead_id, address, status) VALUES ($1,$2,$3,'x@y.test','queued')`, [camp.id, org, rivalLead]), /another organisation/)
      refused(await C.createCampaign(other, rival, { name: 'Steal', channel: 'email', segmentId: seg.id }), 404, /segment not found/i)
    })
  } finally {
    for (const id of orgIds) {
      await db.query('DELETE FROM public.campaigns WHERE org_id=$1', [id]).catch((e) => console.error('cleanup', e.message))
      await db.query('DELETE FROM public.email_outbox WHERE org_id=$1', [id]).catch((e) => console.error('cleanup', e.message))
      await db.query('DELETE FROM public.lead_segments WHERE org_id=$1', [id]).catch(() => {})
      await db.query('DELETE FROM public.leads_all WHERE org_id=$1', [id]).catch((e) => console.error('cleanup', e.message))
      await db.query('DELETE FROM public.org_members WHERE org_id=$1', [id]).catch(() => {})
      await db.query('DELETE FROM public.organisations WHERE id=$1', [id]).catch((e) => console.error('cleanup', e.message))
    }
    for (const id of authIds) await service.auth.admin.deleteUser(id).catch(() => {})
    await db.end()
  }
  console.log(`\nCampaigns: ${passed} checks passed.`)
}

main().catch((e) => { console.error(e); process.exit(1) })
