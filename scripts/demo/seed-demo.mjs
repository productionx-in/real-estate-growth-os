#!/usr/bin/env node
// scripts/demo/seed-demo.mjs — creates, resets or removes the REGrow DEMO / TEST environment.
//
// STAGING ONLY. The script refuses to run unless every one of these holds:
//   • the Supabase URL is a local stack (127.0.0.1 / localhost) or a <ref>.supabase.co project, and is not the
//     production project;
//   • the database has been marked by its owner in public.deployment_environment (migration 20260063) — kind
//     'local' for a local stack, 'staging' or 'preview' with the same project reference otherwise;
//   • --confirm=<project ref> (or --confirm=local) repeats the target exactly;
//   • VERCEL_ENV / NEXT_PUBLIC_APP_ENV are not 'production'.
//
// Usage (see docs/operations/DEMO_ENVIRONMENT.md):
//   DEMO_PASSWORD=… node scripts/demo/seed-demo.mjs reset  --confirm=<ref>   # remove demo data, then seed again
//   node scripts/demo/seed-demo.mjs purge  --confirm=<ref>                   # remove all demo data
//   node scripts/demo/seed-demo.mjs status --confirm=<ref>                   # what demo data exists
//
// Every record is fictional. Accounts use the reserved example.test domain, are created already confirmed (no
// email is sent) and are tagged app_metadata.regrow_demo = true; organisations carry is_demo = true. Removal goes
// through public.demo_purge(), which deletes only those tagged records and refuses on an unmarked database.
// The private login sheet (passwords and authenticator secrets) is written to .demo-credentials/ (git-ignored).
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const PRODUCTION_REF = 'rtbvzqwwhefyyuhpoznu'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const args = process.argv.slice(2)
const command = args.find((a) => !a.startsWith('--')) ?? 'status'
const confirm = (args.find((a) => a.startsWith('--confirm=')) ?? '').slice('--confirm='.length)
const outDir = path.resolve(root, process.env.DEMO_CREDENTIALS_DIR || '.demo-credentials')

function fail(message) { console.error(`REFUSED: ${message}`); process.exit(1) }

// ── 1. Positive identification of a non-production target ────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
if (!['reset', 'purge', 'status'].includes(command)) fail(`unknown command "${command}" (use reset, purge or status)`)
if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) fail('NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are required')
if ([process.env.VERCEL_ENV, process.env.NEXT_PUBLIC_APP_ENV].includes('production')) fail('this shell is configured for production')
if (SUPABASE_URL.includes(PRODUCTION_REF) || SERVICE_KEY.includes(PRODUCTION_REF)) fail('this is the production project')

let host
try { host = new URL(SUPABASE_URL).hostname } catch { fail('NEXT_PUBLIC_SUPABASE_URL is not a URL') }
const isLocal = ['127.0.0.1', 'localhost', '::1', 'host.docker.internal'].includes(host)
const ref = isLocal ? 'local' : (host.match(/^([a-z0-9]{20})\.supabase\.co$/)?.[1] ?? null)
if (!ref) fail(`cannot identify the Supabase project from ${host}`)
if (ref === PRODUCTION_REF) fail('this is the production project')
if (confirm !== ref) fail(`pass --confirm=${ref} to confirm the target (got "${confirm || 'nothing'}")`)

class UnusedRealtimeTransport { constructor() { throw new Error('Realtime is not used by this script') } }
const opts = { auth: { persistSession: false, autoRefreshToken: false }, ...(globalThis.WebSocket ? {} : { realtime: { transport: UnusedRealtimeTransport } }) }
const sb = createClient(SUPABASE_URL, SERVICE_KEY, opts)

const { data: marker, error: markerErr } = await sb.from('deployment_environment').select('kind, project_ref').maybeSingle()
if (markerErr) fail(`cannot read the environment marker (${markerErr.message}). Is migration 20260063 applied?`)
if (!marker) fail('this database is not marked as a non-production environment (see docs/operations/DEMO_ENVIRONMENT.md, step 2)')
if (isLocal ? marker.kind !== 'local' : !(['staging', 'preview'].includes(marker.kind) && marker.project_ref === ref)) {
  fail(`the environment marker (${marker.kind} / ${marker.project_ref}) does not match this target (${ref})`)
}
console.log(`Target: ${isLocal ? 'local Supabase stack' : `Supabase project ${ref}`} — marked ${marker.kind}. OK.`)

