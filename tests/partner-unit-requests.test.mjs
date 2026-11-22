// tests/partner-unit-requests.test.mjs — partner booking requests (20260086): every rule lives in the database
// functions; routes authorise management roles and the Sales module first; the agency never receives the
// developer's lead or hold, the developer never the agency's lead.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
const sql = read('supabase/migrations/20260086_partner_unit_requests.sql')
let passed = 0
const test = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`) }

console.log('PARTNER BOOKING REQUESTS')

test('requesting: management roles, accepted and protected buyer, active partnership, shared visible project, available unit, one open request', () => {
  const fn = sql.slice(sql.indexOf('FUNCTION public.partner_request_unit'), sql.indexOf('FUNCTION public.partner_withdraw_unit_request'))
  assert.match(fn, /partner_assert_role\(p_agency, p_actor, ARRAY\['owner', 'admin', 'manager'\]\)/)
  assert.match(fn, /r\.status <> 'accepted' OR r\.protected_until IS NULL OR r\.protected_until <= now\(\)/)
  assert.match(fn, /p\.status <> 'active'/)
  assert.match(fn, /i\.project_id = r\.project_id[\s\S]*pp\.revoked_at IS NULL AND pp\.inventory_visibility <> 'none'/)
  assert.match(fn, /u\.status <> 'available'/)
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS uq_partner_unit_requests_open ON public\.partner_unit_requests \(registration_id\) WHERE status = 'submitted'/)
  assert.match(sql, /hold_hours\s+INTEGER NOT NULL DEFAULT 48 CHECK \(hold_hours BETWEEN 24 AND 168\)/)
})

test('approving: locks the unit, re-checks it is available and the buyer still protected, holds it for the developer lead', () => {
  const fn = sql.slice(sql.indexOf('FUNCTION public.partner_review_unit_request'))
  assert.match(fn, /FROM public\.inventory_items WHERE id = q\.inventory_id AND org_id = p_developer FOR UPDATE/)
  assert.match(fn, /INSERT INTO public\.inventory_blockings \(org_id, project_id, inventory_id, lead_id[\s\S]*r\.developer_lead_id/)
  assert.match(fn, /UPDATE public\.inventory_items SET status = 'blocked'/)
  assert.match(fn, /give a reason for declining/)
  for (const e of ['unit_requested', 'unit_request_withdrawn', 'unit_request_declined', 'unit_request_approved']) assert.match(sql, new RegExp(`partner_record\\([^;]*'${e}'`), e)
  assert.match(sql, /ENABLE ROW LEVEL SECURITY;\s*REVOKE ALL ON public\.partner_unit_requests FROM PUBLIC, anon, authenticated/)
})

test('routes and reads: management roles and the Sales module; no cross-side lead ids', () => {
  for (const f of ['app/api/partners/unit-requests/route.ts', 'app/api/partners/unit-requests/[requestId]/review/route.ts', 'app/api/partners/unit-requests/[requestId]/withdraw/route.ts']) {
    const s = read(f)
    assert.match(s, /authorizeOrgAccess\([^)]*\[\.\.\.MANAGEMENT_ROLES\]\)/, f); assert.match(s, /requireModule\([^)]*'sales'\)/, f)
  }
  const dal = read('lib/dal/partners.ts')
  const list = dal.slice(dal.indexOf('export async function listUnitRequests'), dal.indexOf('export async function requestableUnits'))
  assert.doesNotMatch(list, /agency_lead_id|blocking_id/)
  assert.match(list, /\.\.\.\(side === 'developer' \? \{ developerLeadId:/)
  assert.match(dal.slice(dal.indexOf('export async function requestableUnits')), /units\.filter\(\(u\) => u\.available\)/)
})

console.log(`\nPartner booking requests: ${passed} checks passed.`)
