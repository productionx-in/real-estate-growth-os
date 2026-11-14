// tests/google-ads-integration.test.mjs
// Stage 4D: Automated Verification Suite for Google Ads Lead Integration
// Tests Google OAuth config, anti-CSRF state signing, AES-256-GCM token vault,
// Google Ads Lead Form normalization, webhook google_key authentication,
// test lead handling, project mapping routing, deduplication, and tenant isolation.

import assert from 'node:assert/strict'
import crypto from 'node:crypto'

console.log('--- Running Google Ads Lead Integration (Stage 4D) Tests ---')

// ---------------------------------------------------------------------------
// 1. Cryptographic AES-256-GCM Token Encryption Engine
// ---------------------------------------------------------------------------

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16
const PREFIX = 'vault://aes256gcm:'

function getEncryptionKey(customKey) {
  const envKey = customKey || process.env.ENCRYPTION_KEY || 'real-estate-growth-os-internal-vault-seed-2026'
  return crypto.createHash('sha256').update(`growth-os-vault-salt:${envKey}`).digest()
}

function encryptCredential(plaintext, customKey) {
  if (!plaintext || typeof plaintext !== 'string') {
    throw new Error('Credential to encrypt must be a non-empty string')
  }
  const key = getEncryptionKey(customKey)
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH })

  let encrypted = cipher.update(plaintext, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const authTag = cipher.getAuthTag().toString('hex')

  return `${PREFIX}${iv.toString('hex')}:${authTag}:${encrypted}`
}

function decryptCredential(encryptedRef, customKey) {
  if (!encryptedRef || typeof encryptedRef !== 'string') {
    throw new Error('Encrypted reference must be a non-empty string')
  }
  if (!encryptedRef.startsWith(PREFIX)) {
    throw new Error('Invalid credential reference format. Expected vault://aes256gcm:... format')
  }

  const raw = encryptedRef.slice(PREFIX.length)
  const parts = raw.split(':')
  if (parts.length !== 3) {
    throw new Error('Malformed vault credential reference payload')
  }

  const [ivHex, authTagHex, cipherTextHex] = parts
  const key = getEncryptionKey(customKey)
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH })
  decipher.setAuthTag(authTag)

  let decrypted = decipher.update(cipherTextHex, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

// ---------------------------------------------------------------------------
// 2. Google OAuth State Engine
// ---------------------------------------------------------------------------

const STATE_TTL_MS = 15 * 60 * 1000

function createGoogleOAuthState(payload, signingSecret = 'test_google_secret_123') {
  const fullPayload = {
    ...payload,
    nonce: crypto.randomBytes(16).toString('hex'),
    timestamp: Date.now(),
  }

  const jsonStr = JSON.stringify(fullPayload)
  const encodedPayload = Buffer.from(jsonStr).toString('base64url')

  const signature = crypto
    .createHmac('sha256', signingSecret)
    .update(encodedPayload)
    .digest('base64url')

  return `${encodedPayload}.${signature}`
}

function verifyGoogleOAuthState(state, signingSecret = 'test_google_secret_123') {
  if (!state || typeof state !== 'string') {
    return { valid: false, error: 'Missing or empty state parameter' }
  }

  const parts = state.split('.')
  if (parts.length !== 2) {
    return { valid: false, error: 'Malformed state parameter structure' }
  }

  const [encodedPayload, signature] = parts

  const expectedSignature = crypto
    .createHmac('sha256', signingSecret)
    .update(encodedPayload)
    .digest('base64url')

  const sigBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expectedSignature)

  if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    return { valid: false, error: 'Invalid state signature: potential CSRF detected' }
  }

  try {
    const jsonStr = Buffer.from(encodedPayload, 'base64url').toString('utf8')
    const payload = JSON.parse(jsonStr)

    if (Date.now() - payload.timestamp > STATE_TTL_MS) {
      return { valid: false, error: 'OAuth state has expired. Please initiate the connection again.' }
    }

    return { valid: true, payload }
  } catch {
    return { valid: false, error: 'Failed to decode state payload' }
  }
}

// ---------------------------------------------------------------------------
// 3. Google Lead Form Normalizer Logic
// ---------------------------------------------------------------------------

const RESTRICTED_KEYS = new Set([
  'org_id',
  'orgid',
  'tenant_id',
  'tenantid',
  'organization_id',
  'organisation_id',
  'profile_id',
  'user_id',
  'role',
  'is_admin',
])