// ── 2. Helpers ───────────────────────────────────────────────────────────────────────────────────
async function insert(table, rows, select = 'id') {
  const { data, error } = await sb.from(table).insert(rows, { defaultToNull: false }).select(select)
  if (error) throw new Error(`${table}: ${error.message}`)
  return data
}
async function rpc(fn, params) {
  const { data, error } = await sb.rpc(fn, params)
  if (error) throw new Error(`${fn}: ${error.message}`)
  return data
}
// Deterministic data on every run.
let seed = 20261119
const rand = () => { seed = (seed + 0x6d2b79f5) | 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
const pick = (list) => list[Math.floor(rand() * list.length)]
const DAY = 86_400_000
const now = Date.now()
const at = (days, hour = 11) => { const d = new Date(now + days * DAY); d.setUTCHours(hour - 5, 30, 0, 0); return d.toISOString() } // IST hour

async function status() {
  const { data: orgs } = await sb.from('organisations').select('id, name, slug, type').eq('is_demo', true)
  const { data: users } = await sb.auth.admin.listUsers({ perPage: 1000 })
  const demoUsers = (users?.users ?? []).filter((u) => u.app_metadata?.regrow_demo === true)
  console.log(`Demo organisations: ${orgs?.length ?? 0}`)
  for (const o of orgs ?? []) console.log(`  • ${o.name} (${o.type}) /${o.slug}`)
  console.log(`Demo accounts: ${demoUsers.length}`)
  for (const u of demoUsers) console.log(`  • ${u.email}`)
}

async function purge() {
  const result = await rpc('demo_purge', {})
  console.log(`Removed demo data: ${result.organisations} organisations, ${result.users} accounts, ${result.rows} related records.`)
}

// ── 3. TOTP for internal staff (their console requires an authenticator) ───────────────────────────
function base32Decode(s) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = '', out = []
  for (const c of s.replace(/=+$/, '').toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, '0')
  for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2))
  return Buffer.from(out)
}
function totp(secret, t = Date.now()) {
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(t / 30000)))
  const h = crypto.createHmac('sha1', base32Decode(secret)).update(counter).digest()
  const o = h[h.length - 1] & 0xf
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000)).padStart(6, '0')
}
async function enrolAuthenticator(email, password) {
  const client = createClient(SUPABASE_URL, ANON_KEY, opts)
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password })
  if (signInErr) throw new Error(`sign-in ${email}: ${signInErr.message}`)
  const { data: enrol, error: enrolErr } = await client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'REGrow demo authenticator' })
  if (enrolErr) throw new Error(`enrol ${email}: ${enrolErr.message}`)
  const { data: ch, error: chErr } = await client.auth.mfa.challenge({ factorId: enrol.id })
  if (chErr) throw new Error(`challenge ${email}: ${chErr.message}`)
  const { error: vErr } = await client.auth.mfa.verify({ factorId: enrol.id, challengeId: ch.id, code: totp(enrol.totp.secret) })
  if (vErr) throw new Error(`verify ${email}: ${vErr.message}`)
  await client.auth.signOut()
  return { secret: enrol.totp.secret, uri: enrol.totp.uri }
}

// ── 4. The demo world ───────────────────────────────────────────────────────────────────────────
const ORGS = {
  apex: { name: 'Apex Developers Demo', slug: 'apex-developers-demo', type: 'developer', website: 'https://apex.example.test', prefix: 'builder' },
  prime: { name: 'Prime Channel Partners Demo', slug: 'prime-channel-partners-demo', type: 'channel_partner', website: 'https://prime.example.test', prefix: 'partner' },
  growth: { name: 'Growth Realty Agency Demo', slug: 'growth-realty-agency-demo', type: 'channel_partner', website: 'https://growth.example.test', prefix: 'agency' },
}
const ORG_PEOPLE = {
  apex: [['admin', 'owner', 'Arjun Mehta (Demo)'], ['manager', 'manager', 'Kavya Iyer (Demo)'], ['sales', 'sales_exec', 'Rohan Desai (Demo)']],
  prime: [['admin', 'owner', 'Neha Kapoor (Demo)'], ['manager', 'manager', 'Vikram Sethi (Demo)'], ['sales', 'sales_exec', 'Pooja Nair (Demo)']],
  growth: [['admin', 'owner', 'Sameer Khan (Demo)'], ['manager', 'manager', 'Ananya Rao (Demo)'], ['sales', 'sales_exec', 'Karan Joshi (Demo)']],
}
const STAFF = [
  ['superadmin@example.test', 'super_admin', 'Platform Owner (Demo)'],
  ['sales@regrow-demo.example.test', 'sales_rep', 'Internal Sales Executive (Demo)'],
  ['manager@regrow-demo.example.test', 'sales_manager', 'Internal Sales Manager (Demo)'],
  ['support@regrow-demo.example.test', 'support_agent', 'Support Agent (Demo)'],
  ['finance@regrow-demo.example.test', 'finance_admin', 'Finance (Demo)'],
  ['auditor@regrow-demo.example.test', 'auditor', 'Auditor (Demo)'],
]
const FIRST = ['Aarav', 'Ishita', 'Kabir', 'Meera', 'Nikhil', 'Sana', 'Tanvi', 'Yash', 'Diya', 'Rahul', 'Aditi', 'Varun', 'Riya', 'Siddharth', 'Nisha', 'Pranav', 'Zoya', 'Harsh', 'Lavanya', 'Omkar', 'Farah', 'Dev', 'Gauri', 'Manav']
const LAST = ['Sharma', 'Kulkarni', 'Patil', 'Reddy', 'Bose', 'Menon', 'Chopra', 'Gupta', 'Jain', 'Pillai', 'Shetty', 'Verma', 'Bhat', 'Saxena', 'Joshi', 'Malhotra']
let phoneSeq = 0
const demoPhone = () => `+91 90000 ${String(10000 + (phoneSeq++ * 37) % 89999).padStart(5, '0')}` // fictional range
const buyer = () => { const f = pick(FIRST), l = pick(LAST); return { name: `${f} ${l}`, email: `${f}.${l}.${phoneSeq}@buyers.example.test`.toLowerCase(), phone: demoPhone() } }

