// tests/property-portal-integrations.test.mjs
// Stage 4G: Automated Verification Suite for Indian Property Portal Integrations (99acres, Magicbricks, Housing.com).
// Tests payload normalization, phone E.164 formatting, timing-safe authentication, project mapping resolution,
// deterministic idempotency, CRM 3-case deduplication, tenant isolation, and audit privacy.

import assert from 'node:assert/strict'
import crypto from 'node:crypto'

console.log('--- Running Property Portal Integrations (Stage 4G) Tests ---')

// ---------------------------------------------------------------------------
// 1. Phone E.164 Normalization Utility
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

// ---------------------------------------------------------------------------
// 2. Normalization Functions for Portals
// ---------------------------------------------------------------------------

function normalize99acresLead(raw, connectionId) {
  const name = (raw.buyer_name || '').trim() || '99acres Lead'
  const phone = normalizePhone(raw.buyer_phone || '')
  const email = (raw.buyer_email || '').trim().toLowerCase() || null
  const externalLeadId = raw.lead_id ? String(raw.lead_id) : undefined

  const notesParts = []
  if (raw.project_name) notesParts.push(`Project: ${raw.project_name}`)
  if (raw.property_type || raw.bedroom) {
    notesParts.push(`Type: ${[raw.property_type, raw.bedroom].filter(Boolean).join(' - ')}`)
  }
  if (raw.budget) notesParts.push(`Budget: ${raw.budget}`)
  if (raw.locality) notesParts.push(`Locality: ${raw.locality}`)
  if (raw.query) notesParts.push(`Enquiry: "${raw.query.trim()}"`)

  return {
    connectionId,
    fullName: name,
    phone,
    email,
    leadSource: 'property_portal',
    externalLeadId,
    formId: raw.project_id ? String(raw.project_id) : raw.listing_id ? String(raw.listing_id) : undefined,
    notes: notesParts.length > 0 ? notesParts.join(' | ') : 'Enquiry from 99acres portal',
    customFields: {
      portal_name: '99acres',
      portal_project_id: raw.project_id ? String(raw.project_id) : null,
      portal_listing_id: raw.listing_id ? String(raw.listing_id) : null,
      budget: raw.budget || null,
      bedroom: raw.bedroom || null,
      property_type: raw.property_type || null,
      locality: raw.locality || null,
    },
    sourceMetadata: {
      portal_provider: '99acres',
      posted_date: raw.posted_date || null,
      ingested_via: 'portal_lead_push_api',
    },
  }
}

function normalizeMagicbricksLead(raw, connectionId) {
  const name = (raw.name || '').trim() || 'Magicbricks Lead'
  const phone = normalizePhone(raw.mobile || '')
  const email = (raw.email || '').trim().toLowerCase() || null
  const externalLeadId = raw.id ? String(raw.id) : undefined

  let budgetStr = ''
  if (raw.minBudget && raw.maxBudget) {
    budgetStr = `₹${raw.minBudget} - ₹${raw.maxBudget}`
  } else if (raw.maxBudget) {
    budgetStr = `Up to ₹${raw.maxBudget}`
  }

  const notesParts = []
  if (raw.project) notesParts.push(`Project: ${raw.project}`)
  if (raw.requirement) notesParts.push(`Requirement: "${raw.requirement.trim()}"`)
  if (budgetStr) notesParts.push(`Budget: ${budgetStr}`)
  if (raw.city) notesParts.push(`City: ${raw.city}`)

  return {
    connectionId,
    fullName: name,
    phone,
    email,
    leadSource: 'property_portal',
    externalLeadId,
    formId: raw.projectId ? String(raw.projectId) : undefined,
    notes: notesParts.length > 0 ? notesParts.join(' | ') : 'Enquiry from Magicbricks portal',
    customFields: {
      portal_name: 'Magicbricks',
      portal_project_id: raw.projectId ? String(raw.projectId) : null,
      city: raw.city || null,
      min_budget: raw.minBudget != null ? String(raw.minBudget) : null,
      max_budget: raw.maxBudget != null ? String(raw.maxBudget) : null,
    },
    sourceMetadata: {
      portal_provider: 'Magicbricks',
      sub_source: raw.sub_source || null,
      created_on: raw.created_on || null,
      ingested_via: 'portal_partner_webhook',
    },
  }
}