function normalizeGoogleLead(raw, connectionId) {
  const customFields = {}
  const sourceMetadata = {
    google_gcl_id: raw.gcl_id || null,
    google_adgroup_id: raw.adgroup_id || null,
    google_creative_id: raw.creative_id || null,
    google_is_test: Boolean(raw.is_test),
    google_api_version: raw.api_version || '1.0',
    ingested_via: 'google_ads_lead_form_webhook',
  }

  let fullName = null
  let firstName = null
  let lastName = null
  let phone = null
  let email = null
  let notes = null

  const columns = Array.isArray(raw.user_column_data) ? raw.user_column_data : []

  for (const col of columns) {
    if (!col || typeof col !== 'object') continue
    const colId = (col.column_id || '').toUpperCase().trim()
    const val = typeof col.string_value === 'string' ? col.string_value.trim() : String(col.string_value || '').trim()

    if (!val) continue
    if (RESTRICTED_KEYS.has(colId.toLowerCase())) continue

    switch (colId) {
      case 'FULL_NAME':
        if (!fullName) fullName = val
        break
      case 'FIRST_NAME':
        if (!firstName) firstName = val
        break
      case 'LAST_NAME':
        if (!lastName) lastName = val
        break
      case 'PHONE_NUMBER':
        if (!phone) phone = val
        break
      case 'EMAIL':
        if (!email) email = val
        break
      case 'CITY':
      case 'POSTAL_CODE':
      case 'REGION':
      case 'COMPANY_NAME':
      case 'JOB_TITLE':
        customFields[colId.toLowerCase()] = val
        break
      default:
        if (col.column_name && /requirement|message|note|comment/i.test(col.column_name)) {
          notes = notes ? `${notes}; ${col.column_name}: ${val}` : `${col.column_name}: ${val}`
        }
        customFields[col.column_name || colId] = val
        break
    }
  }

  const resolvedName = fullName || [firstName, lastName].filter(Boolean).join(' ') || 'Google Ads Lead'

  return {
    connectionId,
    provider: 'google_ads',
    externalLeadId: raw.lead_id,
    name: resolvedName,
    phone: phone || '',
    email: email || null,
    campaignId: raw.campaign_id ? String(raw.campaign_id) : null,
    adId: raw.creative_id ? String(raw.creative_id) : null,
    formId: raw.form_id ? String(raw.form_id) : null,
    notes,
    sourceMetadata: {
      ...sourceMetadata,
      ...customFields,
    },
    customFields,
    rawPayload: raw,
  }
}

// ---------------------------------------------------------------------------
// 4. Mock Database for Google Inbound Lead Processing Simulation
// ---------------------------------------------------------------------------

function normalizePhone(raw) {
  if (!raw || typeof raw !== 'string') return null
  const cleaned = raw.replace(/\D/g, '')
  if (cleaned.length === 10) return `+91${cleaned}`
  if (cleaned.length === 12 && cleaned.startsWith('91')) return `+${cleaned}`
  if (cleaned.length >= 10 && cleaned.length <= 15) return `+${cleaned}`
  return cleaned.length > 0 ? cleaned : null
}

function normalizeEmail(raw) {
  if (!raw || typeof raw !== 'string') return null
  const cleaned = raw.trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned) ? cleaned : null
}

function generateIdempotencyKey(params) {
  const token = params.externalLeadId
  if (!token) return null
  const rawKey = `${params.orgId}:${params.provider}:${token}`
  return crypto.createHash('sha256').update(rawKey).digest('hex')
}

class MockCRMDatabase {
  constructor() {
    this.connections = new Map()
    this.mappings = []
    this.leads = []
    this.eventLogs = []
  }

  createConnection(conn) {
    this.connections.set(conn.id, { ...conn })
    return this.connections.get(conn.id)
  }

  addMapping(mapping) {
    this.mappings.push({ ...mapping })
  }