async function seedAll(password) {
  const credentials = []
  const profileOf = {}

  // Plans: the current trial plan versions (limits 5 projects / 500 units / 1,000 leads).
  const { data: versions, error: vErr } = await sb.from('subscription_plan_versions').select('id, subscription_plans!inner(code)').eq('is_current', true)
  if (vErr) throw new Error(vErr.message)
  const versionFor = (code) => versions.find((v) => v.subscription_plans.code === code)?.id ?? null

  // Organisations, subscriptions and members.
  const org = {}
  for (const [key, o] of Object.entries(ORGS)) {
    const [row] = await insert('organisations', { name: o.name, slug: o.slug, type: o.type, website: o.website, plan: 'free', is_demo: true })
    org[key] = row.id
    await insert('org_subscriptions', {
      org_id: row.id, plan_tier: 'free', status: 'trial', billing_cycle: 'monthly', included_seats: 10,
      plan_version_id: versionFor(o.type === 'developer' ? 'trial_developer' : 'trial_agency'),
      current_period_start: at(-14), current_period_end: at(46),
    })
    for (const [suffix, role, fullName] of ORG_PEOPLE[key]) {
      const email = `${o.prefix}.${suffix}@example.test`
      const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName }, app_metadata: { regrow_demo: true } })
      if (error) throw new Error(`create ${email}: ${error.message}`)
      const { data: p } = await sb.from('profiles').select('id').eq('auth_user_id', data.user.id).single()
      await insert('org_members', { org_id: row.id, profile_id: p.id, role, status: 'active' })
      profileOf[`${key}.${suffix}`] = p.id
      credentials.push({ email, role, org: o.name, name: fullName })
    }
  }
  const P = (k) => profileOf[k]

  // Teams.
  for (const key of Object.keys(ORGS)) {
    const [team] = await insert('teams', { org_id: org[key], name: `${ORGS[key].name.replace(' Demo', '')} Sales Team`, description: 'Demo team' })
    await insert('team_members', [
      { org_id: org[key], team_id: team.id, profile_id: P(`${key}.manager`), weight: 1, daily_capacity: 20, is_on_duty: true },
      { org_id: org[key], team_id: team.id, profile_id: P(`${key}.sales`), weight: 2, daily_capacity: 30, is_on_duty: true },
    ])
  }

  // ── Apex: projects, towers, inventory ──
  const [heights, greens] = await insert('projects', [
    { org_id: org.apex, name: 'Apex Heights Demo', slug: 'apex-heights-demo', code: 'AHD', type: 'residential', status: 'launched', category: 'apartments', city: 'Pune', location: 'Baner, Pune (fictional)', description: 'DEMO project — fictional 2 and 3 BHK apartments across two towers.', rera_number: 'DEMO-RERA-0001', total_units_count: 48, launch_date: at(-120).slice(0, 10), completion_date: at(900).slice(0, 10), amenities: ['Clubhouse', 'Pool', 'Gym', 'Kids play area'] },
    { org_id: org.apex, name: 'Apex Greens Villas Demo', slug: 'apex-greens-villas-demo', code: 'AGV', type: 'residential', status: 'pre_launch', category: 'villas_gated_communities', city: 'Pune', location: 'Hinjewadi, Pune (fictional)', description: 'DEMO project — fictional gated villa community.', rera_number: 'DEMO-RERA-0002', total_units_count: 12, launch_date: at(30).slice(0, 10) },
  ])
  const towers = await insert('project_hierarchy_nodes', [
    { org_id: org.apex, project_id: heights.id, node_type: 'tower', name: 'Tower A', code: 'A', sequence_order: 1 },
    { org_id: org.apex, project_id: heights.id, node_type: 'tower', name: 'Tower B', code: 'B', sequence_order: 2 },
  ], 'id, name, code')
  const units = []
  for (const [ti, tower] of towers.entries()) {
    for (let floor = 1; floor <= 6; floor++) for (let u = 1; u <= 4; u++) {
      const three = u === 1 || u === 4
      const area = three ? 1350 : 980
      const rate = 9200 + floor * 75
      units.push({ org_id: org.apex, project_id: heights.id, hierarchy_node_id: tower.id, tower_name: tower.name, unit_number: `${tower.code}-${floor}0${u}`, category: 'apartments', area_value: area, area_unit: 'sqft', carpet_area: Math.round(area * 0.72), floor_number: floor, bhk_config: three ? '3BHK' : '2BHK', bedrooms: three ? 3 : 2, bathrooms: three ? 3 : 2, facing: pick(['east', 'west', 'north', 'south']), base_rate: rate, total_price: area * rate, status: 'available', internal_notes: ti === 0 && floor === 6 ? 'Premium top floor (demo)' : null })
    }
  }
  for (let v = 1; v <= 12; v++) units.push({ org_id: org.apex, project_id: greens.id, unit_number: `V-${String(v).padStart(2, '0')}`, category: 'villas_gated_communities', area_value: 2400 + (v % 3) * 300, area_unit: 'sqft', plot_area: 3000 + (v % 3) * 400, bhk_config: '4BHK', bedrooms: 4, bathrooms: 4, base_rate: 11500, total_price: (2400 + (v % 3) * 300) * 11500, status: 'available', is_corner_plot: v % 4 === 0 })
  const inv = await insert('inventory_items', units, 'id, unit_number, total_price, project_id')
  const unit = (n) => inv.find((x) => x.unit_number === n)
  // Sold / booked / on hold / blocked spread.
  const statusUpdates = { sold: ['A-101', 'A-102', 'A-201', 'B-101', 'B-102'], booked: ['A-301', 'B-201', 'B-302'], on_hold: ['A-401', 'B-401'], blocked: ['A-504', 'B-503'] }
  for (const [s, list] of Object.entries(statusUpdates)) {
    const { error } = await sb.from('inventory_items').update({ status: s }).in('id', list.map((n) => unit(n).id))
    if (error) throw new Error(`inventory status: ${error.message}`)
  }

  // ── Leads ──
  const SOURCES = ['website', 'meta_ads', 'google_ads', '99acres', 'housing', 'magicbricks', 'whatsapp', 'referral', 'walk_in']
  const makeLeads = (key, plan) => plan.map(([status, n]) => Array.from({ length: n }, () => [status])).flat().map(([status], i) => {
    const b = buyer()
    const exec = P(`${key}.sales`), mgr = P(`${key}.manager`)
    const assigned = status === 'new' && i % 3 === 0 ? null : (i % 3 === 2 ? mgr : exec)
    const daysAgo = 2 + Math.floor(rand() * 40)
    const budget = 6_000_000 + Math.floor(rand() * 10) * 1_000_000
    return {
      org_id: org[key], name: b.name, email: b.email, phone: b.phone, source: SOURCES[i % SOURCES.length], status,
      priority: ['negotiation', 'site_visited'].includes(status) ? 'high' : pick(['low', 'medium', 'medium', 'high']),
      budget_min: budget, budget_max: budget + 3_000_000, assigned_to: assigned,
      project_id: key === 'apex' ? (i % 5 === 4 ? greens.id : heights.id) : null,
      notes: 'DEMO lead — fictional buyer.', tags: ['demo'],
      req_configurations: [pick(['2BHK', '3BHK'])], req_locations: [pick(['Baner', 'Hinjewadi', 'Wakad', 'Kharadi'])],
      created_at: new Date(now - daysAgo * DAY).toISOString(),
      next_follow_up_at: ['lost', 'booked', 'junk'].includes(status) ? null : at(i % 4 === 0 ? -2 : (i % 4) , 11),
      campaign_name: ['meta_ads', 'google_ads'].includes(SOURCES[i % SOURCES.length]) ? 'Demo Diwali Launch Campaign' : null,
    }
  })
  const apexLeads = await insert('leads', makeLeads('apex', [['new', 6], ['contacted', 7], ['qualified', 6], ['site_visit_scheduled', 4], ['site_visited', 4], ['negotiation', 4], ['booked', 3], ['lost', 2], ['junk', 1]]), 'id, status, assigned_to, project_id, name, phone')
  const primeLeads = await insert('leads', makeLeads('prime', [['new', 3], ['contacted', 4], ['qualified', 3], ['site_visit_scheduled', 2], ['negotiation', 2], ['lost', 1]]), 'id, status, assigned_to, name, phone')
  const growthLeads = await insert('leads', makeLeads('growth', [['new', 3], ['contacted', 3], ['qualified', 3], ['site_visited', 2], ['negotiation', 1], ['lost', 1]]), 'id, status, assigned_to, name, phone')

  // Activities, follow-up tasks (open, overdue, done).
  for (const [key, leads] of [['apex', apexLeads], ['prime', primeLeads], ['growth', growthLeads]]) {
    const acts = [], tasks = []
    leads.forEach((l, i) => {
      const actor = l.assigned_to ?? P(`${key}.manager`)
      acts.push({ lead_id: l.id, actor_id: actor, type: 'created', note: 'Lead captured (demo).', created_at: at(-20 - (i % 10)) })
      if (l.status !== 'new') acts.push({ lead_id: l.id, actor_id: actor, type: 'call_logged', note: pick(['Spoke to buyer; wants a weekend visit.', 'Discussed budget and loan eligibility.', 'Shared brochure on WhatsApp.', 'Buyer comparing with a nearby project.']), created_at: at(-6 - (i % 5), 15) })
      if (['qualified', 'site_visit_scheduled', 'site_visited', 'negotiation'].includes(l.status)) acts.push({ lead_id: l.id, actor_id: actor, type: 'status_changed', note: `Moved to ${l.status.replaceAll('_', ' ')}.`, metadata: { to: l.status }, created_at: at(-3, 12) })
      if (!['lost', 'junk', 'booked'].includes(l.status)) {
        const overdue = i % 4 === 0
        tasks.push({ org_id: org[key], lead_id: l.id, assigned_to: l.assigned_to ?? P(`${key}.manager`), kind: pick(['call', 'whatsapp', 'meeting']), due_at: overdue ? at(-1 - (i % 3), 10) : at(1 + (i % 5), 12), note: overdue ? 'Overdue follow-up (demo)' : 'Follow up on pricing (demo)', status: 'open', created_by: P(`${key}.manager`) })
      }
      if (i % 5 === 1) tasks.push({ org_id: org[key], lead_id: l.id, assigned_to: l.assigned_to ?? P(`${key}.manager`), kind: 'call', due_at: at(-5, 11), note: 'Intro call done (demo)', status: 'done', completed_at: at(-5, 12), created_by: P(`${key}.manager`) })
    })
    await insert('lead_activities', acts)
    await insert('lead_tasks', tasks)
  }

  // Site visits (Apex): upcoming, completed with outcomes, a no-show.
  const visits = []
  apexLeads.filter((l) => l.status === 'site_visit_scheduled').forEach((l, i) => visits.push({ org_id: org.apex, project_id: l.project_id, lead_id: l.id, assigned_to: l.assigned_to ?? P('apex.sales'), scheduled_at: at(i === 0 ? 0 : i + 1, 11 + i), status: 'scheduled', visitor_count: 2 + (i % 2), cab_required: i % 2 === 0, notes: 'Demo visit', created_by: P('apex.manager') }))
  apexLeads.filter((l) => ['site_visited', 'negotiation', 'booked'].includes(l.status)).forEach((l, i) => visits.push({ org_id: org.apex, project_id: l.project_id, lead_id: l.id, assigned_to: l.assigned_to ?? P('apex.sales'), scheduled_at: at(-3 - i, 11), status: 'completed', checked_in_at: at(-3 - i, 11), completed_at: at(-3 - i, 12), outcome: l.status === 'booked' ? 'booked' : l.status === 'negotiation' ? 'negotiation' : pick(['interested', 'follow_up_needed']), rating: 3 + (i % 3), visitor_count: 2, notes: 'Demo visit completed', created_by: P('apex.manager') }))
  const lostLead = apexLeads.find((l) => l.status === 'lost')
  visits.push({ org_id: org.apex, project_id: lostLead.project_id, lead_id: lostLead.id, assigned_to: P('apex.sales'), scheduled_at: at(-8, 16), status: 'no_show', notes: 'Buyer did not arrive (demo)', created_by: P('apex.manager') })
  await insert('site_visits', visits)

  // Channel partner directory entries (developer side) for both partner firms.
  const cps = await insert('channel_partners', [
    { org_id: org.apex, firm_name: ORGS.prime.name, contact_person: 'Neha Kapoor (Demo)', phone: demoPhone(), email: 'partner.admin@example.test', rera_registration_number: 'DEMO-CP-RERA-11', tier: 'gold', status: 'active', default_commission_rate: 2.0, notes: 'Demo partner' },
    { org_id: org.apex, firm_name: ORGS.growth.name, contact_person: 'Sameer Khan (Demo)', phone: demoPhone(), email: 'agency.admin@example.test', rera_registration_number: 'DEMO-CP-RERA-12', tier: 'silver', status: 'active', default_commission_rate: 1.5, notes: 'Demo partner' },
  ])

  // Blockings, bookings and deals (pipeline values consistent with inventory prices).
  const negotiation = apexLeads.filter((l) => l.status === 'negotiation')
  const booked = apexLeads.filter((l) => l.status === 'booked')
  await insert('inventory_blockings', [
    { org_id: org.apex, project_id: heights.id, inventory_id: unit('A-504').id, lead_id: negotiation[0].id, blocked_by: P('apex.sales'), status: 'active', token_amount: 100000, payment_reference: 'DEMO-TOKEN-001', expires_at: at(3), remarks: 'Demo block' },
    { org_id: org.apex, project_id: heights.id, inventory_id: unit('B-503').id, lead_id: negotiation[1].id, blocked_by: P('apex.manager'), status: 'active', token_amount: 50000, payment_reference: 'DEMO-TOKEN-002', expires_at: at(1), remarks: 'Demo block — expiring soon' },
  ])
  const bookedUnits = ['A-301', 'B-201', 'B-302']
  await insert('bookings', booked.map((l, i) => {
    const u = unit(bookedUnits[i])
    return { org_id: org.apex, project_id: heights.id, inventory_id: u.id, lead_id: l.id, channel_partner_id: i === 0 ? cps[0].id : null, booking_number: `DEMO-BK-${String(i + 1).padStart(3, '0')}`, booking_date: at(-4 - i * 3).slice(0, 10), status: ['confirmed', 'agreement_signed', 'confirmed'][i], base_price: u.total_price, total_amount: Math.round(u.total_price * 1.08), booking_amount_received: Math.round(u.total_price * 0.1), payment_plan: 'construction_linked', remarks: 'Demo booking' }
  }))
  const deals = []
  negotiation.forEach((l, i) => { const u = unit(['A-504', 'B-503', 'A-402', 'B-402'][i]); deals.push({ org_id: org.apex, project_id: heights.id, lead_id: l.id, inventory_id: u.id, assigned_to: l.assigned_to, stage: i < 2 ? 'unit_blocked' : 'negotiation', deal_value: u.total_price, probability: i < 2 ? 70 : 50, expected_close_date: at(10 + i * 5).slice(0, 10), notes: 'Demo deal' }) })
  apexLeads.filter((l) => l.status === 'site_visited').forEach((l, i) => { const u = unit(['A-203', 'B-204', 'A-302', 'B-303'][i]); deals.push({ org_id: org.apex, project_id: heights.id, lead_id: l.id, inventory_id: u.id, assigned_to: l.assigned_to, stage: 'site_visit_completed', deal_value: u.total_price, probability: 30, expected_close_date: at(30 + i * 7).slice(0, 10), notes: 'Demo deal' }) })
  booked.forEach((l, i) => { const u = unit(bookedUnits[i]); deals.push({ org_id: org.apex, project_id: heights.id, lead_id: l.id, inventory_id: u.id, channel_partner_id: i === 0 ? cps[0].id : null, assigned_to: l.assigned_to, stage: 'booked', deal_value: u.total_price, probability: 100, expected_close_date: at(-4 - i * 3).slice(0, 10), notes: 'Demo deal' }) })
  deals.push({ org_id: org.apex, project_id: heights.id, lead_id: lostLead.id, assigned_to: P('apex.sales'), stage: 'lost', deal_value: unit('A-202').total_price, probability: 0, loss_reason: 'Chose a ready-to-move project (demo)', notes: 'Demo deal' })
  await insert('deals', deals)

  // ── Partner network, through the same SQL functions the app uses (audited on both sides) ──
  const code = async (agency, admin) => rpc('partner_ensure_code', { p_agency: org[agency], p_actor: P(`${admin}`) })
  const primeCode = await code('prime', 'prime.admin')
  const growthCode = await code('growth', 'growth.admin')
  const request = async (c) => rpc('partner_request', { p_developer: org.apex, p_actor: P('apex.admin'), p_code: c })
  const pPrime = await request(primeCode)
  const pGrowth = await request(growthCode)
  await rpc('partner_set_status', { p_org: org.prime, p_actor: P('prime.admin'), p_partnership: pPrime, p_action: 'accept' })
  await rpc('partner_set_status', { p_org: org.growth, p_actor: P('growth.admin'), p_partnership: pGrowth, p_action: 'accept' })
  await sb.from('org_partnerships').update({ channel_partner_id: cps[0].id }).eq('id', pPrime)
  await sb.from('org_partnerships').update({ channel_partner_id: cps[1].id }).eq('id', pGrowth)
  await rpc('partner_share_project', { p_developer: org.apex, p_actor: P('apex.admin'), p_partnership: pPrime, p_project: heights.id, p_visibility: 'availability_and_price' })
  await rpc('partner_share_project', { p_developer: org.apex, p_actor: P('apex.admin'), p_partnership: pPrime, p_project: greens.id, p_visibility: 'availability' })
  await rpc('partner_share_project', { p_developer: org.apex, p_actor: P('apex.admin'), p_partnership: pGrowth, p_project: heights.id, p_visibility: 'availability' })
  const register = async (agency, actor, partnership, lead, note) => rpc('partner_submit_registration', { p_agency: org[agency], p_actor: P(actor), p_partnership: partnership, p_project: heights.id, p_agency_lead: lead.id, p_note: note, p_consent: true, p_consent_version: 'cp-share-v1' })
  const r1 = await register('prime', 'prime.manager', pPrime, primeLeads.find((l) => l.status === 'negotiation'), 'Buyer keen on a 3BHK in Tower A (demo)')
  await register('prime', 'prime.admin', pPrime, primeLeads.find((l) => l.status === 'qualified'), 'Second visit planned (demo)')
  const r3 = await register('growth', 'growth.manager', pGrowth, growthLeads.find((l) => l.status === 'site_visited'), 'Visited sample flat (demo)')
  await register('growth', 'growth.admin', pGrowth, growthLeads.find((l) => l.status === 'qualified'), 'Looking for a 2BHK (demo)')
  await rpc('partner_review_registration', { p_developer: org.apex, p_actor: P('apex.admin'), p_registration: r1.registration_id, p_accept: true, p_reason: null })
  await rpc('partner_review_registration', { p_developer: org.apex, p_actor: P('apex.manager'), p_registration: r3.registration_id, p_accept: false, p_reason: 'Buyer already in direct discussion with Apex (demo)' })

  // ── Internal staff, with authenticators ──
  const staffIds = {}
  for (const [email, role, fullName] of STAFF) {
    const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName }, app_metadata: { regrow_demo: true } })
    if (error) throw new Error(`create ${email}: ${error.message}`)
    await insert('platform_users', { user_id: data.user.id, role, is_active: true, mfa_enforced: true })
    const factor = await enrolAuthenticator(email, password)
    staffIds[role] = data.user.id
    credentials.push({ email, role, org: 'REGrow internal (platform)', name: fullName, ...factor })
  }

  // Internal sales pipeline (fictional prospects) and support cases from the demo customers.
  const prospects = [
    ['Skyline Estates Demo', 'developer', 'Mumbai', 'qualified', 'sales_rep', 2], ['Harbour Homes Demo', 'developer', 'Chennai', 'demo_scheduled', 'sales_rep', 1],
    ['Metro Brokers Demo', 'channel_partner', 'Bengaluru', 'contacted', 'sales_rep', -1], ['Riverfront Realty Demo', 'channel_partner', 'Hyderabad', 'negotiation', 'sales_manager', 3],
    ['Lakeside Builders Demo', 'developer', 'Nagpur', 'new', 'sales_manager', 0], ['Sunrise Properties Demo', 'developer', 'Ahmedabad', 'lost', 'sales_rep', null],
  ]
  const pRows = await insert('internal_prospects', prospects.map(([company, type, city, stage, owner, follow], i) => ({
    company_name: company, org_type: type, city, team_size: 8 + i * 5, source: ['website', 'referral', 'event', 'outbound', 'partner', 'website'][i], stage,
    lost_reason: stage === 'lost' ? 'Chose to stay on spreadsheets for now (demo)' : null, owner_user_id: staffIds[owner],
    contact_name: `${FIRST[i]} ${LAST[i]} (Demo)`, contact_email: `contact${i + 1}@prospects.example.test`, contact_phone: demoPhone(),
    notes: 'Fictional prospect for the demo environment.', next_follow_up_at: follow === null ? null : at(follow, 12), created_by: staffIds.sales_manager,
  })))
  await insert('internal_prospect_activities', pRows.flatMap((p, i) => [
    { prospect_id: p.id, kind: 'call', body: 'Discovery call: 3 sales teams, leads from portals and Meta (demo).', actor: staffIds[prospects[i][4]], created_at: at(-6 + i * 0) },
    { prospect_id: p.id, kind: 'note', body: 'Shared pricing overview (demo).', actor: staffIds[prospects[i][4]], created_at: at(-2) },
  ]))
  const cases = await insert('support_cases', [
    { org_id: org.apex, opened_by_profile: P('apex.admin'), subject: 'How do I share Tower B inventory with a partner? (demo)', category: 'question', priority: 'normal', status: 'open' },
    { org_id: org.prime, opened_by_profile: P('prime.admin'), subject: 'Registration shows "submitted" for two days (demo)', category: 'problem', priority: 'high', status: 'in_progress', assignee_user_id: staffIds.support_agent },
    { org_id: org.growth, opened_by_profile: P('growth.admin'), subject: 'Invoice copy for our trial (demo)', category: 'billing', priority: 'low', status: 'resolved', assignee_user_id: staffIds.support_agent, resolved_at: at(-1) },
  ])
  await insert('support_case_messages', [
    { case_id: cases[0].id, author_kind: 'customer', author_user: null, author_label: 'Arjun Mehta (Demo)', body: 'We want our partners to see Tower B availability but not prices. (demo)' },
    { case_id: cases[1].id, author_kind: 'customer', author_user: null, author_label: 'Neha Kapoor (Demo)', body: 'The developer has not reviewed our registration yet. (demo)' },
    { case_id: cases[1].id, author_kind: 'staff', author_user: staffIds.support_agent, author_label: 'REGrow Support', body: 'We have asked the developer to review it. (demo)', internal: false },
    { case_id: cases[1].id, author_kind: 'staff', author_user: staffIds.support_agent, author_label: 'REGrow Support', body: 'Internal note: no product fault found. (demo)', internal: true },
    { case_id: cases[2].id, author_kind: 'customer', author_user: null, author_label: 'Sameer Khan (Demo)', body: 'Could you send an invoice copy? (demo)' },
    { case_id: cases[2].id, author_kind: 'staff', author_user: staffIds.support_agent, author_label: 'REGrow Support', body: 'Trials are free, so there is no invoice yet. (demo)', internal: false },
  ])

  return credentials
}