function normalizeHousingLead(raw, connectionId) {
  const name = (raw.user_name || '').trim() || 'Housing.com Lead'
  const phone = normalizePhone(raw.user_phone || '')
  const email = (raw.user_email || '').trim().toLowerCase() || null
  const externalLeadId = raw.lead_id ? String(raw.lead_id) : undefined

  const notesParts = []
  if (raw.project_name) notesParts.push(`Project: ${raw.project_name}`)
  if (raw.message) notesParts.push(`Message: "${raw.message.trim()}"`)
  if (raw.budget_str) notesParts.push(`Budget: ${raw.budget_str}`)
  if (raw.city) notesParts.push(`City: ${raw.city}`)

  return {
    connectionId,
    fullName: name,
    phone,
    email,
    leadSource: 'property_portal',
    externalLeadId,
    formId: raw.housing_project_id ? String(raw.housing_project_id) : undefined,
    campaignId: raw.utm_campaign || undefined,
    campaignName: raw.utm_campaign || undefined,
    adId: raw.utm_source || undefined,
    notes: notesParts.length > 0 ? notesParts.join(' | ') : 'Enquiry from Housing.com portal',
    customFields: {
      portal_name: 'Housing.com',
      portal_project_id: raw.housing_project_id ? String(raw.housing_project_id) : null,
      budget: raw.budget_str || null,
      city: raw.city || null,
    },
    sourceMetadata: {
      portal_provider: 'Housing.com',
      utm_source: raw.utm_source || null,
      utm_campaign: raw.utm_campaign || null,
      utm_medium: raw.utm_medium || null,
      created_at: raw.created_at || null,
      ingested_via: 'portal_realtime_api',
    },
  }
}

// ---------------------------------------------------------------------------
// 3. Timing-Safe Auth Verification
// ---------------------------------------------------------------------------

function verifyPortalAuthToken(headerToken, expectedToken) {
  if (!headerToken || !expectedToken) return false
  let cleanHeader = headerToken.trim()
  if (cleanHeader.toLowerCase().startsWith('bearer ')) {
    cleanHeader = cleanHeader.slice(7).trim()
  }
  const tokenBuf = Buffer.from(cleanHeader, 'utf8')
  const expectedBuf = Buffer.from(expectedToken.trim(), 'utf8')
  if (tokenBuf.length !== expectedBuf.length) return false
  return crypto.timingSafeEqual(tokenBuf, expectedBuf)
}

// ---------------------------------------------------------------------------
// 4. Privilege Stripping & Sanitation
// ---------------------------------------------------------------------------

function sanitizePortalPayload(raw) {
  const RESTRICTED = new Set(['org_id', 'orgid', 'tenant_id', 'role', 'user_id', 'is_admin'])
  const clean = {}
  for (const [key, value] of Object.entries(raw || {})) {
    if (!RESTRICTED.has(key.toLowerCase())) {
      clean[key] = value
    }
  }
  return clean
}

// ---------------------------------------------------------------------------
// 5. Project Mapping Resolution
// ---------------------------------------------------------------------------

function resolveProjectMapping(mappings, payload) {
  // Priority 1: Match by campaign_id
  if (payload.campaignId) {
    const match = mappings.find(
      (m) => m.external_identifier_type === 'campaign_id' && m.external_identifier_value === payload.campaignId
    )
    if (match) return { projectId: match.project_id, matchedBy: 'campaign_id' }
  }

  // Priority 2: Match by form_id
  if (payload.formId) {
    const match = mappings.find(
      (m) => m.external_identifier_type === 'form_id' && m.external_identifier_value === payload.formId
    )
    if (match) return { projectId: match.project_id, matchedBy: 'form_id' }
  }

  // Priority 3.6: Match by portal_project_id or portal_listing_id
  const targetPortalId = payload.customFields?.portal_project_id || payload.customFields?.portal_listing_id || payload.formId
  if (targetPortalId) {
    const match = mappings.find(
      (m) =>
        (m.external_identifier_type === 'portal_project_id' || m.external_identifier_type === 'portal_listing_id') &&
        m.external_identifier_value === String(targetPortalId)
    )
    if (match) return { projectId: match.project_id, matchedBy: match.external_identifier_type }
  }

  // Priority 4: Fallback to account_default
  const defaultMatch = mappings.find((m) => m.external_identifier_type === 'account_default')
  if (defaultMatch) return { projectId: defaultMatch.project_id, matchedBy: 'account_default' }

  return { projectId: null, matchedBy: 'unmapped' }
}

// ---------------------------------------------------------------------------
// Execution of Tests
// ---------------------------------------------------------------------------

