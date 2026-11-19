// tests/db-integration/p24-payments-operations.test.mjs — migration 20260062 and lib/payments/monitoring.ts against
// the local Supabase stack: payment alerts (open once, daily reminder, auto-resolve, e-mail to the Platform Owner and
// finance), GST particulars (validated, Platform Owner only, audited), customer billing profiles validated, and
// invoices snapshotting the supplier's and customer's particulars with the right CGST/SGST or IGST split. Nothing is
// mocked except the e-mail adapter.
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
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('FATAL: Supabase env required (URL and service key).'); process.exit(1) }
const RUN = crypto.randomBytes(4).toString('hex')
let passed = 0
async function test(name, fn) { try { await fn(); passed++; console.log(`  ✓ ${name}`) } catch (e) { console.error(`  ✗ ${name}`); throw e } }
class UnusedRealtimeTransport { constructor() { throw new Error('Realtime is not used by these tests') } }
const clientOpts = { auth: { persistSession: false, autoRefreshToken: false }, ...(globalThis.WebSocket ? {} : { realtime: { transport: UnusedRealtimeTransport } }) }

async function main() {
  if (!globalThis.WebSocket) globalThis.WebSocket = class UnusedRealtimeTransport {}
  const jiti = createJiti(import.meta.url, { alias: { '@': root } })
  const monitoring = await jiti.import(path.join(root, 'lib/payments/monitoring.ts'))
  const { invoiceTaxLines, isTaxInvoice } = await jiti.import(path.join(root, 'lib/billing/tax.ts'))
  const db = createClient(SUPABASE_URL, SERVICE_KEY, clientOpts)
  const pg = await import('pg')
  const sql = new (pg.default || pg).Client({ connectionString: DATABASE_URL })
  await sql.connect()
  const one = async (s, p) => (await sql.query(s, p)).rows[0]
  const rejects = (s, p, re) => assert.rejects(sql.query(s, p), re)
  const settingsBefore = await one('SELECT supplier_legal_name, supplier_gstin, supplier_state_code, sac_code FROM public.billing_settings')
  const restoreSettings = () => sql.query('UPDATE public.billing_settings SET supplier_legal_name=$1, supplier_gstin=$2, supplier_state_code=$3, sac_code=$4',
    [settingsBefore.supplier_legal_name, settingsBefore.supplier_gstin, settingsBefore.supplier_state_code, settingsBefore.sac_code])

  const users = [], orgs = []
  const mkUser = async (label) => {
    const { data, error } = await db.auth.admin.createUser({ email: `${label}-${RUN}@regrow.test`, password: 'Ops-Test-' + RUN + '7', email_confirm: true, user_metadata: { full_name: label } })
    if (error) throw error
    users.push(data.user.id)
    return { id: data.user.id, profile: (await one('SELECT id FROM public.profiles WHERE auth_user_id=$1', [data.user.id])).id, email: data.user.email }
  }
  const staff = async (label, role) => { const u = await mkUser(label); await sql.query('INSERT INTO public.platform_users (user_id, role) VALUES ($1,$2)', [u.id, role]); return u }
  const owner = await mkUser('owner')
  const mkOrg = async (name) => {
    const id = (await one(`INSERT INTO public.organisations (name, slug, type) VALUES ($1,$2,'developer') RETURNING id`, [name, `${name.toLowerCase()}-${RUN}`])).id
    orgs.push(id)
    await sql.query(`INSERT INTO public.org_members (org_id, profile_id, role) VALUES ($1,$2,'owner')`, [id, owner.profile])
    return id
  }
  const planInvoice = async (org) => (await one(`SELECT public.billing_issue_plan_invoice($1, 'leads', 'monthly', $2) AS id`, [org, owner.profile])).id
  const inv = (id) => one('SELECT * FROM public.org_subscription_invoices WHERE id=$1', [id])
  const platformOwner = await staff('platform-owner', 'super_admin')
  const finance = await staff('finance', 'finance_admin')
  const kind = `stuck_checkouts`, scope = `p24-${RUN}`

  console.log('P24 — PAYMENTS OPERATIONS')
  try {
    await test('alerts: one open alert per condition; notify on open, not again within a day, then daily; resolve and reopen', async () => {
      const raise = async () => (await one('SELECT public.payment_alert_raise($1,$2,$3) AS r', [kind, scope, 'test detail'])).r
      assert.equal(await raise(), true, 'new alert notifies')
      assert.equal(await raise(), false, 'still open within 24 h: no repeat')
      assert.equal(Number((await one(`SELECT count(*) n FROM public.payment_alerts WHERE kind=$1 AND scope=$2 AND resolved_at IS NULL`, [kind, scope])).n), 1)
      await sql.query(`UPDATE public.payment_alerts SET last_notified_at = now() - interval '25 hours' WHERE kind=$1 AND scope=$2`, [kind, scope])
      assert.equal(await raise(), true, 'daily reminder')
      await sql.query('SELECT public.payment_alert_resolve($1,$2)', [kind, scope])
      assert.equal(Number((await one(`SELECT count(*) n FROM public.payment_alerts WHERE kind=$1 AND scope=$2 AND resolved_at IS NULL`, [kind, scope])).n), 0)
      assert.equal(await raise(), true, 'a new occurrence after resolution notifies again')
      await sql.query('SELECT public.payment_alert_resolve($1,$2)', [kind, scope])
      await rejects(`SELECT public.payment_alert_raise('not_a_kind','x','y')`, [], /check constraint/)
    })

    await test('GST particulars: Platform Owner only, validated, audited; empty values stay empty', async () => {
      const upd = (actor, legal, gstin, state, sac) => sql.query('SELECT public.billing_settings_update_gst($1,$2,$3,$4,$5)', [actor, legal, gstin, state, sac])
      await assert.rejects(upd(finance.id, 'X Pvt Ltd', null, null, null), /permitted|not allowed|denied/i, 'finance cannot change GST particulars')
      await assert.rejects(upd(platformOwner.id, 'X', null, '39', null), /not a valid GST state code/)
      await assert.rejects(upd(platformOwner.id, 'X', '29ABCDE1234F1Z5', '27', null), /belongs to state 29, not 27/)
      await assert.rejects(upd(platformOwner.id, 'X', null, '27', '123456'), /SAC code/)
      await upd(platformOwner.id, 'Test Supplier Pvt Ltd', '27abcde1234f1z5', '27', '998314')
      const s = await one('SELECT supplier_legal_name, supplier_gstin, supplier_state_code, sac_code FROM public.billing_settings')
      assert.deepEqual(s, { supplier_legal_name: 'Test Supplier Pvt Ltd', supplier_gstin: '27ABCDE1234F1Z5', supplier_state_code: '27', sac_code: '998314' })
      const audit = await one(`SELECT actor_role, metadata FROM public.platform_audit_logs WHERE actor_user_id=$1 AND action='payments.gst_settings_changed' ORDER BY created_at DESC LIMIT 1`, [platformOwner.id])
      assert.equal(audit.actor_role, 'super_admin')
      assert.ok(audit.metadata.from && audit.metadata.to, 'before and after recorded')
      await upd(platformOwner.id, '', '', '', '')
      assert.deepEqual(await one('SELECT supplier_legal_name, supplier_gstin, supplier_state_code, sac_code FROM public.billing_settings'), { supplier_legal_name: null, supplier_gstin: null, supplier_state_code: null, sac_code: null })
    })

    let orgSame, orgOther
    await test('customer billing profile: GSTIN must match the state; invalid state codes refused', async () => {
      orgSame = await mkOrg('SameState'); orgOther = await mkOrg('OtherState')
      await rejects(`INSERT INTO public.org_billing_profiles (org_id, legal_name, gstin, state_code) VALUES ($1,'Same State Pvt Ltd','29ABCDE1234F1Z5','27')`, [orgSame], /belongs to state 29/)
      await rejects(`INSERT INTO public.org_billing_profiles (org_id, legal_name, state_code) VALUES ($1,'Bad State','00')`, [orgSame], /not a valid GST state code/)
      await sql.query(`INSERT INTO public.org_billing_profiles (org_id, legal_name, gstin, state_code) VALUES ($1,'Same State Pvt Ltd','27AAAAA1111A1Z1','27')`, [orgSame])
      await sql.query(`INSERT INTO public.org_billing_profiles (org_id, legal_name, gstin, state_code) VALUES ($1,'Other State Pvt Ltd','29BBBBB2222B1Z2','29')`, [orgOther])
    })

    await test('invoices snapshot both parties: CGST+SGST within the state, IGST across states, unaffected by later changes', async () => {
      await sql.query('SELECT public.billing_settings_update_gst($1,$2,$3,$4,$5)', [platformOwner.id, 'Test Supplier Pvt Ltd', '27ABCDE1234F1Z5', '27', '998314'])
      const a = await inv(await planInvoice(orgSame))
      const b = await inv(await planInvoice(orgOther))
      assert.ok(Number(a.tax_cents) > 0)
      assert.deepEqual([Number(a.cgst_cents) + Number(a.sgst_cents), Number(a.igst_cents)], [Number(a.tax_cents), 0])
      assert.deepEqual([Number(b.igst_cents), Number(b.cgst_cents), Number(b.sgst_cents)], [Number(b.tax_cents), 0, 0])
      assert.deepEqual([a.supplier_gstin, a.supplier_legal_name, a.sac_code, a.customer_gstin, a.customer_legal_name, a.place_of_supply], ['27ABCDE1234F1Z5', 'Test Supplier Pvt Ltd', '998314', '27AAAAA1111A1Z1', 'Same State Pvt Ltd', '27'])
      assert.deepEqual(invoiceTaxLines(a).map((l) => l.label), ['CGST (9%)', 'SGST (9%)'])
      assert.deepEqual(invoiceTaxLines(b).map((l) => l.label), ['IGST (18%)'])
      assert.equal(isTaxInvoice(a), true)
      await sql.query('SELECT public.billing_settings_update_gst($1,$2,$3,$4,$5)', [platformOwner.id, 'Renamed Ltd', '29ABCDE1234F1Z5', '29', '998315'])
      const again = await inv(a.id)
      assert.deepEqual([again.supplier_gstin, again.supplier_legal_name, again.sac_code, again.cgst_cents], [a.supplier_gstin, a.supplier_legal_name, a.sac_code, a.cgst_cents], 'issued invoice unchanged')
      // Without the supplier's particulars the invoice is not called a tax invoice and shows no split.
      await sql.query('SELECT public.billing_settings_update_gst($1,$2,$3,$4,$5)', [platformOwner.id, '', '', '', ''])
      const c = await inv(await planInvoice(await mkOrg('NoGst')))
      assert.deepEqual([c.supplier_gstin, Number(c.cgst_cents ?? 0), Number(c.igst_cents ?? 0)], [null, 0, 0])
      assert.equal(isTaxInvoice(c), false)
      assert.deepEqual(invoiceTaxLines(c).map((l) => l.label), ['GST (18%)'])
    })

    await test('monitoring: missing GST particulars with a paying customer opens an alert and e-mails the Platform Owner and finance once', async () => {
      await sql.query(`UPDATE public.org_subscriptions SET status='active' WHERE org_id=$1`, [orgSame])
      const sent = []
      const email = { sendEmail: async (m) => { sent.push(m); return { success: true } }, sendInvitationEmail: async () => ({ success: true }) }
      await monitoring.runAlerts(db, email)
      const open = await one(`SELECT detail FROM public.payment_alerts WHERE kind='gst_unconfigured' AND resolved_at IS NULL`)
      assert.match(open.detail, /supplier GSTIN/)
      const mine = sent.find((m) => /gst unconfigured/i.test(m.text ?? m.html))
      assert.ok(mine, 'alert e-mailed')
      assert.ok(mine.to.includes(platformOwner.email) && mine.to.includes(finance.email), 'to the Platform Owner and finance staff')
      sent.length = 0
      await monitoring.runAlerts(db, email)
      assert.ok(!sent.some((m) => /gst unconfigured/i.test(m.text ?? m.html)), 'not repeated within a day')
      await sql.query('SELECT public.billing_settings_update_gst($1,$2,$3,$4,$5)', [platformOwner.id, 'Test Supplier Pvt Ltd', '27ABCDE1234F1Z5', '27', '998314'])
      await monitoring.runAlerts(db, email)
      assert.equal(Number((await one(`SELECT count(*) n FROM public.payment_alerts WHERE kind='gst_unconfigured' AND resolved_at IS NULL`)).n), 0, 'resolved once configured')
    })

    await test('security: alert and GST functions are not callable by signed-in users or the public', async () => {
      for (const fn of ['payment_alert_raise(text, text, text)', 'payment_alert_resolve(text, text)', 'billing_settings_update_gst(uuid, text, text, text, text)']) {
        const r = await one(`SELECT has_function_privilege('authenticated', 'public.${fn}', 'EXECUTE') a, has_function_privilege('anon', 'public.${fn}', 'EXECUTE') b`)
        assert.deepEqual([r.a, r.b], [false, false], fn)
      }
      const t = await one(`SELECT has_table_privilege('authenticated','public.payment_alerts','SELECT') a`)
      assert.equal(t.a, false)
    })
  } finally {
    await restoreSettings().catch((e) => console.error('restore settings', e.message))
    await sql.query(`UPDATE public.payment_alerts SET resolved_at = now() WHERE resolved_at IS NULL AND (scope = $1 OR kind = 'gst_unconfigured')`, [scope]).catch(() => {})
    await sql.end()
  }
  console.log(`\nP24 payments operations: ${passed} checks passed.`)
}

main().catch((e) => { console.error(e); process.exit(1) })
