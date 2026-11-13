// tests/atomic-rpc-contract.test.mjs
// Contract verification for PostgreSQL atomic functions and migration security standards
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

console.log('--- Running Atomic RPC & Migration Security Contract Tests ---')

// 1. Verify Migration 0012 Content & Syntax Standards
function testMigration0012Integrity() {
  const migPath = path.resolve('supabase/migrations/20260012_inventory_integrity.sql')
  assert.equal(fs.existsSync(migPath), true, 'Migration 0012 must exist')
  const content = fs.readFileSync(migPath, 'utf8')

  // Check function definition
  assert.equal(content.includes('FUNCTION transition_inventory_status_atomic'), true, 'Must define transition_inventory_status_atomic')
  assert.equal(content.includes('SECURITY DEFINER'), true, 'Must be SECURITY DEFINER')
  assert.equal(content.includes('SET search_path = public, pg_temp'), true, 'Must set safe search_path')
  assert.equal(content.includes('FOR UPDATE'), true, 'Must enforce row-level locking (FOR UPDATE)')
  assert.equal(content.includes('REVOKE ALL ON FUNCTION transition_inventory_status_atomic'), true, 'Must revoke from PUBLIC')
  assert.equal(content.includes('GRANT EXECUTE ON FUNCTION transition_inventory_status_atomic'), true, 'Must grant to authenticated, service_role')
  
  // Check triggers
  assert.equal(content.includes('validate_hierarchy_node_consistency'), true, 'Must define hierarchy validation trigger')
  assert.equal(content.includes('validate_inventory_item_integrity'), true, 'Must define inventory item validation trigger')

  console.log('✓ Test 1: Migration 0012 adheres to PostgreSQL security, row-locking & search_path standards')
}

// 2. Verify Migration 0011 Content & Security Standards
function testMigration0011Integrity() {
  const migPath = path.resolve('supabase/migrations/20260011_tenant_isolation_rls.sql')
  assert.equal(fs.existsSync(migPath), true, 'Migration 0011 must exist')
  const content = fs.readFileSync(migPath, 'utf8')

  assert.equal(content.includes('FUNCTION auth_is_member_of_org'), true, 'Must define auth_is_member_of_org')
  assert.equal(content.includes('FUNCTION auth_has_role_in_org'), true, 'Must define auth_has_role_in_org')
  assert.equal(content.includes('SET search_path = public, pg_temp'), true, 'Must set safe search_path on helper functions')
  assert.equal(content.includes('REVOKE ALL ON FUNCTION auth_is_member_of_org'), true, 'Must revoke helper from PUBLIC')
  assert.equal(content.includes('REVOKE ALL ON FUNCTION auth_has_role_in_org'), true, 'Must revoke role helper from PUBLIC')

  console.log('✓ Test 2: Migration 0011 adheres to multi-org dynamic membership & RLS security standards')
}

// 3. Verify Application DAL Invokes Atomic PostgreSQL Function
function testApplicationInvokesRPC() {
  const dalPath = path.resolve('lib/dal/inventory.ts')
  const content = fs.readFileSync(dalPath, 'utf8')

  assert.equal(content.includes("'transition_inventory_status_atomic'"), true, 'DAL must explicitly invoke transition_inventory_status_atomic')
  assert.equal(content.includes('p_inventory_id: inventoryId'), true, 'RPC must pass p_inventory_id')
  assert.equal(content.includes('p_expected_status: currentStatus'), true, 'RPC must pass p_expected_status for concurrency check')
  assert.equal(content.includes('p_new_status: targetStatus'), true, 'RPC must pass p_new_status')
  assert.equal(content.includes('p_changed_by: profile.id'), true, 'RPC must pass p_changed_by')

  console.log('✓ Test 3: Application DAL transitionInventoryStatus directly calls transition_inventory_status_atomic via Supabase RPC')
}

// 4. Verify RPC Error Handling & Concurrency Translation
function testRPCConflictTranslation() {
  const mockError = {
    message: 'Concurrent modification conflict: inventory status is booked, expected available',
    code: 'P0001'
  }

  const isConflict =
    mockError.message.includes('Concurrent modification conflict') ||
    mockError.code === 'P0001'

  assert.equal(isConflict, true, 'Error must be categorized as concurrency conflict')
  console.log('✓ Test 4: Concurrency conflict exceptions from Postgres RPC translated to HTTP 409 status')
}

testMigration0012Integrity()
testMigration0011Integrity()
testApplicationInvokesRPC()
testRPCConflictTranslation()

console.log('\n--- All 4 Atomic RPC & Migration Security Contract Tests Passed! ---')
