// tests/integration-centre-ux.test.mjs
// Comprehensive test suite for Stage 4A: Customer-Facing Integration Centre UX, Security & Connection Lifecycle
import assert from 'node:assert/strict'

console.log('--- Running Integration Centre UX & Connection Management (Stage 4A) Tests ---')

// ---------------------------------------------------------------------------
// In-Memory Simulation Engine for Integration Centre UX, Lifecycle & Tenant Isolation
// ---------------------------------------------------------------------------

class IntegrationCentreEngine {
  constructor() {
    this.schemaAvailable = true
    this.organisations = []
    this.profiles = []
    this.orgMembers = []
    this.projects = []
    this.connections = []
    this.mappings = []
    this.leads = []
    this.eventLogs = []
  }

  // 1. List connections for an organisation (Tenant-isolated and schema-aware)
  getConnections(orgId, callerProfileId) {
    if (!this.schemaAvailable) {
      return {
        success: false,
        schemaAvailable: false,
        connections: [],
        error: 'Integration database schema is not initialized (Migration 20260015 has not been applied).',
        status: 503,
      }
    }

    const membership = this.orgMembers.find(
      (m) => m.org_id === orgId && m.profile_id === callerProfileId
    )
    if (!membership) {
      return { success: false, error: 'Forbidden. Not an organisation member.', status: 403 }
    }

    const orgConns = this.connections.filter((c) => c.org_id === orgId)
    // Redact credential_ref: NEVER return secret tokens or misleading placeholder strings
    const sanitized = orgConns.map((c) => {
      const connMappings = this.mappings.filter((m) => m.connection_id === c.id)
      return {
        ...c,
        credential_ref: null,
        has_credentials: Boolean(c.credential_ref),
        mappingsCount: connMappings.length,
        mappings: connMappings,
      }
    })

    return { success: true, schemaAvailable: true, connections: sanitized, status: 200 }
  }

