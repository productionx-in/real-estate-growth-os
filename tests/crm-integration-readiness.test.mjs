// tests/crm-integration-readiness.test.mjs
// Comprehensive test suite for Stage 3G: CRM Integration Readiness & Lead Source Architecture
// NOTE: These tests verify domain logic, routing priority, data validation, and idempotency handling in-memory.
// Database-level constraints (PostgreSQL unique partial indexes and triggers) are defined in 20260015_crm_integration_readiness.sql.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

console.log('--- Running CRM Integration Readiness (Stage 3G) Tests ---')

// ---------------------------------------------------------------------------
// Pure Domain Logic Under Test (matches lib/integrations/deduplication.ts)
// ---------------------------------------------------------------------------

function normalizePhone(rawPhone) {
  if (!rawPhone) return ''
  const trimmed = rawPhone.trim()
  const cleaned = trimmed.replace(/[^\d+]/g, '')

  if (cleaned.startsWith('+')) {
    return cleaned
  }

  if (cleaned.length === 11 && cleaned.startsWith('0')) {
    const withoutZero = cleaned.slice(1)
    if (/^[6-9]\d{9}$/.test(withoutZero)) {
      return `+91${withoutZero}`
    }
  }

  if (cleaned.length === 12 && cleaned.startsWith('91')) {
    return `+${cleaned}`
  }

  if (cleaned.length === 10 && /^[6-9]/.test(cleaned)) {
    return `+91${cleaned}`
  }

  return cleaned.startsWith('+') ? cleaned : `+${cleaned}`
}

function normalizeEmail(rawEmail) {
  if (!rawEmail) return null
  const trimmed = rawEmail.trim().toLowerCase()
  return trimmed.length > 0 ? trimmed : null
}

function generateIdempotencyKey(params) {
  const { orgId, provider, externalLeadId, idempotencyToken } = params

  if (externalLeadId && externalLeadId.trim()) {
    return createHash('sha256')
      .update(`ext:${orgId}:${provider}:${externalLeadId.trim()}`, 'utf8')
      .digest('hex')
  }

  if (idempotencyToken && idempotencyToken.trim()) {
    return createHash('sha256')
      .update(`token:${orgId}:${provider}:${idempotencyToken.trim()}`, 'utf8')
      .digest('hex')
  }

  return null
}

function evaluateDeduplication(params) {
  const { inboundPhone, inboundEmail, externalLeadId, inboundProjectId, existingLeads } = params
  const normPhone = normalizePhone(inboundPhone)
  const normEmail = normalizeEmail(inboundEmail)

  // 1. Check exact external lead ID match (Case A: Duplicate external event)
  if (externalLeadId && externalLeadId.trim()) {
    const trimmedExt = externalLeadId.trim()
    const extMatch = existingLeads.find((l) => l.external_lead_id === trimmedExt)
    if (extMatch) {
      return {
        isDuplicate: true,
        duplicateOfId: extMatch.id,
        classification: 'duplicate_external_event',
        matchReason: 'external_lead_id',
      }
    }
  }

  // 2. Find candidate contact match by normalized phone or email
  let contactMatch
  let matchReason

  if (normPhone) {
    contactMatch = existingLeads.find((l) => normalizePhone(l.phone) === normPhone)
    if (contactMatch) matchReason = 'phone_match'
  }

  if (!contactMatch && normEmail) {
    contactMatch = existingLeads.find((l) => normalizeEmail(l.email) === normEmail)
    if (contactMatch) matchReason = 'email_match'
  }

  if (contactMatch) {
    const isSameProject =
      (Boolean(inboundProjectId) && Boolean(contactMatch.project_id) && inboundProjectId === contactMatch.project_id) ||
      (!inboundProjectId && !contactMatch.project_id)

    if (isSameProject) {
      // Case B: Possible duplicate customer enquiry for the same project
      return {
        isDuplicate: true,
        duplicateOfId: contactMatch.id,
        classification: 'possible_duplicate_customer_enquiry',
        matchReason,
      }
    } else {
      // Case C: Genuinely separate enquiry from the same customer for a DIFFERENT project
      return {
        isDuplicate: false,
        duplicateOfId: null,
        classification: 'separate_customer_enquiry',
        relatedLeadId: contactMatch.id,
      }
    }
  }

  return {
    isDuplicate: false,
    duplicateOfId: null,
    classification: 'new_customer_enquiry',
  }
}

// ---------------------------------------------------------------------------
// Mock In-Memory Database Engine for Integration Architecture Verification
// ---------------------------------------------------------------------------

class MockDatabase {
  constructor() {
    this.organisations = []
    this.profiles = []
    this.orgMembers = []
    this.projects = []
    this.connections = []
    this.mappings = []
    this.leads = []
    this.eventLogs = []
    this.activities = []
  }

  reset() {
    this.organisations = []
    this.profiles = []
    this.orgMembers = []
    this.projects = []
    this.connections = []
    this.mappings = []
    this.leads = []
    this.eventLogs = []
    this.activities = []
  }

  getConnectionsForOrg(orgId, callerProfileId) {
    const member = this.orgMembers.find(
      (m) => m.org_id === orgId && m.profile_id === callerProfileId
    )
    if (!member) return []
    // Redact credential_ref before returning to client-facing callers
    return this.connections
      .filter((c) => c.org_id === orgId)
      .map((c) => ({
        ...c,
        credential_ref: c.credential_ref ? 'CONFIGURED_SECURE_REFERENCE' : null,
      }))
  }