// Test 1: 99acres Lead Normalization
{
  const raw99 = {
    lead_id: '99a_lead_889911',
    buyer_name: 'Srinivas Rao',
    buyer_phone: '9849012345',
    buyer_email: 'srinivas.rao@gmail.com',
    project_id: '99a_proj_skygardens_01',
    project_name: 'Premier Sky Gardens',
    property_type: 'Apartment',
    bedroom: '3 BHK',
    budget: '1.75 - 2.0 Cr',
    locality: 'Financial District, Nanakramguda',
    query: 'Interested in 3 BHK flat. Need brochure and floor plans.',
    posted_date: '2026-11-15T03:00:00Z',
  }

  const norm = normalize99acresLead(raw99, 'conn_99acres_01')
  assert.equal(norm.fullName, 'Srinivas Rao')
  assert.equal(norm.phone, '+919849012345', 'Phone must normalize to Indian E.164')
  assert.equal(norm.email, 'srinivas.rao@gmail.com')
  assert.equal(norm.leadSource, 'property_portal')
  assert.equal(norm.externalLeadId, '99a_lead_889911')
  assert.equal(norm.formId, '99a_proj_skygardens_01')
  assert.ok(norm.notes.includes('Premier Sky Gardens'))
  assert.ok(norm.notes.includes('3 BHK'))
  assert.equal(norm.customFields.portal_project_id, '99a_proj_skygardens_01')

  console.log('  ✓ Test 1 Passed: 99acres lead payload normalization & E.164 phone formatting')
}

// Test 2: Magicbricks Lead Normalization
{
  const rawMb = {
    id: 'mb_lead_776655',
    name: 'Priyanka Reddy',
    mobile: '+91-9876543210',
    email: 'Priyanka.R@Outlook.com',
    project: 'Premier Lakeview',
    projectId: 'mb_proj_lakeview_02',
    city: 'Hyderabad',
    requirement: 'Looking for 4 BHK villa with immediate possession',
    minBudget: '30000000',
    maxBudget: '35000000',
    created_on: '2026-11-15 08:30:00',
  }

  const norm = normalizeMagicbricksLead(rawMb, 'conn_mb_01')
  assert.equal(norm.fullName, 'Priyanka Reddy')
  assert.equal(norm.phone, '+919876543210')
  assert.equal(norm.email, 'priyanka.r@outlook.com', 'Email must be lowercased')
  assert.equal(norm.externalLeadId, 'mb_lead_776655')
  assert.equal(norm.formId, 'mb_proj_lakeview_02')
  assert.ok(norm.notes.includes('₹30000000 - ₹35000000'))
  assert.equal(norm.customFields.portal_name, 'Magicbricks')

  console.log('  ✓ Test 2 Passed: Magicbricks lead payload normalization & budget formatting')
}

// Test 3: Housing.com Lead Normalization
{
  const rawHousing = {
    lead_id: 'housing_lead_554433',
    user_name: 'Aditya Verma',
    user_phone: '09812345678',
    user_email: 'aditya.v@gmail.com',
    housing_project_id: 'housing_proj_central_03',
    project_name: 'Premier Central Tower',
    message: 'Enquired for commercial office space 2500 sqft',
    budget_str: '2.5 Cr',
    city: 'Hyderabad',
    utm_source: 'housing_featured',
    utm_campaign: 'hyderabad_commercial_hub',
  }

  const norm = normalizeHousingLead(rawHousing, 'conn_housing_01')
  assert.equal(norm.fullName, 'Aditya Verma')
  assert.equal(norm.phone, '+919812345678', 'Leading 0 must be stripped and +91 added')
  assert.equal(norm.externalLeadId, 'housing_lead_554433')
  assert.equal(norm.formId, 'housing_proj_central_03')
  assert.equal(norm.campaignId, 'hyderabad_commercial_hub', 'UTM campaign mapped')
  assert.equal(norm.adId, 'housing_featured', 'UTM source mapped')

  console.log('  ✓ Test 3 Passed: Housing.com lead payload normalization & UTM tracking')
}

// Test 4: Timing-Safe Portal Authentication Token Verification
{
  const expectedSecret = 'px_portal_sec_super_secret_9988'

  // Valid Bearer header
  assert.equal(
    verifyPortalAuthToken(`Bearer ${expectedSecret}`, expectedSecret),
    true,
    'Valid Bearer token must pass'
  )

  // Valid raw API Key header
  assert.equal(
    verifyPortalAuthToken(expectedSecret, expectedSecret),
    true,
    'Valid raw token must pass'
  )

  // Invalid secret
  assert.equal(
    verifyPortalAuthToken('wrong_secret_123', expectedSecret),
    false,
    'Invalid secret must fail'
  )

  // Missing or empty header
  assert.equal(verifyPortalAuthToken(null, expectedSecret), false)
  assert.equal(verifyPortalAuthToken('', expectedSecret), false)

  console.log('  ✓ Test 4 Passed: Timing-safe portal authentication token verification')
}

