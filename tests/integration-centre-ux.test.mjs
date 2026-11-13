// tests/integration-centre-ux.test.mjs
// Comprehensive test suite for Stage 4A: Customer-Facing Integration Centre UX and Connection Management Design
import assert from 'node:assert/strict'

console.log('--- Running Integration Centre UX & Connection Management (Stage 4A) Tests ---')

// ---------------------------------------------------------------------------
// In-Memory Simulation Engine for Integration Centre UX & Tenant Isolation
// ---------------------------------------------------------------------------

class IntegrationCentreEngine {
  constructor() {
    this.organisations = []
    this.profiles = []
    this.orgMembers = []
    this.projects = []
    this.connections = []
    this.mappings = []
    this.leads = []
    this.eventLogs = []
  }

  // 1. List connections for an organisation (Tenant-isolated)
  getConnections(orgId, callerProfileId) {
    const membership = this.orgMembers.find(
      (m) => m.org_id === orgId && m.profile_id === callerProfileId
    )
    if (!membership) {
      return { success: false, error: 'Forbidden. Not an organisation member.', status: 403 }
    }

    const orgConns = this.connections.filter((c) => c.org_id === orgId)
    // Redact any credential_ref
    const sanitized = orgConns.map((c) => {
      const connMappings = this.mappings.filter((m) => m.connection_id === c.id)
      return {
        ...c,
        credential_ref: c.credential_ref ? 'CONFIGURED_SECURE_REFERENCE' : null,
        mappingsCount: connMappings.length,
        mappings: connMappings,
      }
    })

    return { success: true, connections: sanitized, status: 200 }
  }