  createConnection(orgId, callerProfileId, data) {
    const member = this.orgMembers.find(
      (m) => m.org_id === orgId && m.profile_id === callerProfileId
    )
    if (!member || !['owner', 'admin', 'manager'].includes(member.role)) {
      return { connection: null, error: 'Forbidden: Insufficient role' }
    }

    if (data.credential_ref) {
      const trimmed = data.credential_ref.trim()
      const isValidRef = trimmed.startsWith('vault://') || trimmed.startsWith('kms://') || trimmed.startsWith('secret://')
      if (!isValidRef) {
        return {
          connection: null,
          error: 'Plaintext secret tokens are strictly forbidden. Use external Vault/KMS references.',
        }
      }
    }

    const connection = {
      id: `conn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      org_id: orgId,
      provider: data.provider,
      name: data.name,
      external_account_id: data.external_account_id || null,
      status: data.status || 'not_connected',
      connected_by: callerProfileId,
      last_sync_at: null,
      last_error: null,
      credential_ref: data.credential_ref || null,
      metadata: data.metadata || {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    this.connections.push(connection)
    return { connection, error: null }
  }

  // Update connection with organisation immutability check
  updateConnection(connectionId, orgId, updates) {
    const conn = this.connections.find((c) => c.id === connectionId)
    if (!conn) return { error: 'Connection not found' }

    if (updates.org_id !== undefined && updates.org_id !== conn.org_id) {
      return { error: 'Organisation ownership of an integration connection is immutable' }
    }

    Object.assign(conn, updates)
    conn.updated_at = new Date().toISOString()
    return { connection: conn, error: null }
  }

  // Update project with organisation immutability check
  updateProject(projectId, updates) {
    const proj = this.projects.find((p) => p.id === projectId)
    if (!proj) return { error: 'Project not found' }

    if (updates.org_id !== undefined && updates.org_id !== proj.org_id) {
      return { error: 'Project organisation ownership is immutable' }
    }

    Object.assign(proj, updates)
    return { project: proj, error: null }
  }

  createMapping(orgId, callerProfileId, data) {
    const member = this.orgMembers.find(
      (m) => m.org_id === orgId && m.profile_id === callerProfileId
    )
    if (!member || !['owner', 'admin', 'manager'].includes(member.role)) {
      return { mapping: null, error: 'Forbidden: Insufficient role' }
    }

    // Cross-tenant mapping validation (verifies connection and project belong to orgId)
    const conn = this.connections.find((c) => c.id === data.connection_id && c.org_id === orgId)
    if (!conn) {
      return { mapping: null, error: 'Cross-tenant mapping rejected: Connection does not belong to organisation' }
    }

    const proj = this.projects.find((p) => p.id === data.project_id && p.org_id === orgId)
    if (!proj) {
      return { mapping: null, error: 'Cross-tenant mapping rejected: Project does not belong to organisation' }
    }

    const mapping = {
      id: `map_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      org_id: orgId,
      connection_id: data.connection_id,
      project_id: data.project_id,
      external_identifier_type: data.external_identifier_type,
      external_identifier_value: data.external_identifier_value.trim(),
      description: data.description || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    this.mappings.push(mapping)
    return { mapping, error: null }
  }

  // Process inbound lead with Lead-to-Project Org Integrity Enforcement
  processInbound(orgId, payload, simulatedDbError = null) {
    const normPhone = normalizePhone(payload.phone)
    const normEmail = normalizeEmail(payload.email)

    if (!normPhone && !normEmail) {
      return {
        success: false,
        error: 'Inbound lead must have at least a phone number or email',
      }
    }

    const idempotencyKey = generateIdempotencyKey({
      orgId,
      provider: payload.provider,
      externalLeadId: payload.externalLeadId,
      idempotencyToken: payload.idempotencyToken,
    })

    // Check exact idempotency replay (Case A)
    if (!simulatedDbError && idempotencyKey) {
      const existingByKey = this.leads.find(
        (l) => l.org_id === orgId && l.idempotency_key === idempotencyKey
      )
      if (existingByKey) {
        this.eventLogs.push({
          id: `log_${Date.now()}`,
          org_id: orgId,
          connection_id: payload.connectionId || null,
          provider: payload.provider,
          event_type: 'lead_idempotent_replay',
          processing_status: 'duplicate',
          lead_id: existingByKey.id,
          created_at: new Date().toISOString(),
        })

        return {
          success: true,
          leadId: existingByKey.id,
          isDuplicate: existingByKey.is_duplicate,
          duplicateOfId: existingByKey.duplicate_of_id,
          projectId: existingByKey.project_id,
          routingStatus: existingByKey.project_id ? 'mapped' : 'unmapped',
          idempotencyKey,
          action: 'idempotent_replay',
          classification: 'duplicate_external_event',
        }
      }
    }

    // Resolve project mapping
    let resolvedProjectId = null
    let routingStatus = 'unmapped'

    if (payload.connectionId) {
      const activeMappings = this.mappings.filter(
        (m) => m.org_id === orgId && m.connection_id === payload.connectionId
      )

      if (payload.campaignId) {
        const match = activeMappings.find(
          (m) =>
            m.external_identifier_type === 'campaign_id' &&
            m.external_identifier_value === payload.campaignId
        )
        if (match) resolvedProjectId = match.project_id
      }

      if (!resolvedProjectId && payload.formId) {
        const match = activeMappings.find(
          (m) =>
            m.external_identifier_type === 'form_id' &&
            m.external_identifier_value === payload.formId
        )
        if (match) resolvedProjectId = match.project_id
      }

      if (!resolvedProjectId && payload.sourceUrl) {
        const match = activeMappings.find(
          (m) =>
            m.external_identifier_type === 'page_id' &&
            m.external_identifier_value === payload.sourceUrl
        )
        if (match) resolvedProjectId = match.project_id
      }

      if (!resolvedProjectId) {
        const match = activeMappings.find(
          (m) => m.external_identifier_type === 'account_default'
        )
        if (match) resolvedProjectId = match.project_id
      }

      if (resolvedProjectId) {
        routingStatus = 'mapped'
      } else {
        routingStatus = 'unmapped'
      }
    } else if (payload.projectId) {
      // Manual/direct project assignment
      resolvedProjectId = payload.projectId
      routingStatus = 'mapped'
    }

    // LEAD-TO-PROJECT ORGANISATION INTEGRITY CHECK (Database-level trigger check_lead_tenant_integrity simulation)
    if (resolvedProjectId) {
      const targetProj = this.projects.find((p) => p.id === resolvedProjectId)
      if (!targetProj || targetProj.org_id !== orgId) {
        return {
          success: false,
          action: 'error',
          errorMessage: `Lead project must belong to the same organisation (lead.org_id ${orgId}, project.org_id ${targetProj?.org_id})`,
        }
      }
    }

    // Multi-category deduplication check (A, B, C)
    const orgLeads = this.leads.filter((l) => l.org_id === orgId)
    const dedupResult = evaluateDeduplication({
      inboundPhone: normPhone,
      inboundEmail: normEmail,
      externalLeadId: payload.externalLeadId,
      inboundProjectId: resolvedProjectId,
      existingLeads: orgLeads,
    })

    if (!simulatedDbError && dedupResult.classification === 'duplicate_external_event' && dedupResult.duplicateOfId) {
      return {
        success: true,
        leadId: dedupResult.duplicateOfId,
        isDuplicate: true,
        duplicateOfId: dedupResult.duplicateOfId,
        projectId: resolvedProjectId,
        routingStatus,
        idempotencyKey,
        action: 'idempotent_replay',
        classification: 'duplicate_external_event',
      }
    }

    // Simulate Database Unique Constraint Failure & Concurrency Handling (Section 4)
    if (simulatedDbError) {
      const rawMsg = simulatedDbError.message || ''
      const isIdempotencyKeyConflict =
        simulatedDbError.code === '23505' &&
        Boolean(idempotencyKey) &&
        rawMsg.includes('uq_leads_org_idempotency_key')

      const isExternalLeadIdConflict =
        simulatedDbError.code === '23505' &&
        Boolean(payload.externalLeadId) &&
        Boolean(payload.connectionId) &&
        rawMsg.includes('uq_leads_connection_external_lead_id')

      if (isIdempotencyKeyConflict || isExternalLeadIdConflict) {
        // Safe idempotent replay resolution with verification of org and connection
        const existingLead = isIdempotencyKeyConflict
          ? this.leads.find((l) => l.org_id === orgId && l.idempotency_key === idempotencyKey)
          : this.leads.find((l) => l.org_id === orgId && l.external_lead_id === payload.externalLeadId)
        if (
          isExternalLeadIdConflict &&
          payload.connectionId &&
          existingLead?.connection_id &&
          existingLead.connection_id !== payload.connectionId
        ) {
          return {
            success: false,
            action: 'error',
            errorMessage: 'Conflict resolution mismatch: winning lead does not match expected connection',
          }
        }

        return {
          success: true,
          leadId: existingLead?.id,
          isDuplicate: existingLead?.is_duplicate ?? false,
          duplicateOfId: existingLead?.duplicate_of_id ?? null,
          projectId: existingLead?.project_id ?? null,
          routingStatus: existingLead?.project_id ? 'mapped' : 'unmapped',
          idempotencyKey,
          action: 'idempotent_replay',
          classification: 'duplicate_external_event',
        }
      } else {
        // Genuine unrelated database failure: DO NOT report as replay!
        return {
          success: false,
          action: 'error',
          errorMessage: simulatedDbError.message,
        }
      }
    }

    let finalAction = 'created'
    if (dedupResult.classification === 'possible_duplicate_customer_enquiry') {
      finalAction = 'flagged_duplicate_created'
    } else if (dedupResult.classification === 'separate_customer_enquiry') {
      finalAction = 'separate_enquiry_created'
    }

    const newLead = {
      id: `lead_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      org_id: orgId,
      name: payload.name.trim() || 'Inbound Lead',
      phone: normPhone,
      email: normEmail,
      source: payload.provider,
      source_platform: payload.provider,
      campaign_name: payload.campaignName || null,
      campaign_id: payload.campaignId || null,
      ad_name: payload.adName || null,
      ad_id: payload.adId || null,
      form_name: payload.formName || null,
      form_id: payload.formId || null,
      external_lead_id: payload.externalLeadId || null,
      source_url: payload.sourceUrl || null,
      connection_id: payload.connectionId || null,
      source_metadata: payload.sourceMetadata || {},
      idempotency_key: idempotencyKey,
      is_duplicate: dedupResult.isDuplicate,
      duplicate_of_id: dedupResult.duplicateOfId,
      project_id: resolvedProjectId,
      status: 'new',
      priority: dedupResult.isDuplicate ? 'low' : 'medium',
      notes: payload.notes || (dedupResult.isDuplicate ? 'Flagged as potential duplicate' : null),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    this.leads.push(newLead)

    this.eventLogs.push({
      id: `log_${Date.now()}`,
      org_id: orgId,
      connection_id: payload.connectionId || null,
      provider: payload.provider,
      event_type: 'lead_ingested',
      processing_status: routingStatus === 'unmapped' ? 'unmapped' : 'processed',
      external_event_id: payload.externalLeadId || null,
      lead_id: newLead.id,
      created_at: new Date().toISOString(),
    })

    return {
      success: true,
      leadId: newLead.id,
      isDuplicate: dedupResult.isDuplicate,
      duplicateOfId: dedupResult.duplicateOfId,
      projectId: resolvedProjectId,
      routingStatus,
      idempotencyKey,
      action: finalAction,
      classification: dedupResult.classification,
    }
  }

  // Update lead with Lead-to-Project Org Integrity & Org Immutability checks
  updateLead(leadId, callerOrgId, updates) {
    const lead = this.leads.find((l) => l.id === leadId)
    if (!lead || lead.org_id !== callerOrgId) return { error: 'Lead not found in this organisation' }

    // Immutability of lead org_id
    if (updates.org_id !== undefined && updates.org_id !== lead.org_id) {
      return { error: 'Lead organisation ownership is immutable' }
    }

    // Lead-to-project integrity on update/reassignment
    if (updates.project_id !== undefined && updates.project_id !== null) {
      const proj = this.projects.find((p) => p.id === updates.project_id)
      if (!proj || proj.org_id !== callerOrgId) {
        return { error: `Cross-tenant project assignment rejected: project belongs to another organisation` }
      }
    }

    lead.project_id = updates.project_id !== undefined ? updates.project_id : lead.project_id
    lead.status = updates.status !== undefined ? updates.status : lead.status
    lead.priority = updates.priority !== undefined ? updates.priority : lead.priority
    lead.notes = updates.notes !== undefined ? updates.notes : lead.notes
    lead.updated_at = new Date().toISOString()

    return { lead, error: null }
  }
}

// ---------------------------------------------------------------------------
// TEST 1: Organisation Isolation on Connections and Mappings
// ---------------------------------------------------------------------------
{
  const db = new MockDatabase()
  db.organisations = [
    { id: 'org_dev_1', name: 'Prestige Estates', type: 'developer' },
    { id: 'org_dev_2', name: 'Sobha Developers', type: 'developer' },
  ]
  db.profiles = [
    { id: 'usr_1', full_name: 'Admin Org 1' },
    { id: 'usr_2', full_name: 'Admin Org 2' },
  ]
  db.orgMembers = [
    { org_id: 'org_dev_1', profile_id: 'usr_1', role: 'admin' },
    { org_id: 'org_dev_2', profile_id: 'usr_2', role: 'admin' },
  ]

  const res1 = db.createConnection('org_dev_1', 'usr_1', {
    provider: 'meta_ads',
    name: 'Prestige Meta Account',
    external_account_id: 'act_11111',
  })
  assert.equal(res1.error, null)

  const org2Conns = db.getConnectionsForOrg('org_dev_2', 'usr_2')
  assert.equal(org2Conns.length, 0, 'Org 2 should not see Org 1 connections')

  const org1Conns = db.getConnectionsForOrg('org_dev_1', 'usr_1')
  assert.equal(org1Conns.length, 1)
  assert.equal(org1Conns[0].name, 'Prestige Meta Account')

  console.log('✓ Test 1 Passed: Complete organisation isolation on integration connections')
}

// ---------------------------------------------------------------------------
// TEST 2: Connection Access Permissions (Role-Based Access Control)
// ---------------------------------------------------------------------------
{
  const db = new MockDatabase()
  db.organisations = [{ id: 'org_1', name: 'Godrej Properties', type: 'developer' }]
  db.orgMembers = [
    { org_id: 'org_1', profile_id: 'usr_admin', role: 'admin' },
    { org_id: 'org_1', profile_id: 'usr_manager', role: 'manager' },
    { org_id: 'org_1', profile_id: 'usr_agent', role: 'member' },
    { org_id: 'org_1', profile_id: 'usr_readonly', role: 'readonly' },
  ]

  const adminRes = db.createConnection('org_1', 'usr_admin', {
    provider: 'google_ads',
    name: 'Google Ads Main',
  })
  assert.equal(adminRes.error, null)

  const managerRes = db.createConnection('org_1', 'usr_manager', {
    provider: 'meta_ads',
    name: 'Meta Ads Secondary',
  })
  assert.equal(managerRes.error, null)

  const memberRes = db.createConnection('org_1', 'usr_agent', {
    provider: 'whatsapp_cloud',
    name: 'WhatsApp Channel',
  })
  assert.match(memberRes.error, /Forbidden/i)

  const readonlyRes = db.createConnection('org_1', 'usr_readonly', {
    provider: 'website_webhook',
    name: 'Web Intake',
  })
  assert.match(readonlyRes.error, /Forbidden/i)

  console.log('✓ Test 2 Passed: RBAC permissions strictly enforce connection management roles')
}

// ---------------------------------------------------------------------------
// TEST 3: Project Mapping Resolution Priority (campaign_id > form_id > page_id > account_default)
// ---------------------------------------------------------------------------
{
  const db = new MockDatabase()
  const orgId = 'org_brigade'
  const connId = 'conn_meta_1'
  db.connections.push({ id: connId, org_id: orgId })
  db.projects.push(
    { id: 'proj_tower_a', org_id: orgId },
    { id: 'proj_tower_b', org_id: orgId },
    { id: 'proj_tower_c', org_id: orgId },
    { id: 'proj_default_fallback', org_id: orgId }
  )
  db.orgMembers = [{ org_id: orgId, profile_id: 'admin_1', role: 'admin' }]

  db.createMapping(orgId, 'admin_1', {
    connection_id: connId,
    project_id: 'proj_tower_a',
    external_identifier_type: 'campaign_id',
    external_identifier_value: 'camp_101',
    description: 'Tower A Campaign',
  })

  db.createMapping(orgId, 'admin_1', {
    connection_id: connId,
    project_id: 'proj_tower_b',
    external_identifier_type: 'form_id',
    external_identifier_value: 'form_202',
    description: 'Tower B Lead Form',
  })

  db.createMapping(orgId, 'admin_1', {
    connection_id: connId,
    project_id: 'proj_tower_c',
    external_identifier_type: 'page_id',
    external_identifier_value: 'https://developer.com/tower-c',
    description: 'Tower C Landing Page',
  })

  db.createMapping(orgId, 'admin_1', {
    connection_id: connId,
    project_id: 'proj_default_fallback',
    external_identifier_type: 'account_default',
    external_identifier_value: 'default',
    description: 'General Account Fallback',
  })

  const resA = db.processInbound(orgId, {
    connectionId: connId,
    provider: 'meta_ads',
    name: 'Buyer A',
    phone: '9876543210',
    campaignId: 'camp_101',
    formId: 'form_202',
  })
  assert.equal(resA.projectId, 'proj_tower_a')
  assert.equal(resA.routingStatus, 'mapped')

  const resB = db.processInbound(orgId, {
    connectionId: connId,
    provider: 'meta_ads',
    name: 'Buyer B',
    phone: '9876543211',
    formId: 'form_202',
  })
  assert.equal(resB.projectId, 'proj_tower_b')
  assert.equal(resB.routingStatus, 'mapped')

  const resC = db.processInbound(orgId, {
    connectionId: connId,
    provider: 'meta_ads',
    name: 'Buyer C',
    phone: '9876543212',
    sourceUrl: 'https://developer.com/tower-c',
  })
  assert.equal(resC.projectId, 'proj_tower_c')
  assert.equal(resC.routingStatus, 'mapped')

  const resD = db.processInbound(orgId, {
    connectionId: connId,
    provider: 'meta_ads',
    name: 'Buyer D',
    phone: '9876543213',
    campaignId: 'unknown_camp_999',
  })
  assert.equal(resD.projectId, 'proj_default_fallback')
  assert.equal(resD.routingStatus, 'mapped')

  console.log('✓ Test 3 Passed: Project mapping priority (campaign > form > page > account_default)')
}

// ---------------------------------------------------------------------------
// TEST 4: Multiple Connections per Organisation (e.g. 2 Meta Ad Accounts)
// ---------------------------------------------------------------------------
{
  const db = new MockDatabase()
  const orgId = 'org_dlf'
  db.orgMembers = [{ org_id: orgId, profile_id: 'admin_dlf', role: 'owner' }]

  const conn1 = db.createConnection(orgId, 'admin_dlf', {
    provider: 'meta_ads',
    name: 'DLF Luxury Portfolio (Gurugram)',
    external_account_id: 'act_luxury_888',
  })
  const conn2 = db.createConnection(orgId, 'admin_dlf', {
    provider: 'meta_ads',
    name: 'DLF Mid-Segment (New Gurugram)',
    external_account_id: 'act_mid_999',
  })

  assert.equal(conn1.error, null)
  assert.equal(conn2.error, null)
  assert.notEqual(conn1.connection.id, conn2.connection.id)

  const orgConns = db.getConnectionsForOrg(orgId, 'admin_dlf')
  assert.equal(orgConns.length, 2, 'Should support multiple connections of same provider')
  assert.equal(orgConns[0].provider, 'meta_ads')
  assert.equal(orgConns[1].provider, 'meta_ads')

  console.log('✓ Test 4 Passed: Multiple accounts per organisation supported without conflict')
}

// ---------------------------------------------------------------------------
// TEST 5: Multiple Campaigns Mapped to Different Internal Projects
// ---------------------------------------------------------------------------
{
  const db = new MockDatabase()
  const orgId = 'org_embassy'
  const connId = 'conn_google_ads'
  db.connections.push({ id: connId, org_id: orgId })
  db.projects.push(
    { id: 'proj_lake_terraces', org_id: orgId },
    { id: 'proj_boulevard_comm', org_id: orgId }
  )
  db.orgMembers = [{ org_id: orgId, profile_id: 'admin_embassy', role: 'admin' }]

  db.createMapping(orgId, 'admin_embassy', {
    connection_id: connId,
    project_id: 'proj_lake_terraces',
    external_identifier_type: 'campaign_id',
    external_identifier_value: 'google_camp_lake',
  })

  db.createMapping(orgId, 'admin_embassy', {
    connection_id: connId,
    project_id: 'proj_boulevard_comm',
    external_identifier_type: 'campaign_id',
    external_identifier_value: 'google_camp_boulevard',
  })

  const lead1 = db.processInbound(orgId, {
    connectionId: connId,
    provider: 'google_ads',
    name: 'Residential Lead',
    phone: '9988776655',
    campaignId: 'google_camp_lake',
    campaignName: 'Search_LakeTerraces_Luxury',
  })
  assert.equal(lead1.projectId, 'proj_lake_terraces')

  const lead2 = db.processInbound(orgId, {
    connectionId: connId,
    provider: 'google_ads',
    name: 'Commercial Investor',
    phone: '9988776656',
    campaignId: 'google_camp_boulevard',
    campaignName: 'Search_Boulevard_RetailOffices',
  })
  assert.equal(lead2.projectId, 'proj_boulevard_comm')

  console.log('✓ Test 5 Passed: Multiple campaigns cleanly route to distinct internal projects')
}

// ---------------------------------------------------------------------------
// TEST 6: Unmapped Lead Handling (Never silently assign to arbitrary project)
// ---------------------------------------------------------------------------
{
  const db = new MockDatabase()
  const orgId = 'org_sobha'
  const connId = 'conn_meta_unmapped_test'
  db.orgMembers = [{ org_id: orgId, profile_id: 'admin_sobha', role: 'admin' }]

  const res = db.processInbound(orgId, {
    connectionId: connId,
    provider: 'meta_ads',
    name: 'Unrouted Buyer',
    phone: '9845012345',
    campaignId: 'unmapped_brand_awareness_campaign',
  })

  assert.equal(res.success, true)
  assert.equal(res.projectId, null, 'Unmapped lead project_id must strictly be null')
  assert.equal(res.routingStatus, 'unmapped')

  const storedLead = db.leads.find((l) => l.id === res.leadId)
  assert.equal(storedLead.project_id, null)

  const eventLog = db.eventLogs.find((e) => e.lead_id === res.leadId)
  assert.equal(eventLog.processing_status, 'unmapped')

  console.log('✓ Test 6 Passed: Unmapped leads remain unassigned; never routed to random project')
}

// ---------------------------------------------------------------------------
// TEST 7: External Lead ID Idempotency (Duplicate Webhook Delivery)
// ---------------------------------------------------------------------------
{
  const db = new MockDatabase()
  const orgId = 'org_lodha'
  const connId = 'conn_fb_lodha'
  db.orgMembers = [{ org_id: orgId, profile_id: 'admin_lodha', role: 'admin' }]

  const payload = {
    connectionId: connId,
    provider: 'meta_ads',
    externalLeadId: 'fb_leadgen_1092837465',
    name: 'Anand Kumar',
    phone: '+919811122233',
    email: 'anand.k@example.com',
    campaignId: 'lodha_altamount',
  }

  const delivery1 = db.processInbound(orgId, payload)
  assert.equal(delivery1.success, true)
  assert.equal(delivery1.action, 'created')
  const initialLeadId = delivery1.leadId

  const delivery2 = db.processInbound(orgId, payload)
  assert.equal(delivery2.success, true)
  assert.equal(delivery2.action, 'idempotent_replay')
  assert.equal(delivery2.leadId, initialLeadId)

  const delivery3 = db.processInbound(orgId, payload)
  assert.equal(delivery3.action, 'idempotent_replay')
  assert.equal(delivery3.leadId, initialLeadId)

  const leadsInOrg = db.leads.filter((l) => l.org_id === orgId)
  assert.equal(leadsInOrg.length, 1, 'Idempotent replay must not create duplicate lead rows')

  console.log('✓ Test 7 Passed: Deterministic idempotency protects against webhook replay duplication')
}

// ---------------------------------------------------------------------------
// TEST 8A: Case A — Duplicate Delivery of the Same External Event
// ---------------------------------------------------------------------------
{
  const db = new MockDatabase()
  const orgId = 'org_tata_realty'
  db.orgMembers = [{ org_id: orgId, profile_id: 'admin_tata', role: 'admin' }]

  const lead1 = db.processInbound(orgId, {
    provider: 'meta_ads',
    externalLeadId: 'meta_evt_777888',
    name: 'Pooja Sharma',
    phone: '9820011223',
    email: 'pooja.s@example.com',
  })
  assert.equal(lead1.classification, 'new_customer_enquiry')

  const replay = db.processInbound(orgId, {
    provider: 'meta_ads',
    externalLeadId: 'meta_evt_777888',
    name: 'Pooja Sharma',
    phone: '9820011223',
    email: 'pooja.s@example.com',
  })

  assert.equal(replay.action, 'idempotent_replay')
  assert.equal(replay.classification, 'duplicate_external_event')
  assert.equal(replay.leadId, lead1.leadId)
  assert.equal(db.leads.filter((l) => l.org_id === orgId).length, 1)

  console.log('✓ Test 8A Passed: Case A (Duplicate delivery of same external event handled via idempotency)')
}

// ---------------------------------------------------------------------------
// TEST 8B: Case B — Possible Duplicate Customer Enquiry (Same Project)
// ---------------------------------------------------------------------------
{
  const db = new MockDatabase()
  const orgId = 'org_tata_realty'
  const connId = 'conn_tata_meta'
  db.connections.push({ id: connId, org_id: orgId })
  db.projects.push({ id: 'proj_tata_promont', org_id: orgId })
  db.orgMembers = [{ org_id: orgId, profile_id: 'admin_tata', role: 'admin' }]

  db.createMapping(orgId, 'admin_tata', {
    connection_id: connId,
    project_id: 'proj_tata_promont',
    external_identifier_type: 'campaign_id',
    external_identifier_value: 'camp_promont',
  })

  const lead1 = db.processInbound(orgId, {
    connectionId: connId,
    provider: 'meta_ads',
    externalLeadId: 'ext_event_1',
    name: 'Pooja Sharma',
    phone: '9820011223',
    campaignId: 'camp_promont',
    notes: 'Initial inquiry for 3BHK',
  })

  const lead2 = db.processInbound(orgId, {
    connectionId: connId,
    provider: 'meta_ads',
    externalLeadId: 'ext_event_2',
    name: 'Pooja S (Duplicate Submission)',
    phone: '+91 98200 11223',
    campaignId: 'camp_promont',
    notes: 'Follow-up enquiry',
  })

  assert.equal(lead2.isDuplicate, true)
  assert.equal(lead2.duplicateOfId, lead1.leadId)
  assert.equal(lead2.action, 'flagged_duplicate_created')
  assert.equal(lead2.classification, 'possible_duplicate_customer_enquiry')

  const originalAfter = db.leads.find((l) => l.id === lead1.leadId)
  assert.equal(originalAfter.name, 'Pooja Sharma')
  assert.equal(originalAfter.notes, 'Initial inquiry for 3BHK')
  assert.equal(originalAfter.is_duplicate, false)

  const dupRecord = db.leads.find((l) => l.id === lead2.leadId)
  assert.equal(dupRecord.is_duplicate, true)
  assert.equal(dupRecord.duplicate_of_id, lead1.leadId)

  console.log('✓ Test 8B Passed: Case B (Possible duplicate customer enquiry for same project flagged non-destructively)')
}

// ---------------------------------------------------------------------------
// TEST 8C: Case C — Genuinely Separate Enquiry from the Same Customer (Different Project)
// ---------------------------------------------------------------------------
{
  const db = new MockDatabase()
  const orgId = 'org_tata_realty'
  const connId = 'conn_tata_web'
  db.connections.push({ id: connId, org_id: orgId })
  db.projects.push(
    { id: 'proj_promont_luxury', org_id: orgId },
    { id: 'proj_avenue_commercial', org_id: orgId }
  )
  db.orgMembers = [{ org_id: orgId, profile_id: 'admin_tata', role: 'admin' }]

  db.createMapping(orgId, 'admin_tata', {
    connection_id: connId,
    project_id: 'proj_promont_luxury',
    external_identifier_type: 'campaign_id',
    external_identifier_value: 'camp_promont',
  })

  db.createMapping(orgId, 'admin_tata', {
    connection_id: connId,
    project_id: 'proj_avenue_commercial',
    external_identifier_type: 'campaign_id',
    external_identifier_value: 'camp_avenue',
  })

  const leadResidential = db.processInbound(orgId, {
    connectionId: connId,
    provider: 'website_webhook',
    name: 'Rajesh Khanna',
    phone: '9844011223',
    email: 'rajesh.k@example.com',
    campaignId: 'camp_promont',
    notes: 'Looking for 4BHK Penthouse',
  })
  assert.equal(leadResidential.projectId, 'proj_promont_luxury')
  assert.equal(leadResidential.isDuplicate, false)

  const leadCommercial = db.processInbound(orgId, {
    connectionId: connId,
    provider: 'website_webhook',
    name: 'Rajesh Khanna',
    phone: '+91 98440 11223',
    email: 'rajesh.k@example.com',
    campaignId: 'camp_avenue',
    notes: 'Interested in ground floor retail shop for investment',
  })

  assert.equal(leadCommercial.projectId, 'proj_avenue_commercial')
  assert.equal(leadCommercial.isDuplicate, false, 'Separate project enquiry must NOT be marked duplicate')
  assert.equal(leadCommercial.duplicateOfId, null)
  assert.equal(leadCommercial.classification, 'separate_customer_enquiry')
  assert.equal(leadCommercial.action, 'separate_enquiry_created')

  const rajeshLeads = db.leads.filter((l) => l.org_id === orgId && l.phone === '+919844011223')
  assert.equal(rajeshLeads.length, 2, 'Both legitimate project enquiries must exist')
  assert.equal(rajeshLeads[0].project_id, 'proj_promont_luxury')
  assert.equal(rajeshLeads[1].project_id, 'proj_avenue_commercial')

  console.log('✓ Test 8C Passed: Case C (Genuinely separate enquiries from same customer across different projects preserved)')
}

// ---------------------------------------------------------------------------
// TEST 9: Lead Updates Preserve Original Source Attribution
// ---------------------------------------------------------------------------
{
  const db = new MockDatabase()
  const orgId = 'org_oberoi'
  db.orgMembers = [{ org_id: orgId, profile_id: 'admin_oberoi', role: 'admin' }]

  const lead = db.processInbound(orgId, {
    provider: 'meta_ads',
    externalLeadId: 'fb_ad_lead_555444',
    name: 'Vikram Mehta',
    phone: '9833344455',
    campaignName: 'Sky City Tower 4 Launch',
    campaignId: 'camp_oberoi_4',
    adName: 'Penthouse View Video Ad',
    adId: 'ad_video_9',
    formName: 'Instant Callback Form',
    formId: 'form_cb_1',
    sourceUrl: 'https://oberoirealty.com/skycity',
  })

  const updateRes = db.updateLead(lead.leadId, orgId, {
    status: 'site_visit_scheduled',
    notes: 'Customer scheduled Sunday morning site visit at 11am',
  })
  assert.equal(updateRes.error, null)

  const updatedLead = db.leads.find((l) => l.id === lead.leadId)
  assert.equal(updatedLead.status, 'site_visit_scheduled')
  assert.equal(updatedLead.notes, 'Customer scheduled Sunday morning site visit at 11am')

  assert.equal(updatedLead.source_platform, 'meta_ads')
  assert.equal(updatedLead.campaign_name, 'Sky City Tower 4 Launch')
  assert.equal(updatedLead.campaign_id, 'camp_oberoi_4')
  assert.equal(updatedLead.ad_name, 'Penthouse View Video Ad')
  assert.equal(updatedLead.ad_id, 'ad_video_9')
  assert.equal(updatedLead.form_name, 'Instant Callback Form')
  assert.equal(updatedLead.form_id, 'form_cb_1')
  assert.equal(updatedLead.external_lead_id, 'fb_ad_lead_555444')
  assert.equal(updatedLead.source_url, 'https://oberoirealty.com/skycity')

  console.log('✓ Test 9 Passed: Operational status updates preserve original source attribution')
}

// ---------------------------------------------------------------------------
// TEST 10: Inbound Normalization & Plaintext Credential Rejection
// ---------------------------------------------------------------------------
{
  const db = new MockDatabase()
  const orgId = 'org_security_test'
  db.orgMembers = [{ org_id: orgId, profile_id: 'admin_sec', role: 'admin' }]

  assert.equal(normalizePhone('9876543210'), '+919876543210')
  assert.equal(normalizePhone('09876543210'), '+919876543210')
  assert.equal(normalizePhone('+91 98765 43210'), '+919876543210')
  assert.equal(normalizePhone('919876543210'), '+919876543210')
  assert.equal(normalizePhone('+1 (555) 234-5678'), '+15552345678')

  assert.equal(normalizeEmail('  John.DOE@Example.COM  '), 'john.doe@example.com')
  assert.equal(normalizeEmail(''), null)
  assert.equal(normalizeEmail(null), null)

  const fakeRawJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0.signature'
  const rejectedConn = db.createConnection(orgId, 'admin_sec', {
    provider: 'meta_ads',
    name: 'Insecure Connection',
    credential_ref: fakeRawJwt,
  })
  assert.match(rejectedConn.error, /Plaintext secret tokens are strictly forbidden/i)

  const validConn = db.createConnection(orgId, 'admin_sec', {
    provider: 'meta_ads',
    name: 'Secure Connection',
    credential_ref: 'vault://projects/real-estate-os/secrets/meta-token-v1',
  })
  assert.equal(validConn.error, null)

  const connsForClient = db.getConnectionsForOrg(orgId, 'admin_sec')
  assert.equal(connsForClient[0].credential_ref, 'CONFIGURED_SECURE_REFERENCE')

  console.log('✓ Test 10 Passed: E.164 normalization, Vault URI enforcement, and credential redaction')
}

// ---------------------------------------------------------------------------
// TEST 11: Channel Partner Project Access Scoping
// ---------------------------------------------------------------------------
{
  const db = new MockDatabase()
  db.organisations = [
    { id: 'org_dev', name: 'Puravankara Developers', type: 'developer' },
    { id: 'org_cp', name: 'Square Yards Brokerage', type: 'channel_partner' },
  ]
  db.orgMembers = [
    { org_id: 'org_dev', profile_id: 'dev_admin', role: 'admin' },
    { org_id: 'org_cp', profile_id: 'cp_admin', role: 'admin' },
  ]

  const devConn = db.createConnection('org_dev', 'dev_admin', {
    provider: 'property_portal_99acres',
    name: 'Puravankara 99acres Developer Feed',
  })
  assert.equal(devConn.error, null)

  const cpConns = db.getConnectionsForOrg('org_cp', 'cp_admin')
  assert.equal(cpConns.length, 0, 'Channel partner cannot see developer connections')

  const cpConn = db.createConnection('org_cp', 'cp_admin', {
    provider: 'meta_ads',
    name: 'Square Yards CP Ads',
  })
  assert.equal(cpConn.error, null)

  const cpConnsUpdated = db.getConnectionsForOrg('org_cp', 'cp_admin')
  assert.equal(cpConnsUpdated.length, 1)
  assert.equal(cpConnsUpdated[0].name, 'Square Yards CP Ads')

  const devConnsUpdated = db.getConnectionsForOrg('org_dev', 'dev_admin')
  assert.equal(devConnsUpdated.length, 1)
  assert.equal(devConnsUpdated[0].name, 'Puravankara 99acres Developer Feed')

  console.log('✓ Test 11 Passed: Channel partner accounts isolated from developer configurations')
}

// ---------------------------------------------------------------------------
// TEST 12: Lead-to-Project Organisation Integrity (Database Trigger check_lead_tenant_integrity)
// ---------------------------------------------------------------------------
{
  const db = new MockDatabase()
  db.organisations = [
    { id: 'org_omega', name: 'Omega Realty' },
    { id: 'org_theta', name: 'Theta Properties' },
  ]
  db.projects = [
    { id: 'proj_omega_tower', org_id: 'org_omega', name: 'Omega Tower' },
    { id: 'proj_theta_villas', org_id: 'org_theta', name: 'Theta Villas' },
  ]
  db.orgMembers = [
    { org_id: 'org_omega', profile_id: 'omega_admin', role: 'admin' },
  ]

  // Case 1: Valid lead created referencing project in same org
  const validLead = db.processInbound('org_omega', {
    provider: 'website_webhook',
    name: 'Valid Buyer',
    phone: '9900112233',
    projectId: 'proj_omega_tower',
  })
  assert.equal(validLead.success, true)
  assert.equal(validLead.projectId, 'proj_omega_tower')

  // Case 2: Unmapped lead created with null project_id (MUST BE ALLOWED)
  const unmappedLead = db.processInbound('org_omega', {
    provider: 'website_webhook',
    name: 'Unmapped Buyer',
    phone: '9900112234',
  })
  assert.equal(unmappedLead.success, true)
  assert.equal(unmappedLead.projectId, null)
  assert.equal(unmappedLead.routingStatus, 'unmapped')

  // Case 3: Attempting to assign lead from Org Omega to project belonging to Org Theta
  const crossTenantAttempt = db.processInbound('org_omega', {
    provider: 'website_webhook',
    name: 'Malicious Buyer',
    phone: '9900112235',
    projectId: 'proj_theta_villas', // Belongs to Theta, not Omega!
  })
  assert.equal(crossTenantAttempt.success, false)
  assert.match(crossTenantAttempt.errorMessage, /Lead project must belong to the same organisation/i)

  // Case 4: Lead update/reassignment attempting cross-tenant project linking
  const updateCrossAttempt = db.updateLead(validLead.leadId, 'org_omega', {
    project_id: 'proj_theta_villas', // Cross-tenant!
  })
  assert.match(updateCrossAttempt.error, /Cross-tenant project assignment rejected/i)

  console.log('✓ Test 12 Passed: Lead-to-project organisation integrity strictly enforced')
}

// ---------------------------------------------------------------------------
// TEST 13: Parent Organisation Ownership Immutability
// ---------------------------------------------------------------------------
{
  const db = new MockDatabase()
  db.organisations = [
    { id: 'org_primary', name: 'Primary Builders' },
    { id: 'org_hostile', name: 'Hostile Takeover' },
  ]
  db.projects = [{ id: 'proj_1', org_id: 'org_primary', name: 'Tower A' }]
  db.connections = [{ id: 'conn_1', org_id: 'org_primary', name: 'Meta Connection' }]
  db.leads = [{ id: 'lead_1', org_id: 'org_primary', name: 'Valued Client', phone: '+919988776655' }]

  // 1. Attempting to change project org_id
  const projUpdate = db.updateProject('proj_1', { org_id: 'org_hostile' })
  assert.match(projUpdate.error, /Project organisation ownership is immutable/i)
  assert.equal(db.projects[0].org_id, 'org_primary')

  // 2. Attempting to change connection org_id
  const connUpdate = db.updateConnection('conn_1', 'org_primary', { org_id: 'org_hostile' })
  assert.match(connUpdate.error, /Organisation ownership of an integration connection is immutable/i)
  assert.equal(db.connections[0].org_id, 'org_primary')

  // 3. Attempting to change lead org_id
  const leadUpdate = db.updateLead('lead_1', 'org_primary', { org_id: 'org_hostile' })
  assert.match(leadUpdate.error, /Lead organisation ownership is immutable/i)
  assert.equal(db.leads[0].org_id, 'org_primary')

  console.log('✓ Test 13 Passed: Organisation ownership immutability strictly enforced across projects, connections and leads')
}

// ---------------------------------------------------------------------------
// TEST 14: Concurrent Processing Review — Idempotency vs Unrelated 23505 DB Error
// ---------------------------------------------------------------------------
{
  const db = new MockDatabase()
  const orgId = 'org_race_test'
  db.orgMembers = [{ org_id: orgId, profile_id: 'admin_race', role: 'admin' }]

  // Pre-seed an existing lead
  const initialLead = db.processInbound(orgId, {
    provider: 'meta_ads',
    externalLeadId: 'ext_fb_lead_4455',
    name: 'Suresh Raina',
    phone: '9812345678',
  })
  assert.equal(initialLead.success, true)

  // Case 1: Genuine idempotency key conflict with exact constraint name (uq_leads_org_idempotency_key)
  const trueIdempotencyConflict = {
    code: '23505',
    message: 'duplicate key value violates unique constraint "uq_leads_org_idempotency_key"',
    details: 'Key (org_id, idempotency_key)=(...) already exists.',
  }
  const replayResult = db.processInbound(
    orgId,
    {
      provider: 'meta_ads',
      externalLeadId: 'ext_fb_lead_4455',
      name: 'Suresh Raina',
      phone: '9812345678',
    },
    trueIdempotencyConflict
  )
  assert.equal(replayResult.success, true)
  assert.equal(replayResult.action, 'idempotent_replay')
  assert.equal(replayResult.leadId, initialLead.leadId)

  // Case 2: Generic substring match without exact constraint name (must be rejected!)
  const genericSubstringError = {
    code: '23505',
    message: 'duplicate key value violates some generic table mentioning idempotency_key in comments',
    details: 'Some other column duplicate.',
  }
  const genericResult = db.processInbound(
    orgId,
    {
      provider: 'meta_ads',
      externalLeadId: 'ext_fb_new_8888',
      name: 'Generic Test',
      phone: '9812345679',
    },
    genericSubstringError
  )
  assert.equal(genericResult.success, false)
  assert.equal(genericResult.action, 'error')

  // Case 3: Exact external lead id conflict with connection verification
  const connId = 'conn_race_1'
  db.connections.push({ id: connId, org_id: orgId })
  const storedLead = db.leads.find((l) => l.id === initialLead.leadId)
  if (storedLead) storedLead.connection_id = connId

  const trueExtLeadConflict = {
    code: '23505',
    message: 'duplicate key value violates unique constraint "uq_leads_connection_external_lead_id"',
    details: 'Key (connection_id, external_lead_id)=(...) already exists.',
  }
  const extLeadReplay = db.processInbound(
    orgId,
    {
      connectionId: connId,
      provider: 'meta_ads',
      externalLeadId: 'ext_fb_lead_4455',
      name: 'Suresh Raina',
      phone: '9812345678',
    },
    trueExtLeadConflict
  )
  assert.equal(extLeadReplay.success, true)
  assert.equal(extLeadReplay.action, 'idempotent_replay')

  // Case 4: Connection mismatch on replay lookup (tampered / wrong connection)
  const extLeadMismatch = db.processInbound(
    orgId,
    {
      connectionId: 'conn_other_tampered',
      provider: 'meta_ads',
      externalLeadId: 'ext_fb_lead_4455',
      name: 'Suresh Raina',
      phone: '9812345678',
    },
    trueExtLeadConflict
  )
  assert.equal(extLeadMismatch.success, false)
  assert.equal(extLeadMismatch.action, 'error')
  assert.match(extLeadMismatch.errorMessage, /Conflict resolution mismatch/i)

  // Case 5: Unrelated 23505 unique constraint failure (e.g. inventory unit conflict)
  const unrelatedDbError = {
    code: '23505',
    message: 'duplicate key value violates unique constraint "idx_inventory_project_unit_ci"',
    details: 'Key (project_id, unit)=(101) already exists.',
  }
  const failureResult = db.processInbound(
    orgId,
    {
      provider: 'meta_ads',
      externalLeadId: 'ext_fb_new_9999',
      name: 'New Client',
      phone: '9812345679',
    },
    unrelatedDbError
  )
  assert.equal(failureResult.success, false)
  assert.equal(failureResult.action, 'error')
  assert.match(failureResult.errorMessage, /idx_inventory_project_unit_ci/i)

  console.log('✓ Test 14 Passed: Concurrent processing strictly discriminates exact constraints and verifies connection matching')
}

console.log('\n--- ALL 14 CRM INTEGRATION READINESS (STAGE 3G) TESTS PASSED ---\n')