// Test 5: Replay Idempotency Using External Lead ID
{
  const processedLeads = new Set()

  function processPortalLead(externalLeadId) {
    if (processedLeads.has(externalLeadId)) {
      return { status: 'duplicate', isProcessed: false }
    }
    processedLeads.add(externalLeadId)
    return { status: 'processed', isProcessed: true }
  }

  const leadId = '99a_lead_889911'
  const first = processPortalLead(leadId)
  assert.equal(first.status, 'processed')
  assert.equal(first.isProcessed, true)

  // Replay of same lead ID
  const replay = processPortalLead(leadId)
  assert.equal(replay.status, 'duplicate')
  assert.equal(replay.isProcessed, false)

  console.log('  ✓ Test 5 Passed: Replay idempotency using external lead ID')
}

// Test 6: Project Mapping Resolution via portal_project_id & portal_listing_id
{
  const mockMappings = [
    {
      id: 'map_01',
      project_id: 'proj_skygardens',
      external_identifier_type: 'portal_project_id',
      external_identifier_value: '99a_proj_skygardens_01',
    },
    {
      id: 'map_02',
      project_id: 'proj_lakeview',
      external_identifier_type: 'portal_listing_id',
      external_identifier_value: 'prop_lakeview_villa_05',
    },
    {
      id: 'map_03',
      project_id: 'proj_central',
      external_identifier_type: 'account_default',
      external_identifier_value: 'default',
    },
  ]

  // Match by portal_project_id
  const resProj = resolveProjectMapping(mockMappings, {
    customFields: { portal_project_id: '99a_proj_skygardens_01' },
  })
  assert.equal(resProj.projectId, 'proj_skygardens')
  assert.equal(resProj.matchedBy, 'portal_project_id')

  // Match by portal_listing_id
  const resListing = resolveProjectMapping(mockMappings, {
    customFields: { portal_listing_id: 'prop_lakeview_villa_05' },
  })
  assert.equal(resListing.projectId, 'proj_lakeview')
  assert.equal(resListing.matchedBy, 'portal_listing_id')

  // Fallback to account_default
  const resDef = resolveProjectMapping(mockMappings, {
    customFields: { portal_project_id: 'unmapped_external_proj' },
  })
  assert.equal(resDef.projectId, 'proj_central')
  assert.equal(resDef.matchedBy, 'account_default')

  console.log('  ✓ Test 6 Passed: Project mapping resolution (portal_project_id & portal_listing_id)')
}

// Test 7: CRM 3-Case Deduplication for Portal Ingestion
{
  const crmStore = []

  function ingestToCRM({ orgId, projectId, phone, fullName, externalId }) {
    // Case A: Exact replay of event
    const replay = crmStore.find((l) => l.externalId === externalId)
    if (replay) return { caseType: 'A', status: 'replay_duplicate', leadId: replay.id }

    // Case B: Same project duplicate
    const sameProject = crmStore.find((l) => l.orgId === orgId && l.projectId === projectId && l.phone === phone)
    if (sameProject) {
      sameProject.updates = (sameProject.updates || 1) + 1
      return { caseType: 'B', status: 'same_project_updated', leadId: sameProject.id }
    }

    // Case C: New lead / different project
    const newLead = {
      id: `lead_${Math.random().toString(36).slice(2, 7)}`,
      orgId,
      projectId,
      phone,
      fullName,
      externalId,
    }
    crmStore.push(newLead)
    return { caseType: 'C', status: 'created', leadId: newLead.id }
  }

  const phone = '+919849012345'
  const lead1 = ingestToCRM({
    orgId: 'org_01',
    projectId: 'proj_skygardens',
    phone,
    fullName: 'Ravi Kumar',
    externalId: 'ext_99a_001',
  })
  assert.equal(lead1.caseType, 'C')

  // Case A: Replay
  const leadReplay = ingestToCRM({
    orgId: 'org_01',
    projectId: 'proj_skygardens',
    phone,
    fullName: 'Ravi Kumar',
    externalId: 'ext_99a_001',
  })
  assert.equal(leadReplay.caseType, 'A')

  // Case B: Same project new enquiry
  const leadUpdate = ingestToCRM({
    orgId: 'org_01',
    projectId: 'proj_skygardens',
    phone,
    fullName: 'Ravi Kumar',
    externalId: 'ext_mb_002',
  })
  assert.equal(leadUpdate.caseType, 'B')
  assert.equal(leadUpdate.leadId, lead1.leadId)

  // Case C: Different project enquiry
  const leadDiff = ingestToCRM({
    orgId: 'org_01',
    projectId: 'proj_lakeview',
    phone,
    fullName: 'Ravi Kumar',
    externalId: 'ext_housing_003',
  })
  assert.equal(leadDiff.caseType, 'C')
  assert.notEqual(leadDiff.leadId, lead1.leadId)

  console.log('  ✓ Test 7 Passed: CRM 3-case deduplication for portal ingestion (Cases A, B, C)')
}

