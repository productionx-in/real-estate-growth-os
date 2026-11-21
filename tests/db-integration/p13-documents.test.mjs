// tests/db-integration/p13-documents.test.mjs — document templates and shared documents (migration 20260052,
// lib/dal/documents.ts) against the local Supabase stack.
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
const PHONE_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36'

async function main() {
  if (!globalThis.WebSocket) globalThis.WebSocket = class UnusedRealtimeTransport {}
  const jiti = createJiti(import.meta.url, { alias: { '@': root } })
  const docs = await jiti.import(path.join(root, 'lib/dal/documents.ts'))
  const { createServiceClient } = await jiti.import(path.join(root, 'lib/supabase/server.ts'))
  const pg = await import('pg')
  const db = new (pg.default || pg).Client({ connectionString: DATABASE_URL })
  await db.connect()
  const one = async (s, p) => (await db.query(s, p)).rows[0]
  const mkProfile = async (n, phone = null) => {
    const id = crypto.randomUUID()
    await db.query(`INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
      VALUES ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),now(),now(),'{}',$3)`, [id, `${n.split(' ')[0].toLowerCase()}-${RUN}@regrow.test`, JSON.stringify({ full_name: n })])
    const pid = (await one('SELECT id FROM public.profiles WHERE auth_user_id=$1', [id])).id
    if (phone) await db.query('UPDATE public.profiles SET phone=$2 WHERE id=$1', [pid, phone])
    return { pid, uid: id }
  }

  console.log('P13 — DOCUMENT TEMPLATES & SHARE LINKS')
  const org = (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,'developer') RETURNING id`, [`Skyline ${RUN}`, `doc-${RUN}`])).id
  const other = (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,'developer') RETURNING id`, [`Other ${RUN}`, `doc2-${RUN}`])).id
  let asha
  try {
    const manager = await mkProfile('Meera Manager')
    // Created through the auth service (as real users are), so their email can be looked up for {{agent.email}}.
    const { data: created, error: authErr } = await createServiceClient().auth.admin.createUser({
      email: `asha-${RUN}@regrow.test`, password: crypto.randomBytes(12).toString('hex') + 'Aa1!', email_confirm: true, user_metadata: { full_name: 'Asha Menon' },
    })
    assert.equal(authErr, null, authErr?.message)
    asha = { uid: created.user.id, pid: (await one('SELECT id FROM public.profiles WHERE auth_user_id=$1', [created.user.id])).id }
    await db.query('UPDATE public.profiles SET phone=$2 WHERE id=$1', [asha.pid, '+91 98450 00000'])
    await db.query(`INSERT INTO public.org_members (org_id, profile_id, role) VALUES ($1,$2,'manager'),($1,$3,'sales_exec')`, [org, manager.pid, asha.pid])
    const project = (await one(`INSERT INTO public.projects (org_id, name, slug, city, location, rera_number) VALUES ($1,'Skyline Towers',$2,'Bengaluru','Whitefield','PRM/KA/1') RETURNING id`, [org, `sky-${RUN}`])).id
    const otherProject = (await one(`INSERT INTO public.projects (org_id, name, slug) VALUES ($1,'Elsewhere',$2) RETURNING id`, [other, `else-${RUN}`])).id
    const unit = (await one(`INSERT INTO public.inventory_items (org_id, project_id, unit_number, category, area_value, area_unit, carpet_area, bhk_config, tower_name, floor_number, base_rate, total_price, pricing_breakup)
      VALUES ($1,$2,'B-1204','apartments',1620,'sq ft',1180,'3BHK','Tower B',12,8950,14499000,$3) RETURNING id`,
      [org, project, JSON.stringify({ 'Base price': 13209000, 'GST (5%)': 690000 })])).id
    const foreignUnit = (await one(`INSERT INTO public.inventory_items (org_id, project_id, unit_number, category, area_value) VALUES ($1,$2,'X-1','apartments',1000) RETURNING id`, [other, otherProject])).id
    const lead = (await one(`INSERT INTO public.leads (org_id, name, phone, email, source, status, project_id, assigned_to) VALUES ($1,'Priya Sharma',$2,'priya@buyer.test','website','qualified',$3,$4) RETURNING id`,
      [org, `98450${crypto.randomInt(10000, 99999)}`, project, asha.pid])).id
    await db.query('UPDATE public.leads SET assigned_to=$1 WHERE id=$2', [asha.pid, lead])

    let templateId
    await test('templates: unknown fields are refused; names are unique per organisation; saving works', async () => {
      const typo = await docs.saveTemplate(org, manager.pid, { name: 'Cost sheet', kind: 'cost_sheet', body: 'Hi {{lead.nmae}}' })
      assert.deepEqual([typo.success, typo.status], [false, 400])
      assert.match(typo.error, /lead\.nmae/)
      const ok = await docs.saveTemplate(org, manager.pid, { name: 'Cost sheet', kind: 'cost_sheet',
        body: '# Cost sheet — {{project.name}}\nFor **{{lead.name}}**: unit {{unit.number}} ({{unit.configuration}}).\n\n{{unit.price_breakup}}\n\nTotal {{unit.total_price}}. Call {{agent.name}} on {{agent.phone}} ({{agent.email}}).' })
      assert.equal(ok.success, true, ok.error)
      templateId = ok.data.id
      const dup = await docs.saveTemplate(org, manager.pid, { name: '  cost SHEET ', kind: 'quotation', body: 'x' })
      assert.deepEqual([dup.success, dup.status], [false, 409])
      const elsewhere = await docs.saveTemplate(other, manager.pid, { name: 'Cost sheet', kind: 'cost_sheet', body: 'x' })
      assert.equal(elsewhere.success, true, 'another organisation may use the same name')
      const edit = await docs.saveTemplate(other, manager.pid, { id: templateId, name: 'Hijack', kind: 'other', body: 'x' })
      assert.deepEqual([edit.success, edit.status], [false, 404], 'cannot edit another organisation’s template')
    })

    await test('preview fills in the lead, unit, project and salesperson; reports fields with no value', async () => {
      const p = await docs.previewDocument(org, lead, templateId, unit)
      assert.match(p.body, /^# Cost sheet — Skyline Towers/)
      assert.match(p.body, /For \*\*Priya Sharma\*\*: unit B-1204 \(3BHK\)/)
      assert.match(p.body, /\| Base price \| ₹1,32,09,000 \|\n\| GST \(5%\) \| ₹6,90,000 \|/, 'price before tax')
      assert.match(p.body, /Total ₹1,44,99,000\. Call Asha Menon on \+91 98450 00000 \(asha-/)
      assert.deepEqual(p.missing, [])
      const noUnit = await docs.previewDocument(org, lead, templateId, null)
      assert.deepEqual(noUnit.missing, ['unit.number', 'unit.configuration', 'unit.price_breakup', 'unit.total_price'])
    })

    await test('another organisation’s unit, template or lead cannot be used (app and database)', async () => {
      assert.equal(await docs.previewDocument(org, lead, templateId, foreignUnit), null)
      const r = await docs.createDocument(org, lead, asha.pid, { templateId, unitId: foreignUnit })
      assert.deepEqual([r.success, r.status], [false, 404])
      assert.equal(await docs.previewDocument(other, lead, templateId, null), null)
      const token = crypto.randomBytes(32).toString('base64url')
      await assert.rejects(db.query(`INSERT INTO public.lead_documents (org_id, lead_id, title, body, share_token, expires_at) VALUES ($1,$2,'t','b',$3, now() + interval '1 day')`, [other, lead, token]), /lead belongs to another organisation/)
      await assert.rejects(db.query(`INSERT INTO public.lead_documents (org_id, lead_id, unit_id, title, body, share_token, expires_at) VALUES ($1,$2,$3,'t','b',$4, now() + interval '1 day')`, [org, lead, foreignUnit, token]), /unit belongs to another organisation/)
    })

    let doc
    await test('creating a document freezes the text, issues a 256-bit link and logs it on the lead', async () => {
      const r = await docs.createDocument(org, lead, asha.pid, { templateId, unitId: unit, validDays: 7 })
      assert.equal(r.success, true, r.error)
      doc = r.data
      assert.match(doc.token, /^[A-Za-z0-9_-]{43}$/)
      const days = (new Date(doc.expiresAt) - Date.now()) / 86_400_000
      assert.ok(days > 6.9 && days <= 7, 'expires in 7 days')
      await db.query('UPDATE public.inventory_items SET total_price = 1 WHERE id=$1', [unit])
      const stored = await one('SELECT body FROM public.lead_documents WHERE id=$1', [doc.id])
      assert.match(stored.body, /Total ₹1,44,99,000/, 'a later price change does not alter what was sent')
      const act = await one(`SELECT note FROM public.lead_activities WHERE lead_id=$1 AND metadata->>'event'='document_shared'`, [lead])
      assert.equal(act.note, 'Shared the document “Cost sheet”')
    })

    await test('a link preview (WhatsApp, Facebook…) shows the page but does not count as opened', async () => {
      const seen = await docs.openSharedDocument(doc.token, 'WhatsApp/2.23.20.0 A')
      assert.equal(seen.title, 'Cost sheet')
      assert.equal((await one('SELECT view_count FROM public.lead_documents WHERE id=$1', [doc.id])).view_count, 0)
    })

    await test('the buyer opening it: counted, logged on the lead once, and the salesperson notified once', async () => {
      const first = await docs.openSharedDocument(doc.token, PHONE_UA)
      assert.deepEqual([first.title, first.orgName, first.sharedBy.name, first.sharedBy.phone], ['Cost sheet', `Skyline ${RUN}`, 'Asha Menon', '+91 98450 00000'])
      assert.ok(!('lead_id' in first) && !('org_id' in first), 'no internal ids on the public page')
      await docs.openSharedDocument(doc.token, PHONE_UA)
      const row = await one('SELECT view_count, first_viewed_at, last_viewed_at FROM public.lead_documents WHERE id=$1', [doc.id])
      assert.equal(row.view_count, 2)
      assert.ok(row.first_viewed_at && row.last_viewed_at >= row.first_viewed_at)
      const acts = await db.query(`SELECT note FROM public.lead_activities WHERE lead_id=$1 AND metadata->>'event'='document_viewed'`, [lead])
      assert.deepEqual(acts.rows.map((a) => a.note), ['Opened the document “Cost sheet”'])
      const notes = await db.query(`SELECT recipient_profile_id, title FROM public.notifications WHERE lead_id=$1 AND type='document_viewed'`, [lead])
      assert.equal(notes.rows.length, 1)
      assert.deepEqual([notes.rows[0].recipient_profile_id, notes.rows[0].title], [asha.pid, 'Priya Sharma opened “Cost sheet”'])
      const job = await one(`SELECT count(*)::int n FROM public.scheduled_jobs WHERE kind='notification.dispatch' AND payload->>'notification_id' IN (SELECT id::text FROM public.notifications WHERE lead_id=$1 AND type='document_viewed')`, [lead])
      assert.equal(job.n, 1, 'push delivery queued')
      const listed = await docs.listLeadDocuments(org, lead)
      assert.deepEqual([listed[0].viewCount, listed[0].createdBy], [2, 'Asha Menon'])
    })

    await test('turned-off, expired, unknown and malformed links all show nothing — and are not counted', async () => {
      assert.equal(await docs.revokeDocument(other, lead, doc.id), false, 'another organisation cannot turn it off')
      assert.equal(await docs.revokeDocument(org, lead, doc.id), true)
      assert.equal(await docs.openSharedDocument(doc.token, PHONE_UA), null)
      assert.equal(await docs.openSharedDocument(doc.token, 'WhatsApp/2'), null)
      const r2 = await docs.createDocument(org, lead, asha.pid, { templateId, unitId: null })
      await db.query(`UPDATE public.lead_documents SET expires_at = now() - interval '1 minute' WHERE id=$1`, [r2.data.id])
      assert.equal(await docs.openSharedDocument(r2.data.token, PHONE_UA), null)
      assert.equal((await one('SELECT view_count FROM public.lead_documents WHERE id=$1', [r2.data.id])).view_count, 0)
      assert.equal(await docs.openSharedDocument(crypto.randomBytes(32).toString('base64url'), PHONE_UA), null)
      assert.equal(await docs.openSharedDocument("x' OR 1=1 --", PHONE_UA), null)
      assert.equal((await one(`SELECT count(*)::int n FROM public.record_document_view('short')`)).n, 0)
    })

    await test('removing a template keeps documents already shared working', async () => {
      const r3 = await docs.createDocument(org, lead, manager.pid, { templateId, unitId: unit })
      assert.equal(await docs.archiveTemplate(other, templateId), false)
      assert.equal(await docs.archiveTemplate(org, templateId), true)
      assert.deepEqual((await docs.listTemplates(org)).map((t) => t.id).includes(templateId), false)
      assert.ok(await docs.openSharedDocument(r3.data.token, PHONE_UA))
      const again = await docs.saveTemplate(org, manager.pid, { name: 'Cost sheet', kind: 'cost_sheet', body: 'New {{lead.name}}' })
      assert.equal(again.success, true, 'the name can be reused after removal')
    })

    await test('letterhead (20260071): business details on the document, frozen when shared; edits for one buyer stay on that document', async () => {
      const lhm = await jiti.import(path.join(root, 'lib/documents/letterhead.ts'))
      const { profile, errors } = lhm.normaliseProfile({ legalName: 'Skyline Developers Pvt Ltd', address: '29 MG Road', city: 'Bengaluru', gstin: '29abcde1234f1z5', reraNumber: 'PRM/KA/1', bankAccountNumber: '50200012345678', bankIfsc: 'hdfc0000123' })
      assert.deepEqual(errors, {})
      assert.equal(await docs.saveBusinessProfile(org, manager.pid, profile), true)
      const demand = await docs.saveTemplate(org, manager.pid, { name: `Demand ${RUN}`, kind: 'demand', body: 'Unit {{unit.number}} — amount due ________\n\n{{org.bank_details}}\n\nFor {{org.legal_name}}' })
      assert.equal(demand.success, true, demand.error)
      const p = await docs.previewDocument(org, lead, demand.data.id, unit)
      assert.equal(p.letterhead.name, 'Skyline Developers Pvt Ltd')
      assert.deepEqual(p.letterhead.registrations, ['GSTIN 29ABCDE1234F1Z5', 'RERA PRM/KA/1'])
      assert.match(p.body, /\| IFSC \| HDFC0000123 \|/)
      const filled = p.body.replace('________', '₹14,50,000')
      const r = await docs.createDocument(org, lead, asha.pid, { templateId: demand.data.id, unitId: unit, body: filled })
      assert.equal(r.success, true, r.error)
      const row = await one('SELECT body, edited, letterhead FROM public.lead_documents WHERE id=$1', [r.data.id])
      assert.deepEqual([row.edited, /amount due ₹14,50,000/.test(row.body)], [true, true])
      assert.equal(row.letterhead.name, 'Skyline Developers Pvt Ltd')
      assert.equal((await docs.listTemplates(org)).find((t) => t.id === demand.data.id).body.includes('________'), true, 'the template is unchanged')
      // A later change of company details does not rewrite what this buyer was sent.
      assert.equal(await docs.saveBusinessProfile(org, manager.pid, { ...profile, legalName: 'Renamed Ltd' }), true)
      const shared = await docs.openSharedDocument(r.data.token, PHONE_UA)
      assert.equal(shared.letterhead.name, 'Skyline Developers Pvt Ltd')
      // A template without a letterhead freezes none; the old kinds keep working.
      const plain = await docs.saveTemplate(org, manager.pid, { name: `Plain ${RUN}`, kind: 'letter', body: 'Hi {{lead.name}}', letterhead: false })
      const r2 = await docs.createDocument(org, lead, asha.pid, { templateId: plain.data.id, unitId: null })
      assert.equal((await one('SELECT letterhead, edited FROM public.lead_documents WHERE id=$1', [r2.data.id])).letterhead, null)
      // The database refuses malformed registrations and unknown kinds, whatever the app sends.
      await assert.rejects(db.query(`UPDATE public.org_business_profiles SET gstin='29ABC' WHERE org_id=$1`, [org]), /check/i)
      await assert.rejects(db.query(`UPDATE public.document_templates SET kind='invoice' WHERE id=$1`, [plain.data.id]), /check/i)
      assert.equal((await docs.getBusinessProfile(other)).legalName, null, 'another organisation sees none of it')
    })

    await test('signed-in and anonymous clients cannot read or write these tables, or call the view function', async () => {
      for (const role of ['anon', 'authenticated']) {
        await db.query('BEGIN')
        try {
          await db.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: asha.uid, role })])
          await db.query(`SET LOCAL ROLE ${role}`)
          for (const sql of ['SELECT * FROM public.lead_documents', 'SELECT * FROM public.document_templates', 'SELECT * FROM public.org_business_profiles',
            `INSERT INTO public.org_business_profiles (org_id, legal_name) VALUES ('${org}', 'Hijack')`, `SELECT * FROM public.record_document_view('${doc.token}')`]) {
            await db.query('SAVEPOINT s')
            await assert.rejects(db.query(sql), /permission denied/, `${role}: ${sql}`)
            await db.query('ROLLBACK TO SAVEPOINT s')
          }
        } finally { await db.query('ROLLBACK') }
      }
    })

    console.log(`\nP13 documents: ${passed} checks passed.`)
  } finally {
    for (const id of [org, other]) {
      await db.query('DELETE FROM public.leads WHERE org_id=$1', [id]).catch(() => {})
      await db.query('DELETE FROM public.organisations WHERE id=$1', [id]).catch(() => {})
    }
    await createServiceClient().auth.admin.deleteUser(asha?.uid ?? '').catch(() => {})
    await db.end()
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