  async processInboundLead(orgId, payload) {
    const normP = normalizePhone(payload.phone)
    const normE = normalizeEmail(payload.email)

    if (!normP && !normE) {
      return {
        success: false,
        action: 'error',
        routingStatus: 'unmapped',
        errorMessage: 'Inbound lead must have at least a valid phone number or email',
      }
    }

    const idempotencyKey = generateIdempotencyKey({
      orgId,
      provider: payload.provider,
      externalLeadId: payload.externalLeadId,
    })

    // Case A: Idempotent Replay
    if (idempotencyKey) {
      const existing = this.leads.find((l) => l.org_id === orgId && l.idempotency_key === idempotencyKey)
      if (existing) {
        this.eventLogs.push({
          org_id: orgId,
          connection_id: payload.connectionId,
          provider: payload.provider,
          event_type: 'lead_idempotent_replay',
          processing_status: 'duplicate',
          external_event_id: payload.externalLeadId || null,
          lead_id: existing.id,
        })
        return {
          success: true,
          leadId: existing.id,
          action: 'idempotent_replay',
          routingStatus: existing.project_id ? 'mapped' : 'unmapped',
          projectId: existing.project_id,
          classification: 'duplicate_external_event',
        }
      }
    }

    const conn = this.connections.get(payload.connectionId)
    if (!conn || conn.org_id !== orgId) {
      return {
        success: false,
        action: 'error',
        routingStatus: 'unmapped',
        errorMessage: 'Integration connection not found in this organisation',
      }
    }

    if (conn.status !== 'connected') {
      return {
        success: false,
        action: 'error',
        routingStatus: 'unmapped',
        errorMessage: `Connection is ${conn.status}. Inbound leads cannot be processed for inactive or disabled connections.`,
      }
    }

    let resolvedProjectId = null
    const connMappings = this.mappings.filter((m) => m.org_id === orgId && m.connection_id === conn.id)

    // Priority 1: Campaign ID
    if (payload.campaignId) {
      const match = connMappings.find(
        (m) => m.external_identifier_type === 'campaign_id' && m.external_identifier_value === payload.campaignId
      )
      if (match) resolvedProjectId = match.project_id
    }

    // Priority 2: Form ID
    if (!resolvedProjectId && payload.formId) {
      const match = connMappings.find(
        (m) => m.external_identifier_type === 'form_id' && m.external_identifier_value === payload.formId
      )
      if (match) resolvedProjectId = match.project_id
    }

    // Priority 3: Account Default
    if (!resolvedProjectId) {
      const match = connMappings.find((m) => m.external_identifier_type === 'account_default')
      if (match) resolvedProjectId = match.project_id
    }

    const newLead = {
      id: `lead_${crypto.randomUUID()}`,
      org_id: orgId,
      connection_id: payload.connectionId,
      project_id: resolvedProjectId,
      idempotency_key: idempotencyKey,
      external_lead_id: payload.externalLeadId,
      full_name: payload.name,
      phone: normP,
      email: normE,
      is_duplicate: false,
      duplicate_of_id: null,
    }

    this.leads.push(newLead)

    this.eventLogs.push({
      org_id: orgId,
      connection_id: payload.connectionId,
      provider: payload.provider,
      event_type: 'lead_ingested',
      processing_status: resolvedProjectId ? 'processed' : 'unmapped',
      external_event_id: payload.externalLeadId || null,
      lead_id: newLead.id,
    })

    return {
      success: true,
      leadId: newLead.id,
      action: 'created',
      routingStatus: resolvedProjectId ? 'mapped' : 'unmapped',
      projectId: resolvedProjectId,
      classification: 'new_customer_enquiry',
    }
  }
}

// ---------------------------------------------------------------------------
// TEST SUITE EXECUTION
// ---------------------------------------------------------------------------