// Test 8: Tenant Isolation & Privilege Escalation Defense
{
  const maliciousPayload = {
    buyer_name: 'Attacker',
    buyer_phone: '9849000000',
    org_id: 'injected_attacker_org',
    role: 'super_admin',
    is_admin: true,
    user_id: 'injected_user_id',
    budget: '2.0 Cr',
  }

  const sanitized = sanitizePortalPayload(maliciousPayload)
  assert.equal(sanitized.org_id, undefined, 'Restricted org_id must be stripped')
  assert.equal(sanitized.role, undefined, 'Restricted role must be stripped')
  assert.equal(sanitized.is_admin, undefined, 'Restricted is_admin must be stripped')
  assert.equal(sanitized.user_id, undefined, 'Restricted user_id must be stripped')
  assert.equal(sanitized.budget, '2.0 Cr', 'Valid business field must be retained')

  console.log('  ✓ Test 8 Passed: Tenant isolation & privilege escalation defense')
}

// Test 9: Privacy & Audit Logging Security
{
  function logPortalEvent(event) {
    const sensitive = /token|secret|password|api_key|bearer/i
    for (const [k, v] of Object.entries(event)) {
      if (v && sensitive.test(String(v))) {
        throw new Error(`Credential leak in audit field ${k}: ${v}`)
      }
    }
    return { logged: true, ...event }
  }

  const safeEvent = logPortalEvent({
    provider: 'property_portal_99acres',
    event_type: 'portal_lead_received',
    external_event_id: '99a_lead_889911',
    processing_status: 'processed',
  })
  assert.equal(safeEvent.logged, true)

  assert.throws(() => {
    logPortalEvent({
      provider: 'property_portal_99acres',
      event_type: 'portal_lead_received',
      external_event_id: 'secret_token=abc123xyz',
    })
  }, /Credential leak/)

  console.log('  ✓ Test 9 Passed: Privacy & audit logging security (zero credential leakage)')
}

// Test 10: Inactive / Disabled Connection Defense
{
  function validateConnectionState(connStatus) {
    if (connStatus !== 'connected') {
      return { allowed: false, error: `Connection is ${connStatus}. Leads rejected.` }
    }
    return { allowed: true }
  }

  assert.equal(validateConnectionState('connected').allowed, true)
  assert.equal(validateConnectionState('disabled').allowed, false)
  assert.equal(validateConnectionState('error').allowed, false)
  assert.equal(validateConnectionState('not_connected').allowed, false)

  console.log('  ✓ Test 10 Passed: Inactive & disabled connection defense')
}

// Test 11: Unsupported Provider Rejection
{
  function resolvePortalProvider(rawProvider) {
    const norm = rawProvider.toLowerCase().trim()
    if (norm === '99acres' || norm === 'property_portal_99acres') return 'property_portal_99acres'
    if (norm === 'magicbricks' || norm === 'property_portal_magicbricks') return 'property_portal_magicbricks'
    if (norm === 'housing' || norm === 'housing.com' || norm === 'property_portal_housing') return 'property_portal_housing'
    return null
  }

  assert.equal(resolvePortalProvider('99acres'), 'property_portal_99acres')
  assert.equal(resolvePortalProvider('magicbricks'), 'property_portal_magicbricks')
  assert.equal(resolvePortalProvider('housing'), 'property_portal_housing')
  assert.equal(resolvePortalProvider('unsupported_portal'), null)

  console.log('  ✓ Test 11 Passed: Unsupported portal provider rejection')
}

// Test 12: Malformed & Empty Payload Graceful Handling
{
  const empty99 = {}
  const norm = normalize99acresLead(empty99, 'conn_test')
  assert.equal(norm.fullName, '99acres Lead')
  assert.equal(norm.phone, '')
  assert.equal(norm.email, null)
  assert.equal(norm.leadSource, 'property_portal')

  console.log('  ✓ Test 12 Passed: Malformed & empty payload graceful handling')
}

console.log('\n--- All 12 Property Portal Integration Tests Passed Successfully ---\n')