function writeCredentials(credentials, password) {
  fs.mkdirSync(outDir, { recursive: true, mode: 0o700 })
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || '(the staging app URL)'
  const lines = [
    '# REGrow DEMO / TEST logins — PRIVATE, STAGING ONLY',
    '',
    `Generated ${new Date().toISOString()} for ${isLocal ? 'the local stack' : `Supabase project ${ref}`}. Sign in at ${appUrl}/login.`,
    'Do not share outside the test team. Never publish on the REGrow website. These accounts exist only in this staging database.',
    '',
    `Temporary password for every account: \`${password}\``,
    '',
    '| Email | Role | Organisation | Name |',
    '|---|---|---|---|',
    ...credentials.map((c) => `| ${c.email} | ${c.role} | ${c.org} | ${c.name} |`),
    '',
    '## Authenticator secrets (internal staff only)',
    '',
    'The REGrow console requires an authenticator code. Add each secret to an authenticator app (manual entry, TOTP, 6 digits, 30 s),',
    'or scan the otpauth URI with a QR generator you trust offline. A reset creates new secrets.',
    '',
    ...credentials.filter((c) => c.secret).map((c) => `- **${c.email}** — secret \`${c.secret}\`\n  - \`${c.uri}\``),
    '',
  ]
  const file = path.join(outDir, `DEMO-LOGINS-${ref}.md`)
  fs.writeFileSync(file, lines.join('\n'), { mode: 0o600 })
  fs.writeFileSync(path.join(outDir, `demo-logins-${ref}.json`), JSON.stringify({ ref, password, credentials }, null, 2), { mode: 0o600 })
  return file
}

// ── 5. Run ──────────────────────────────────────────────────────────────────────────────────────
try {
  if (command === 'status') await status()
  if (command === 'purge') { await purge(); await status() }
  if (command === 'reset') {
    const password = process.env.DEMO_PASSWORD
    if (!password || password.length < 8) fail('DEMO_PASSWORD (at least 8 characters) is required for reset')
    await purge()
    try {
      const credentials = await seedAll(password)
      const file = writeCredentials(credentials, password)
      console.log(`Seeded ${credentials.length} demo accounts. Private login sheet: ${path.relative(root, file)}`)
    } catch (e) {
      console.error(`Seeding failed: ${e.message}\nRemoving the partial demo data…`)
      await purge().catch((p) => console.error(`Purge after failure also failed: ${p.message}`))
      process.exit(1)
    }
    await status()
  }
} catch (e) {
  console.error(`FAILED: ${e.message}`)
  process.exit(1)
}