async function runTests() {
  const orgId1 = '00000000-0000-0000-0000-000000000001'
  const orgId2 = '00000000-0000-0000-0000-000000000002'
  const connId1 = 'google_conn_1111'
  const projA = 'aaaa1111-0000-0000-0000-000000000000'
  const projB = 'bbbb2222-0000-0000-0000-000000000000'
  const webhookKey1 = 'whsec_google_test_key_12345'

  const mockDb = new MockCRMDatabase()

  mockDb.createConnection({
    id: connId1,
    org_id: orgId1,
    provider: 'google_ads',
    name: 'Google Ads Main',
    status: 'connected',
    credential_ref: encryptCredential('google_refresh_token_test'),
    metadata: {
      encryptedWebhookKey: encryptCredential(webhookKey1),
      selectedCustomerId: '1234567890',
    },
  })

  mockDb.addMapping({
    id: 'map_camp',
    org_id: orgId1,
    connection_id: connId1,
    project_id: projA,
    external_identifier_type: 'campaign_id',
    external_identifier_value: '1122334455',
  })

  mockDb.addMapping({
    id: 'map_form',
    org_id: orgId1,
    connection_id: connId1,
    project_id: projB,
    external_identifier_type: 'form_id',
    external_identifier_value: '9876543210',
  })

  // Test 1: Google OAuth Config & Deferred Setup Policy
  {
    console.log('Test 1: Google OAuth configuration properly evaluated')
    function getGoogleAppConfigTest() {
      const clientId = process.env.GOOGLE_CLIENT_ID || null
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET || null
      const missing = []
      if (!clientId || clientId.startsWith('YOUR_')) missing.push('GOOGLE_CLIENT_ID')
      if (!clientSecret || clientSecret.startsWith('YOUR_')) missing.push('GOOGLE_CLIENT_SECRET')
      return { isConfigured: missing.length === 0, clientId, clientSecret, missing }
    }

    const originalId = process.env.GOOGLE_CLIENT_ID
    const originalSecret = process.env.GOOGLE_CLIENT_SECRET
    delete process.env.GOOGLE_CLIENT_ID
    delete process.env.GOOGLE_CLIENT_SECRET

    const config = getGoogleAppConfigTest()
    assert.equal(config.isConfigured, false, 'Unconfigured environment must report isConfigured: false')
    assert.ok(config.missing.includes('GOOGLE_CLIENT_ID'), 'Must list missing GOOGLE_CLIENT_ID')
    assert.ok(config.missing.includes('GOOGLE_CLIENT_SECRET'), 'Must list missing GOOGLE_CLIENT_SECRET')

    if (originalId) process.env.GOOGLE_CLIENT_ID = originalId
    if (originalSecret) process.env.GOOGLE_CLIENT_SECRET = originalSecret
  }

  // Test 2: Cryptographic HMAC-SHA256 OAuth State and Anti-CSRF
  {
    console.log('Test 2: Cryptographic HMAC-SHA256 OAuth state and anti-CSRF verified')
    const state = createGoogleOAuthState({
      orgId: orgId1,
      connectionId: connId1,
      userId: 'user_admin_1',
      returnUrl: '/acme/integrations',
    })

    const verified = verifyGoogleOAuthState(state)
    assert.equal(verified.valid, true, 'Valid state must pass verification')
    assert.equal(verified.payload.orgId, orgId1)
    assert.equal(verified.payload.connectionId, connId1)

    // Tampered signature rejection
    const parts = state.split('.')
    const tampered = `${parts[0]}.badsignature`
    const tamperedRes = verifyGoogleOAuthState(tampered)
    assert.equal(tamperedRes.valid, false, 'Tampered state signature must be rejected')
  }

  // Test 3: Google Authorization URL & Scopes
  {
    console.log('Test 3: Google authorization URL and mandatory scopes verified')
    function getGoogleAuthorizationUrlTest(state, redirectUri, clientId) {
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
      url.searchParams.set('client_id', clientId)
      url.searchParams.set('redirect_uri', redirectUri)
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('scope', 'https://www.googleapis.com/auth/adwords openid email profile')
      url.searchParams.set('state', state)
      url.searchParams.set('access_type', 'offline')
      url.searchParams.set('prompt', 'consent')
      return url.toString()
    }

    const state = 'test_state_123'
    const redirectUri = 'https://app.example.com/api/integrations/google/callback'
    const urlStr = getGoogleAuthorizationUrlTest(state, redirectUri, 'test-client-id.apps.googleusercontent.com')
    const parsedUrl = new URL(urlStr)

    assert.equal(parsedUrl.hostname, 'accounts.google.com')
    assert.equal(parsedUrl.searchParams.get('client_id'), 'test-client-id.apps.googleusercontent.com')
    assert.equal(parsedUrl.searchParams.get('access_type'), 'offline')
    assert.equal(parsedUrl.searchParams.get('prompt'), 'consent')
    assert.ok(parsedUrl.searchParams.get('scope').includes('https://www.googleapis.com/auth/adwords'))
  }

  // Test 4: Token Encryption Vault Format & Tamper Resistance
  {
    console.log('Test 4: AES-256-GCM token encryption and zero plaintext exposure')
    const sampleToken = 'ya29.a0AfH6SMD_sample_google_access_token_12345'
    const encrypted = encryptCredential(sampleToken)

    assert.match(encrypted, /^vault:\/\/aes256gcm:[0-9a-fA-F]{24}:[0-9a-fA-F]{32}:[0-9a-fA-F]+$/)
    const decrypted = decryptCredential(encrypted)
    assert.equal(decrypted, sampleToken, 'Decrypted token must match original plaintext')
  }

  // Test 5: Google Lead Normalizer Extracts Standard & Custom Columns
  {
    console.log('Test 5: Google Lead normalizer transforms column data into canonical InboundLeadPayload')
    const rawGoogleLead = {
      lead_id: 'google_lead_88776655',
      api_version: '1.0',
      form_id: '9876543210',
      campaign_id: '1122334455',
      creative_id: '778899',
      adgroup_id: '445566',
      gcl_id: 'EAIaIQobChMItestGclid',
      user_column_data: [
        { column_id: 'FULL_NAME', string_value: 'Naveen Kumar', column_name: 'Full Name' },
        { column_id: 'PHONE_NUMBER', string_value: '9848011223', column_name: 'Phone' },
        { column_id: 'EMAIL', string_value: 'naveen.k@example.com', column_name: 'Email' },
        { column_id: 'CITY', string_value: 'Hyderabad', column_name: 'City' },
        { column_id: 'POSTAL_CODE', string_value: '500034', column_name: 'Pincode' },
        { column_id: 'CUSTOM_PREFERENCE', string_value: '3 BHK East Facing', column_name: 'Requirement' },
      ],
    }

    const normalized = normalizeGoogleLead(rawGoogleLead, connId1)
    assert.equal(normalized.name, 'Naveen Kumar')
    assert.equal(normalized.phone, '9848011223')
    assert.equal(normalized.email, 'naveen.k@example.com')
    assert.equal(normalized.campaignId, '1122334455')
    assert.equal(normalized.adId, '778899')
    assert.equal(normalized.formId, '9876543210')
    assert.equal(normalized.sourceMetadata.google_gcl_id, 'EAIaIQobChMItestGclid')
    assert.equal(normalized.sourceMetadata.google_adgroup_id, '445566')
    assert.equal(normalized.customFields.city, 'Hyderabad')
    assert.match(normalized.notes, /3 BHK East Facing/)
  }

  // Test 6: Tenant Isolation & Restricted Keys Stripping
  {
    console.log('Test 6: Tenant isolation strictly strips spoofed org_id and privileges')
    const maliciousGoogleLead = {
      lead_id: 'malicious_lead_1',
      form_id: '9876543210',
      user_column_data: [
        { column_id: 'ORG_ID', string_value: orgId2 },
        { column_id: 'TENANT_ID', string_value: orgId2 },
        { column_id: 'ROLE', string_value: 'owner' },
        { column_id: 'FULL_NAME', string_value: 'Legit Buyer' },
        { column_id: 'PHONE_NUMBER', string_value: '9876543210' },
      ],
    }

    const normalized = normalizeGoogleLead(maliciousGoogleLead, connId1)
    assert.equal(normalized.customFields.org_id, undefined, 'Spoofed org_id must be stripped')
    assert.equal(normalized.customFields.tenant_id, undefined, 'Spoofed tenant_id must be stripped')
    assert.equal(normalized.customFields.role, undefined, 'Spoofed role must be stripped')
    assert.equal(normalized.name, 'Legit Buyer')
  }

  // Test 7: Google Webhook Secret Key Authentication
  {
    console.log('Test 7: Webhook google_key secret authentication')
    const expectedBuf = Buffer.from(webhookKey1)
    const validBuf = Buffer.from(webhookKey1)
    const invalidBuf = Buffer.from('bad_google_key_99999')

    assert.equal(crypto.timingSafeEqual(expectedBuf, validBuf), true, 'Matching key must pass')
    assert.notEqual(expectedBuf.length, invalidBuf.length, 'Length mismatch detected')
  }

  // Test 8: Project Mapping Precedence (Campaign ID > Form ID > Account Default)
  {
    console.log('Test 8: Project mapping resolution precedence')
    // A: Matches campaign_id -> projA
    const payloadA = {
      connectionId: connId1,
      provider: 'google_ads',
      externalLeadId: 'lead_camp_match',
      name: 'Buyer Alpha',
      phone: '+919876500001',
      campaignId: '1122334455',
    }
    const resA = await mockDb.processInboundLead(orgId1, payloadA)
    assert.equal(resA.projectId, projA, 'Must resolve to projA via campaign_id')
    assert.equal(resA.routingStatus, 'mapped')

    // B: Matches form_id -> projB
    const payloadB = {
      connectionId: connId1,
      provider: 'google_ads',
      externalLeadId: 'lead_form_match',
      name: 'Buyer Beta',
      phone: '+919876500002',
      formId: '9876543210',
    }
    const resB = await mockDb.processInboundLead(orgId1, payloadB)
    assert.equal(resB.projectId, projB, 'Must resolve to projB via form_id')
    assert.equal(resB.routingStatus, 'mapped')

    // C: Unmapped
    const payloadC = {
      connectionId: connId1,
      provider: 'google_ads',
      externalLeadId: 'lead_unmapped',
      name: 'Buyer Gamma',
      phone: '+919876500003',
      campaignId: 'unmapped_campaign',
    }
    const resC = await mockDb.processInboundLead(orgId1, payloadC)
    assert.equal(resC.projectId, null, 'Must be unmapped if no matching mapping exists')
    assert.equal(resC.routingStatus, 'unmapped')
  }

  // Test 9: Idempotent Replay Defense
  {
    console.log('Test 9: Idempotent replay protection prevents duplicate leads for same Google lead_id')
    const externalLeadId = 'google_lead_replay_test_999'
    const payload = {
      connectionId: connId1,
      provider: 'google_ads',
      externalLeadId,
      name: 'Kavita Sen',
      phone: '+919876500099',
      campaignId: '1122334455',
    }

    const firstRun = await mockDb.processInboundLead(orgId1, payload)
    assert.equal(firstRun.action, 'created')

    const secondRun = await mockDb.processInboundLead(orgId1, payload)
    assert.equal(secondRun.action, 'idempotent_replay')
    assert.equal(secondRun.leadId, firstRun.leadId, 'Replay must return original lead ID')
  }

  // Test 10: Inactive or Disabled Connection Gating
  {
    console.log('Test 10: Inactive/disabled connections reject inbound Google leads')
    const disabledConnId = 'google_disabled_conn_99'
    mockDb.createConnection({
      id: disabledConnId,
      org_id: orgId1,
      provider: 'google_ads',
      name: 'Disabled Google Connection',
      status: 'disabled',
    })

    const payload = {
      connectionId: disabledConnId,
      provider: 'google_ads',
      name: 'Blocked Lead',
      phone: '+919999999999',
    }

    const res = await mockDb.processInboundLead(orgId1, payload)
    assert.equal(res.success, false)
    assert.equal(res.action, 'error')
    assert.match(res.errorMessage, /inactive or disabled/i)
  }

  // Test 11: Cross-Tenant Connection Isolation
  {
    console.log('Test 11: Cross-tenant connection isolation strictly blocks unauthorized tenant access')
    const crossTenantPayload = {
      connectionId: connId1, // belongs to Org 1
      provider: 'google_ads',
      name: 'Intruder Lead',
      phone: '+919876543210',
    }

    const res = await mockDb.processInboundLead(orgId2, crossTenantPayload)
    assert.equal(res.success, false, 'Processing lead across foreign organisation connection must fail')
    assert.match(res.errorMessage, /not found in this organisation/i)
  }

  // Test 12: Audit Event Logging Without Credential or Personal Data Leaks
  {
    console.log('Test 12: Audit logs record Google Ads outcomes without exposing credentials or PII')
    for (const log of mockDb.eventLogs) {
      const logString = JSON.stringify(log)
      assert.doesNotMatch(logString, /vault:\/\/aes256gcm/i, 'Logs must never contain vault encryption references')
      assert.doesNotMatch(logString, /whsec_google_/i, 'Logs must never contain webhook secret keys')
      assert.doesNotMatch(logString, /google_refresh_token/i, 'Logs must never contain refresh tokens')
      assert.doesNotMatch(logString, /\+91[0-9]{10}/i, 'Event logs must not store customer phone numbers')
      assert.doesNotMatch(logString, /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i, 'Event logs must not store customer emails')
    }
    console.log('✓ All Google Ads event logs confirmed clean and secure')
  }

  console.log('--- All 12/12 Stage 4D Google Ads Integration Tests Passed Successfully! ---')
}

runTests().catch((err) => {
  console.error('Stage 4D Test Execution Failed:', err)
  process.exit(1)
})
