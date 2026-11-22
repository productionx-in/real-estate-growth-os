// tests/lead-archive.test.mjs — the lead Archive is wired the safe way round (migration 20260073):
// deleting archives (never a hard delete), restore/erase are owner/admin only and audited, and the view keeps RLS.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
let passed = 0
const test = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`) }

const migration = read('supabase/migrations/20260073_lead_archive.sql')
const del = read('app/api/leads/[leadId]/route.ts')
const api = read('app/api/archive/leads/[leadId]/route.ts')

test('the live-leads view applies the caller’s row security and hides archived rows', () => {
  assert.match(migration, /CREATE VIEW public\.leads WITH \(security_invoker = true\) AS\s+SELECT \* FROM public\.leads_all WHERE deleted_at IS NULL/)
})
test('the archive functions are server-only and the purge runs daily', () => {
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.archive_lead[\s\S]*FROM PUBLIC, anon, authenticated/)
  assert.match(migration, /cron\.schedule\('regrow-purge-archived-leads'/)
  assert.match(migration, /interval '30 days'|30 days/)
})
test('uniqueness ignores archived rows, so a resent lead is never refused', () => {
  assert.match(migration, /uq_leads_org_idempotency_key ON public\.leads_all \(org_id, idempotency_key\)\s+WHERE idempotency_key IS NOT NULL AND deleted_at IS NULL;/)
  assert.match(migration, /uq_leads_connection_external_lead_id ON public\.leads_all \(connection_id, external_lead_id\)\s+WHERE [^;]*AND deleted_at IS NULL;/)
})
test('organisation deletion counts and removes archived leads too', () => {
  assert.match(migration, /'leads_all'/)
  assert.match(migration, /DELETE FROM public\.leads_all/)
})
test('deleting a lead archives it (no hard delete) and is audited', () => {
  const handler = del.slice(del.indexOf('export async function DELETE'))
  assert.match(handler, /rpc\('archive_lead'/)
  assert.doesNotMatch(handler, /\.delete\(\)/)
  assert.match(handler, /lead\.archived/)
})
test('restore and erase are owner/admin only, organisation-scoped and audited', () => {
  assert.match(api, /authorizeOrgAccess\([^)]*\['owner', 'admin'\]/)
  assert.match(api, /lead\.restored/); assert.match(api, /lead\.erased/)
})
test('the Archive page is listed for admins in Settings', () => {
  const cat = read('lib/settings/catalog.ts')
  assert.match(cat, /key: 'archive'[^\n]*audience: 'admins'/)
  assert.match(read('app/(dashboard)/[orgSlug]/settings/archive/page.tsx'), /if \(!isAdmin\) redirect/)
})
test('the calendar and deals hide records of archived leads', () => {
  assert.match(read('lib/dal/site-visits.ts'), /lead:leads!inner\(/)
  assert.match(read('lib/dal/sales.ts'), /lead:leads!inner\(id, name, phone\)/)
})
console.log(`\nLead archive: ${passed} checks passed.`)