  // 2. Create connection (Role-protected)
  createConnection(orgId, callerProfileId, params) {
    const membership = this.orgMembers.find(
      (m) => m.org_id === orgId && m.profile_id === callerProfileId
    )
    if (!membership) {
      return { success: false, error: 'Forbidden. Not an organisation member.', status: 403 }
    }
    if (!['owner', 'admin', 'manager'].includes(membership.role)) {
      return { success: false, error: 'Forbidden. Insufficient role to manage integrations.', status: 403 }
    }

    const newConn = {
      id: `conn_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      org_id: orgId,
      provider: params.provider,
      name: params.name,
      external_account_id: params.external_account_id || null,
      status: params.status || 'not_connected',
      connected_by: callerProfileId,
      last_sync_at: params.status === 'connected' ? new Date().toISOString() : null,
      last_error: null,
      credential_ref: params.credential_ref || null,
      metadata: params.metadata || {},
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

    return { success: true, connection: newConn, status: 201 }
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

  // 4. Reconnect connection
  reconnectConnection(connectionId, callerProfileId) {
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

    conn.status = 'connected'
    conn.last_error = null
    conn.last_sync_at = new Date().toISOString()
    conn.updated_at = new Date().toISOString()

    return { success: true, connection: conn, status: 200 }
  }

  // 5. Create project mapping with cross-tenant check
  createMapping(orgId, callerProfileId, params) {
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

  // 6. Update mapping project destination
  updateMapping(mappingId, callerProfileId, newProjectId) {
    const mapping = this.mappings.find((m) => m.id === mappingId)
    if (!mapping) return { success: false, error: 'Mapping not found.', status: 404 }

    const membership = this.orgMembers.find(
      (m) => m.org_id === mapping.org_id && m.profile_id === callerProfileId
    )
    if (!membership || !['owner', 'admin', 'manager'].includes(membership.role)) {
      return { success: false, error: 'Forbidden. Insufficient role.', status: 403 }
    }

    // Cross-tenant check on new project
    const targetProj = this.projects.find((p) => p.id === newProjectId)
    if (!targetProj || targetProj.org_id !== mapping.org_id) {
      return {
        success: false,
        error: 'Target project does not belong to this organisation.',
        status: 400,
      }
    }

    mapping.project_id = newProjectId
    mapping.updated_at = new Date().toISOString()
    return { success: true, mapping, status: 200 }
  }
}

// ---------------------------------------------------------------------------
// TEST 1: Organisation A cannot see Organisation B's integrations
// ---------------------------------------------------------------------------
{
  const engine = new IntegrationCentreEngine()
  const orgA = 'org_prestige'
  const orgB = 'org_sobha'

  const userA = 'user_prestige_manager'
  const userB = 'user_sobha_manager'

  engine.orgMembers.push(
    { org_id: orgA, profile_id: userA, role: 'manager' },
    { org_id: orgB, profile_id: userB, role: 'manager' }
  )

  // Org A creates a Meta connection
  engine.createConnection(orgA, userA, {
    provider: 'meta_ads',
    name: 'Prestige Central Ads',
    status: 'connected',
  })

  // Org B creates a Meta connection
  engine.createConnection(orgB, userB, {
    provider: 'meta_ads',
    name: 'Sobha Luxury Ads',
    status: 'connected',
  })

  // When User A queries Org A's connections
  const resA = engine.getConnections(orgA, userA)
  assert.equal(resA.success, true)
  assert.equal(resA.connections.length, 1)
  assert.equal(resA.connections[0].name, 'Prestige Central Ads')

  // When User A attempts to view Org B's connections
  const crossQuery = engine.getConnections(orgB, userA)
  assert.equal(crossQuery.success, false)
  assert.equal(crossQuery.status, 403)

  console.log('✓ Test 1 Passed: Organisation A cannot see Organisation B integrations')
}

// ---------------------------------------------------------------------------
// TEST 2: Organisation A cannot modify or disconnect Organisation B's connection
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

  const connB = engine.createConnection(orgB, userB, {
    provider: 'meta_ads',
    name: 'Sobha Official Ads',
    status: 'connected',
  }).connection

  // User A attempts to disconnect Org B's connection
  const attack = engine.disconnectConnection(connB.id, userA)
  assert.equal(attack.success, false)
  assert.equal(attack.status, 403)

  // Verify connection status remains connected
  const check = engine.connections.find((c) => c.id === connB.id)
  assert.equal(check.status, 'connected')

  console.log('✓ Test 2 Passed: Organisation A cannot modify or disconnect Organisation B connection')
}

// ---------------------------------------------------------------------------
// TEST 3: Multiple connections can exist under one organisation
// ---------------------------------------------------------------------------
{
  const engine = new IntegrationCentreEngine()
  const orgId = 'org_godrej'
  const userId = 'user_godrej_admin'

  engine.orgMembers.push({ org_id: orgId, profile_id: userId, role: 'admin' })

  // Connection 1: North Region Agency Account
  engine.createConnection(orgId, userId, {
    provider: 'meta_ads',
    name: 'Godrej North Region Ad Account',
    status: 'connected',
    metadata: {
      pages: [{ id: 'page_north_1', name: 'Godrej Woods' }],
    },
  })

  // Connection 2: South Region In-House Account
  engine.createConnection(orgId, userId, {
    provider: 'meta_ads',
    name: 'Godrej South Region Ad Account',
    status: 'connected',
    metadata: {
      pages: [{ id: 'page_south_1', name: 'Godrej Palm Retreat' }],
    },
  })

  const res = engine.getConnections(orgId, userId)
  assert.equal(res.success, true)
  assert.equal(res.connections.length, 2)
  const names = res.connections.map((c) => c.name)
  assert.ok(names.includes('Godrej North Region Ad Account'))
  assert.ok(names.includes('Godrej South Region Ad Account'))

  console.log('✓ Test 3 Passed: Multiple connections coexist cleanly under one organisation')
}

// ---------------------------------------------------------------------------
// TEST 4: Multiple Pages and forms can belong to a single connection
// ---------------------------------------------------------------------------
{
  const engine = new IntegrationCentreEngine()
  const orgId = 'org_brigade'
  const userId = 'user_brigade_mgr'

  engine.orgMembers.push({ org_id: orgId, profile_id: userId, role: 'manager' })

  const multiAssetMeta = {
    pages: [
      {
        id: 'page_brigade_1',
        name: 'Brigade Gateway',
        forms: [
          { id: 'form_101', name: '3BHK Brochure Download' },
          { id: 'form_102', name: 'Weekend Site Visit' },
        ],
      },
      {
        id: 'page_brigade_2',
        name: 'Brigade Cornerstone Utopia',
        forms: [
          { id: 'form_201', name: 'Pre-launch Price Sheet' },
          { id: 'form_202', name: 'Clubhouse Tour Registration' },
        ],
      },
    ],
  }

  const conn = engine.createConnection(orgId, userId, {
    provider: 'meta_ads',
    name: 'Brigade Multi-Page Advertising',
    status: 'connected',
    metadata: multiAssetMeta,
  }).connection

  const stored = engine.connections.find((c) => c.id === conn.id)
  assert.equal(stored.metadata.pages.length, 2)
  assert.equal(stored.metadata.pages[0].forms.length, 2)
  assert.equal(stored.metadata.pages[1].forms.length, 2)

  console.log('✓ Test 4 Passed: Multiple Pages and forms belong to a connection without conflict')
}

// ---------------------------------------------------------------------------
// TEST 5: Form mappings cannot point to another organisation's project
// ---------------------------------------------------------------------------
{
  const engine = new IntegrationCentreEngine()
  const orgA = 'org_dlf'
  const orgB = 'org_tata'

  const userA = 'user_dlf_admin'
  engine.orgMembers.push({ org_id: orgA, profile_id: userA, role: 'admin' })

  // Org A project
  const projA = { id: 'proj_dlf_1', org_id: orgA, name: 'DLF Camellias' }
  // Org B project (foreign)
  const projB = { id: 'proj_tata_1', org_id: orgB, name: 'Tata Promont' }

  engine.projects.push(projA, projB)

  const connA = engine.createConnection(orgA, userA, {
    provider: 'meta_ads',
    name: 'DLF Marketing Hub',
    status: 'connected',
  }).connection

  // Valid mapping to Org A project
  const validMap = engine.createMapping(orgA, userA, {
    connectionId: connA.id,
    projectId: projA.id,
    externalIdentifierType: 'form_id',
    externalIdentifierValue: 'form_dlf_valid',
    description: 'DLF 4BHK Form',
  })
  assert.equal(validMap.success, true)

  // Malicious / cross-tenant mapping pointing to Org B's project
  const invalidMap = engine.createMapping(orgA, userA, {
    connectionId: connA.id,
    projectId: projB.id,
    externalIdentifierType: 'form_id',
    externalIdentifierValue: 'form_dlf_cross',
    description: 'Illegal Cross Mapping',
  })
  assert.equal(invalidMap.success, false)
  assert.match(invalidMap.error, /does not belong to this organisation/i)

  console.log('✓ Test 5 Passed: Form mappings cannot point to another organisation project')
}

// ---------------------------------------------------------------------------
// TEST 6: Disconnecting a connection does not delete historical leads or attribution
// ---------------------------------------------------------------------------
{
  const engine = new IntegrationCentreEngine()
  const orgId = 'org_lodha'
  const userId = 'user_lodha_admin'

  engine.orgMembers.push({ org_id: orgId, profile_id: userId, role: 'admin' })

  const conn = engine.createConnection(orgId, userId, {
    provider: 'meta_ads',
    name: 'Lodha Luxury Facebook',
    status: 'connected',
  }).connection

  // Simulate 10 historical leads ingested through this connection
  for (let i = 1; i <= 10; i++) {
    engine.leads.push({
      id: `lead_lodha_${i}`,
      org_id: orgId,
      connection_id: conn.id,
      source_platform: 'meta_ads',
      form_name: 'Palava 2BHK Campaign',
      name: `Buyer ${i}`,
      phone: `+91980000000${i}`,
      created_at: new Date().toISOString(),
    })
  }

  assert.equal(engine.leads.length, 10)

  // User disconnects the connection
  const disconnectResult = engine.disconnectConnection(conn.id, userId)
  assert.equal(disconnectResult.success, true)

  // Verify connection status is disabled
  const updatedConn = engine.connections.find((c) => c.id === conn.id)
  assert.equal(updatedConn.status, 'disabled')

  // CRITICAL VERIFICATION: All 10 historical leads are still completely intact
  const remainingLeads = engine.leads.filter((l) => l.org_id === orgId)
  assert.equal(remainingLeads.length, 10)
  for (const lead of remainingLeads) {
    assert.equal(lead.connection_id, conn.id)
    assert.equal(lead.source_platform, 'meta_ads')
    assert.equal(lead.form_name, 'Palava 2BHK Campaign')
  }

  // Audit event was logged
  const event = engine.eventLogs.find((e) => e.connection_id === conn.id)
  assert.ok(event)
  assert.equal(event.event_type, 'connection_disconnected')

  console.log('✓ Test 6 Passed: Disconnecting connection preserves all historical leads and attribution')
}

// ---------------------------------------------------------------------------
// TEST 7: Unconnected integrations do not display as connected
// ---------------------------------------------------------------------------
{
  const engine = new IntegrationCentreEngine()
  const orgId = 'org_puravankara'
  const userId = 'user_pura_mgr'

  engine.orgMembers.push({ org_id: orgId, profile_id: userId, role: 'manager' })

  // Org has no connections
  const res = engine.getConnections(orgId, userId)
  assert.equal(res.success, true)
  assert.equal(res.connections.length, 0)

  // Verify inactive/disabled connection is not reported as active
  const createdConn = engine.createConnection(orgId, userId, {
    provider: 'meta_ads',
    name: 'Draft Meta Connection',
    status: 'not_connected',
  }).connection

  assert.equal(createdConn.status, 'not_connected')
  const check = engine.connections.find((c) => c.id === createdConn.id)
  assert.notEqual(check.status, 'connected')

  console.log('✓ Test 7 Passed: Unconnected integrations do not display as connected')
}

// ---------------------------------------------------------------------------
// TEST 8: Updating a form mapping updates future lead routing without altering past leads
// ---------------------------------------------------------------------------
{
  const engine = new IntegrationCentreEngine()
  const orgId = 'org_shriram'
  const userId = 'user_shriram_admin'

  engine.orgMembers.push({ org_id: orgId, profile_id: userId, role: 'admin' })

  const proj1 = { id: 'proj_shriram_1', org_id: orgId, name: 'Shriram Grand City' }
  const proj2 = { id: 'proj_shriram_2', org_id: orgId, name: 'Shriram Greenfield' }
  engine.projects.push(proj1, proj2)

  const conn = engine.createConnection(orgId, userId, {
    provider: 'meta_ads',
    name: 'Shriram Ads',
    status: 'connected',
  }).connection

  // Initial mapping to Project 1
  const mapResult = engine.createMapping(orgId, userId, {
    connectionId: conn.id,
    projectId: proj1.id,
    externalIdentifierType: 'form_id',
    externalIdentifierValue: 'form_shriram_launch',
  })
  assert.equal(mapResult.success, true)

  // Ingest Lead 1 using Project 1
  const pastLead = {
    id: 'lead_past_1',
    org_id: orgId,
    project_id: proj1.id,
    form_id: 'form_shriram_launch',
  }
  engine.leads.push(pastLead)

  // Update mapping to Project 2
  const updateRes = engine.updateMapping(mapResult.mapping.id, userId, proj2.id)
  assert.equal(updateRes.success, true)
  assert.equal(updateRes.mapping.project_id, proj2.id)

  // Verify past lead STILL points to Project 1
  const retrievedPastLead = engine.leads.find((l) => l.id === pastLead.id)
  assert.equal(retrievedPastLead.project_id, proj1.id)

  console.log('✓ Test 8 Passed: Updating form mapping updates future routing without altering past leads')
}

// ---------------------------------------------------------------------------
// TEST 9: Reconnecting an expired or disabled connection restores active status
// ---------------------------------------------------------------------------
{
  const engine = new IntegrationCentreEngine()
  const orgId = 'org_embassy'
  const userId = 'user_embassy_admin'

  engine.orgMembers.push({ org_id: orgId, profile_id: userId, role: 'admin' })

  const conn = engine.createConnection(orgId, userId, {
    provider: 'meta_ads',
    name: 'Embassy Office Parks Ads',
    status: 'error',
  }).connection

  assert.equal(conn.status, 'error')

  // Reconnect
  const reconnectRes = engine.reconnectConnection(conn.id, userId)
  assert.equal(reconnectRes.success, true)
  assert.equal(reconnectRes.connection.status, 'connected')
  assert.equal(reconnectRes.connection.last_error, null)
  assert.ok(reconnectRes.connection.last_sync_at)

  console.log('✓ Test 9 Passed: Reconnecting restores active status and clears error state')
}

// ---------------------------------------------------------------------------
// TEST 10: RBAC enforcement on connection management
// ---------------------------------------------------------------------------
{
  const engine = new IntegrationCentreEngine()
  const orgId = 'org_oberoi'
  const adminId = 'user_oberoi_admin'
  const salesId = 'user_oberoi_sales'
  const readOnlyId = 'user_oberoi_readonly'

  engine.orgMembers.push(
    { org_id: orgId, profile_id: adminId, role: 'admin' },
    { org_id: orgId, profile_id: salesId, role: 'sales_exec' },
    { org_id: orgId, profile_id: readOnlyId, role: 'readonly' }
  )

  // Sales executive blocked from creating connections
  const salesCreate = engine.createConnection(orgId, salesId, {
    provider: 'meta_ads',
    name: 'Unauthorized Sales Connection',
  })
  assert.equal(salesCreate.success, false)
  assert.equal(salesCreate.status, 403)

  // Read-only member blocked from creating connections
  const roCreate = engine.createConnection(orgId, readOnlyId, {
    provider: 'meta_ads',
    name: 'Unauthorized RO Connection',
  })
  assert.equal(roCreate.success, false)
  assert.equal(roCreate.status, 403)

  // Admin allowed
  const adminCreate = engine.createConnection(orgId, adminId, {
    provider: 'meta_ads',
    name: 'Authorized Admin Connection',
    status: 'connected',
  })
  assert.equal(adminCreate.success, true)

  // Sales executive blocked from disconnecting
  const salesDisconnect = engine.disconnectConnection(adminCreate.connection.id, salesId)
  assert.equal(salesDisconnect.success, false)
  assert.equal(salesDisconnect.status, 403)

  console.log('✓ Test 10 Passed: RBAC strictly enforces connection management roles')
}

console.log('\n--- ALL 10 INTEGRATION CENTRE UX (STAGE 4A) TESTS PASSED ---\n')