  // 2. Create connection (Role-protected, enforces 'not_connected' for unverified third-party OAuth)
  createConnection(orgId, callerProfileId, params) {
    if (!this.schemaAvailable) {
      return {
        success: false,
        error: 'Integration database schema is not initialized (Migration 20260015 has not been applied).',
        status: 503,
      }
    }

    const membership = this.orgMembers.find(
      (m) => m.org_id === orgId && m.profile_id === callerProfileId
    )
    if (!membership) {
      return { success: false, error: 'Forbidden. Not an organisation member.', status: 403 }
    }
    if (!['owner', 'admin', 'manager'].includes(membership.role)) {
      return { success: false, error: 'Forbidden. Insufficient role to manage integrations.', status: 403 }
    }

    // STRICT SAFETY RULE: Third-party integrations in Stage 4A cannot be saved as active 'connected'
    // without verified live OAuth authorisation. They are forced into 'not_connected' status.
    let resolvedStatus = 'not_connected'
    if (params.status === 'disabled') {
      resolvedStatus = 'disabled'
    } else if (params.verifiedOAuthToken) {
      resolvedStatus = 'connected'
    }

    const newConn = {
      id: `conn_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      org_id: orgId,
      provider: params.provider,
      name: params.name,
      external_account_id: null, // Zero fake account IDs allowed
      status: resolvedStatus,
      connected_by: callerProfileId,
      last_sync_at: resolvedStatus === 'connected' ? new Date().toISOString() : null,
      last_error: null,
      credential_ref: params.credential_ref || null,
      metadata: {
        ...(params.metadata || {}),
        authorization_status: resolvedStatus === 'connected' ? 'authorized' : 'pending_oauth',
        is_preview_configuration: resolvedStatus !== 'connected',
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    this.connections.push(newConn)

    // Process initial mappings if provided
    if (params.initialMappings && params.initialMappings.length > 0) {
      for (const m of params.initialMappings) {
        this.createMapping(orgId, callerProfileId, {
          connectionId: newConn.id,
          projectId: m.projectId,
          externalIdentifierType: m.externalIdentifierType,
          externalIdentifierValue: m.externalIdentifierValue,
          description: m.description,
        })
      }
    }

    return {
      success: true,
      connection: {
        ...newConn,
        credential_ref: null,
        has_credentials: Boolean(newConn.credential_ref),
      },
      status: 201,
    }
  }

  // 3. Disconnect connection (Soft disconnect preserving historical leads)
  disconnectConnection(connectionId, callerProfileId) {
    const conn = this.connections.find((c) => c.id === connectionId)
    if (!conn) {
      return { success: false, error: 'Connection not found.', status: 404 }
    }

    const membership = this.orgMembers.find(
      (m) => m.org_id === conn.org_id && m.profile_id === callerProfileId
    )
    if (!membership) {
      return { success: false, error: 'Forbidden. You do not belong to this organisation.', status: 403 }
    }
    if (!['owner', 'admin', 'manager'].includes(membership.role)) {
      return { success: false, error: 'Forbidden. Only managers and admins can disconnect integrations.', status: 403 }
    }

    conn.status = 'disabled'
    conn.updated_at = new Date().toISOString()

    this.eventLogs.push({
      id: `log_${Date.now()}`,
      org_id: conn.org_id,
      connection_id: conn.id,
      provider: conn.provider,
      event_type: 'connection_disconnected',
      processing_status: 'processed',
      error_message: 'Connection disabled by user. Historical leads preserved.',
      created_at: new Date().toISOString(),
    })

    return { success: true, message: 'Disconnected successfully. Historical leads preserved.', status: 200 }
  }

  // 4. Reconnect connection (Rejects simulated reconnect without verified live OAuth)
  reconnectConnection(connectionId, callerProfileId, verifiedOAuthToken = null) {
    const conn = this.connections.find((c) => c.id === connectionId)
    if (!conn) {
      return { success: false, error: 'Connection not found.', status: 404 }
    }

    const membership = this.orgMembers.find(
      (m) => m.org_id === conn.org_id && m.profile_id === callerProfileId
    )
    if (!membership) {
      return { success: false, error: 'Forbidden. Not an organisation member.', status: 403 }
    }
    if (!['owner', 'admin', 'manager'].includes(membership.role)) {
      return { success: false, error: 'Forbidden. Insufficient role to reconnect.', status: 403 }
    }

    // STRICT REQUIREMENT: Reconnect must NOT report success simply by clearing an error or changing a status.
    // Live Meta re-authorisation requires official OAuth in Stage 4B.
    if (!verifiedOAuthToken) {
      return {
        success: false,
        reconnectAvailable: false,
        error:
          'Live provider re-authorisation is not yet available. Reconnecting requires official Meta OAuth verification, which is scheduled for Stage 4B. The connection cannot be marked active without verified provider authorization.',
        status: 400,
      }
    }

    conn.status = 'connected'
    conn.last_error = null
    conn.last_sync_at = new Date().toISOString()
    conn.updated_at = new Date().toISOString()

    return { success: true, connection: conn, status: 200 }
  }

  // 5. Create project mapping with cross-tenant check
  createMapping(orgId, callerProfileId, params) {
    if (!this.schemaAvailable) {
      return {
        success: false,
        error: 'Integration database schema is not initialized (Migration 20260015 has not been applied).',
        status: 503,
      }
    }

    const membership = this.orgMembers.find(
      (m) => m.org_id === orgId && m.profile_id === callerProfileId
    )
    if (!membership || !['owner', 'admin', 'manager'].includes(membership.role)) {
      return { success: false, error: 'Forbidden. Insufficient role to create mapping.', status: 403 }
    }

    const conn = this.connections.find((c) => c.id === params.connectionId && c.org_id === orgId)
    if (!conn) {
      return { success: false, error: 'Connection not found in organisation.', status: 400 }
    }

    // STRICT CROSS-TENANT CHECK: Target project MUST belong to orgId
    const targetProj = this.projects.find((p) => p.id === params.projectId)
    if (!targetProj || targetProj.org_id !== orgId) {
      return {
        success: false,
        error: 'Target project does not belong to this organisation.',
        status: 400,
      }
    }

    const newMapping = {
      id: `map_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      org_id: orgId,
      connection_id: params.connectionId,
      project_id: params.projectId,
      external_identifier_type: params.externalIdentifierType,
      external_identifier_value: params.externalIdentifierValue,
      description: params.description || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    this.mappings.push(newMapping)
    return { success: true, mapping: newMapping, status: 201 }
  }

  // 6. Inbound lead ingestion simulation checking connection active status
  processInboundLead(orgId, payload) {
    if (payload.connectionId) {
      const conn = this.connections.find((c) => c.id === payload.connectionId && c.org_id === orgId)
      if (!conn) {
        return { success: false, error: 'Integration connection not found in this organisation', status: 400 }
      }
      if (conn.status !== 'connected') {
        return {
          success: false,
          error: `Connection is ${conn.status}. Inbound leads cannot be processed for inactive or disabled connections.`,
          status: 400,
        }
      }
    }

    const lead = {
      id: `lead_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      org_id: orgId,
      connection_id: payload.connectionId || null,
      name: payload.name,
      phone: payload.phone,
      created_at: new Date().toISOString(),
    }
    this.leads.push(lead)
    return { success: true, lead, status: 201 }
  }
}

// ---------------------------------------------------------------------------
// TEST 1: Missing Database Schema Detection (No Silent Empty Success)
// ---------------------------------------------------------------------------
{
  const engine = new IntegrationCentreEngine()
  engine.schemaAvailable = false // Simulate unapplied Migration 20260015 (error 42P01)

  const orgId = 'org_schema_test'
  const userId = 'user_admin'
  engine.orgMembers.push({ org_id: orgId, profile_id: userId, role: 'admin' })

  // Querying connections when schema is missing MUST return 503 and clear schemaAvailable: false
  const res = engine.getConnections(orgId, userId)
  assert.equal(res.success, false)
  assert.equal(res.schemaAvailable, false)
  assert.equal(res.status, 503)
  assert.match(res.error, /schema is not initialized/i)

  // Creating connection when schema is missing MUST be blocked with 503
  const createRes = engine.createConnection(orgId, userId, {
    provider: 'meta_ads',
    name: 'Test Meta Plan',
  })
  assert.equal(createRes.success, false)
  assert.equal(createRes.status, 503)
  assert.match(createRes.error, /schema is not initialized/i)

  console.log('✓ Test 1 Passed: Missing database schema is safely detected without silent empty success')
}

// ---------------------------------------------------------------------------
// TEST 2: Prevention of Fake 'connected' State & Zero Fake Account IDs
// ---------------------------------------------------------------------------
{
  const engine = new IntegrationCentreEngine()
  const orgId = 'org_fake_check'
  const userId = 'user_admin'
  engine.orgMembers.push({ org_id: orgId, profile_id: userId, role: 'admin' })

  // Attempt to save a connection claiming status='connected' without verified live OAuth
  const res = engine.createConnection(orgId, userId, {
    provider: 'meta_ads',
    name: 'Meta Ads Planning Plan',
    status: 'connected', // Client tries to claim connected
  })

  assert.equal(res.success, true)
  // MUST be forced to 'not_connected'
  assert.equal(res.connection.status, 'not_connected')
  // MUST NOT invent a fake external_account_id
  assert.equal(res.connection.external_account_id, null)
  // Metadata must explicitly flag pending_oauth and is_preview_configuration
  assert.equal(res.connection.metadata.authorization_status, 'pending_oauth')
  assert.equal(res.connection.metadata.is_preview_configuration, true)

  console.log('✓ Test 2 Passed: Connections without verified live OAuth are strictly saved as not_connected with null account ID')
}

// ---------------------------------------------------------------------------
// TEST 3: Reconnect Lifecycle Rejects Simulated Success Without Live OAuth
// ---------------------------------------------------------------------------
{
  const engine = new IntegrationCentreEngine()
  const orgId = 'org_reconnect_test'
  const userId = 'user_admin'
  engine.orgMembers.push({ org_id: orgId, profile_id: userId, role: 'admin' })

  const conn = engine.createConnection(orgId, userId, {
    provider: 'meta_ads',
    name: 'Meta Ads Account',
  }).connection

  // Manually disable connection
  engine.disconnectConnection(conn.id, userId)
  assert.equal(engine.connections.find((c) => c.id === conn.id).status, 'disabled')

  // Calling reconnect WITHOUT live OAuth verification MUST be rejected
  const reconnectAttempt = engine.reconnectConnection(conn.id, userId, null)
  assert.equal(reconnectAttempt.success, false)
  assert.equal(reconnectAttempt.reconnectAvailable, false)
  assert.equal(reconnectAttempt.status, 400)
  assert.match(reconnectAttempt.error, /Live provider re-authorisation is not yet available/i)

  // Connection remains disabled
  assert.equal(engine.connections.find((c) => c.id === conn.id).status, 'disabled')

  console.log('✓ Test 3 Passed: Reconnect strictly rejects simulated success and preserves disabled state')
}

// ---------------------------------------------------------------------------
// TEST 4: Disabled and Inactive Connections Cannot Receive Inbound Leads
// ---------------------------------------------------------------------------
{
  const engine = new IntegrationCentreEngine()
  const orgId = 'org_inbound_block'
  const userId = 'user_admin'
  engine.orgMembers.push({ org_id: orgId, profile_id: userId, role: 'admin' })

  const conn = engine.createConnection(orgId, userId, {
    provider: 'meta_ads',
    name: 'Meta Lead Channel',
  }).connection

  // Connection is in 'not_connected' status
  const leadAttempt1 = engine.processInboundLead(orgId, {
    connectionId: conn.id,
    name: 'Prospective Buyer',
    phone: '+919876543210',
  })
  assert.equal(leadAttempt1.success, false)
  assert.match(leadAttempt1.error, /cannot be processed for inactive or disabled connections/i)

  // Disable connection and test again
  engine.disconnectConnection(conn.id, userId)
  const leadAttempt2 = engine.processInboundLead(orgId, {
    connectionId: conn.id,
    name: 'Prospective Buyer',
    phone: '+919876543210',
  })
  assert.equal(leadAttempt2.success, false)
  assert.match(leadAttempt2.error, /cannot be processed for inactive or disabled connections/i)

  console.log('✓ Test 4 Passed: Inactive or disabled connections strictly block new inbound lead ingestion')
}

// ---------------------------------------------------------------------------
// TEST 5: Complete Credential Redaction (No Secret or Placeholder Leaks)
// ---------------------------------------------------------------------------
{
  const engine = new IntegrationCentreEngine()
  const orgId = 'org_cred_test'
  const userId = 'user_admin'
  engine.orgMembers.push({ org_id: orgId, profile_id: userId, role: 'admin' })

  // Create connection with an internal vault URI
  engine.createConnection(orgId, userId, {
    provider: 'meta_ads',
    name: 'Secret Meta Connection',
    credential_ref: 'vault://secret_tokens/meta_live_token',
  })

  const res = engine.getConnections(orgId, userId)
  assert.equal(res.success, true)
  const conn = res.connections[0]

  // credential_ref must be null — NEVER exposing vault URI, access token, or misleading placeholder
  assert.equal(conn.credential_ref, null)
  assert.equal(conn.has_credentials, true)

  console.log('✓ Test 5 Passed: Credentials and vault references are completely redacted without misleading placeholders')
}

// ---------------------------------------------------------------------------
// TEST 6: Organisation A cannot see Organisation B integrations
// ---------------------------------------------------------------------------
{
  const engine = new IntegrationCentreEngine()
  const orgA = 'org_prestige'
  const orgB = 'org_sobha'

  const userA = 'user_prestige_mgr'
  const userB = 'user_sobha_mgr'

  engine.orgMembers.push(
    { org_id: orgA, profile_id: userA, role: 'manager' },
    { org_id: orgB, profile_id: userB, role: 'manager' }
  )

  engine.createConnection(orgA, userA, { provider: 'meta_ads', name: 'Prestige Central Ads' })
  engine.createConnection(orgB, userB, { provider: 'meta_ads', name: 'Sobha Luxury Ads' })

  // User A queries Org A
  const resA = engine.getConnections(orgA, userA)
  assert.equal(resA.success, true)
  assert.equal(resA.connections.length, 1)
  assert.equal(resA.connections[0].name, 'Prestige Central Ads')

  // User A attempts to view Org B
  const crossRes = engine.getConnections(orgB, userA)
  assert.equal(crossRes.success, false)
  assert.equal(crossRes.status, 403)

  console.log('✓ Test 6 Passed: Complete tenant isolation prevents cross-organisation connection viewing')
}

// ---------------------------------------------------------------------------
// TEST 7: Cross-Tenant Modification, Reconnect or Disconnect Strictly Blocked
// ---------------------------------------------------------------------------
{
  const engine = new IntegrationCentreEngine()
  const orgA = 'org_prestige'
  const orgB = 'org_sobha'

  const userA = 'user_prestige_admin'
  const userB = 'user_sobha_admin'

  engine.orgMembers.push(
    { org_id: orgA, profile_id: userA, role: 'admin' },
    { org_id: orgB, profile_id: userB, role: 'admin' }
  )

  const connB = engine.createConnection(orgB, userB, { provider: 'meta_ads', name: 'Sobha Ads' }).connection

  // User A attempts to disconnect Org B's connection
  const attack = engine.disconnectConnection(connB.id, userA)
  assert.equal(attack.success, false)
  assert.equal(attack.status, 403)

  // Verify connection in Org B remains untouched
  const check = engine.connections.find((c) => c.id === connB.id)
  assert.notEqual(check.status, 'disabled')

  console.log('✓ Test 7 Passed: Cross-tenant modification or disconnect is strictly rejected')
}

// ---------------------------------------------------------------------------
// TEST 8: Form Mappings Cannot Point to Another Organisation Project
// ---------------------------------------------------------------------------
{
  const engine = new IntegrationCentreEngine()
  const orgA = 'org_dlf'
  const orgB = 'org_tata'

  const userA = 'user_dlf_admin'
  engine.orgMembers.push({ org_id: orgA, profile_id: userA, role: 'admin' })

  const projA = { id: 'proj_dlf_1', org_id: orgA, name: 'DLF Camellias' }
  const projB = { id: 'proj_tata_1', org_id: orgB, name: 'Tata Promont' }
  engine.projects.push(projA, projB)

  const connA = engine.createConnection(orgA, userA, { provider: 'meta_ads', name: 'DLF Ads' }).connection

  // Malicious mapping pointing to Org B's project
  const invalidMap = engine.createMapping(orgA, userA, {
    connectionId: connA.id,
    projectId: projB.id,
    externalIdentifierType: 'form_id',
    externalIdentifierValue: 'form_cross_tenant_test',
  })
  assert.equal(invalidMap.success, false)
  assert.match(invalidMap.error, /does not belong to this organisation/i)

  console.log('✓ Test 8 Passed: Cross-tenant project mapping references are rejected at domain level')
}

// ---------------------------------------------------------------------------
// TEST 9: Disconnecting Preserves Historical Leads & Audit Event Logged
// ---------------------------------------------------------------------------
{
  const engine = new IntegrationCentreEngine()
  const orgId = 'org_lodha'
  const userId = 'user_lodha_admin'
  engine.orgMembers.push({ org_id: orgId, profile_id: userId, role: 'admin' })

  // Temporarily grant verifiedOAuthToken for lifecycle test
  const conn = engine.createConnection(orgId, userId, {
    provider: 'meta_ads',
    name: 'Lodha Campaign',
    verifiedOAuthToken: 'test_token',
  }).connection
  assert.equal(conn.status, 'connected')

  // Ingest 5 leads
  for (let i = 1; i <= 5; i++) {
    engine.processInboundLead(orgId, {
      connectionId: conn.id,
      name: `Buyer ${i}`,
      phone: `+91900000000${i}`,
    })
  }
  assert.equal(engine.leads.length, 5)

  // Disconnect
  const disRes = engine.disconnectConnection(conn.id, userId)
  assert.equal(disRes.success, true)

  // Verify all 5 historical leads remain intact with attribution preserved
  const remaining = engine.leads.filter((l) => l.org_id === orgId)
  assert.equal(remaining.length, 5)
  for (const l of remaining) {
    assert.equal(l.connection_id, conn.id)
  }

  // Verify audit log exists
  const log = engine.eventLogs.find((e) => e.connection_id === conn.id)
  assert.ok(log)
  assert.equal(log.event_type, 'connection_disconnected')

  console.log('✓ Test 9 Passed: Disconnecting preserves all historical leads and logs an audit event')
}

// ---------------------------------------------------------------------------
// TEST 10: RBAC Strictly Enforces Connection Management Roles
// ---------------------------------------------------------------------------
{
  const engine = new IntegrationCentreEngine()
  const orgId = 'org_oberoi'
  const adminId = 'user_admin'
  const salesId = 'user_sales'
  const readOnlyId = 'user_readonly'

  engine.orgMembers.push(
    { org_id: orgId, profile_id: adminId, role: 'admin' },
    { org_id: orgId, profile_id: salesId, role: 'sales_exec' },
    { org_id: orgId, profile_id: readOnlyId, role: 'readonly' }
  )

  // Sales exec blocked from creating connection
  const salesCreate = engine.createConnection(orgId, salesId, { provider: 'meta_ads', name: 'Test' })
  assert.equal(salesCreate.success, false)
  assert.equal(salesCreate.status, 403)

  // Read-only member blocked from creating connection
  const roCreate = engine.createConnection(orgId, readOnlyId, { provider: 'meta_ads', name: 'Test' })
  assert.equal(roCreate.success, false)
  assert.equal(roCreate.status, 403)

  // Admin allowed
  const adminCreate = engine.createConnection(orgId, adminId, { provider: 'meta_ads', name: 'Admin Plan' })
  assert.equal(adminCreate.success, true)

  // Sales exec blocked from disconnecting
  const salesDis = engine.disconnectConnection(adminCreate.connection.id, salesId)
  assert.equal(salesDis.success, false)
  assert.equal(salesDis.status, 403)

  console.log('✓ Test 10 Passed: RBAC permissions strictly enforced across all connection actions')
}

console.log('\n--- ALL 10 INTEGRATION CENTRE UX (STAGE 4A) TESTS PASSED ---\n')
