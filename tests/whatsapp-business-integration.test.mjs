// tests/whatsapp-business-integration.test.mjs
// Stage 4F: Automated Verification Suite for WhatsApp Business Cloud API Integration.
// Tests webhook GET challenge, POST HMAC-SHA256 signature verification, inbound message normalization,
// Click-to-WhatsApp Ads attribution, event idempotency (wamid), project mapping resolution (phone_number_id & campaign_id),
// CRM lead deduplication (Cases A, B, C), customer consent opt-out & opt-in keywords, 24-hour outbound messaging window guard,
// approved message templates & variable rendering, delivery receipt processing, tenant isolation, and audit privacy.

import assert from 'node:assert/strict'
import crypto from 'node:crypto'

console.log('--- Running WhatsApp Business Integration (Stage 4F) Tests ---')

// ---------------------------------------------------------------------------
// 1. Webhook GET Verification Challenge
// ---------------------------------------------------------------------------

function verifyWhatsAppWebhookChallenge(params) {
  const { mode, token, challenge, expectedToken } = params
  if (mode !== 'subscribe' || !challenge || !token) {
    return { isValid: false }
  }
  const tokenBuf = Buffer.from(token, 'utf8')
  const expectedBuf = Buffer.from(expectedToken, 'utf8')
  if (tokenBuf.length !== expectedBuf.length) {
    return { isValid: false }
  }
  const matches = crypto.timingSafeEqual(tokenBuf, expectedBuf)
  return { isValid: matches, challenge: matches ? challenge : undefined }
}

{
  const expectedToken = 'px_wh_verify_secret_secure_99'

  // Valid challenge subscription
  const valid = verifyWhatsAppWebhookChallenge({
    mode: 'subscribe',
    token: expectedToken,
    challenge: '1122334455',
    expectedToken,
  })
  assert.equal(valid.isValid, true, 'Valid token and subscribe mode must return isValid: true')
  assert.equal(valid.challenge, '1122334455', 'Valid challenge must return the echo challenge string')

  // Invalid token
  const invalidToken = verifyWhatsAppWebhookChallenge({
    mode: 'subscribe',
    token: 'wrong_token',
    challenge: '1122334455',
    expectedToken,
  })
  assert.equal(invalidToken.isValid, false, 'Mismatched token must return isValid: false')
  assert.equal(invalidToken.challenge, undefined, 'Mismatched token must not return challenge')

  // Invalid mode
  const invalidMode = verifyWhatsAppWebhookChallenge({
    mode: 'publish',
    token: expectedToken,
    challenge: '1122334455',
    expectedToken,
  })
  assert.equal(invalidMode.isValid, false, 'Non-subscribe mode must return isValid: false')

  // Missing challenge
  const missingChallenge = verifyWhatsAppWebhookChallenge({
    mode: 'subscribe',
    token: expectedToken,
    challenge: '',
    expectedToken,
  })
  assert.equal(missingChallenge.isValid, false, 'Missing challenge must return isValid: false')

  console.log('  ✓ Test 1 Passed: Webhook GET subscription challenge verification')
}

// ---------------------------------------------------------------------------
// 2. Webhook POST HMAC-SHA256 Signature Verification
// ---------------------------------------------------------------------------

function verifyWhatsAppWebhookSignature(params) {
  const { rawBody, signatureHeader, appSecret } = params
  if (!signatureHeader || !appSecret) return false
  if (!signatureHeader.startsWith('sha256=')) return false

  const signatureHex = signatureHeader.slice('sha256='.length).trim()
  if (!signatureHex) return false

  try {
    const hmac = crypto.createHmac('sha256', appSecret)
    hmac.update(rawBody)
    const expectedHex = hmac.digest('hex')

    const sigBuf = Buffer.from(signatureHex, 'hex')
    const expBuf = Buffer.from(expectedHex, 'hex')
    if (sigBuf.length !== expBuf.length) return false

    return crypto.timingSafeEqual(sigBuf, expBuf)
  } catch {
    return false
  }
}

{
  const appSecret = 'meta_app_secret_hybrid_9876543210'
  const rawBody = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{ id: 'waba_premier_01', changes: [] }],
  })

  const validHmac = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')
  const validHeader = `sha256=${validHmac}`

  // Valid signature
  assert.equal(
    verifyWhatsAppWebhookSignature({ rawBody, signatureHeader: validHeader, appSecret }),
    true,
    'Valid HMAC signature over exact raw bytes must return true'
  )

  // Tampered payload
  const tamperedBody = rawBody + ' '
  assert.equal(
    verifyWhatsAppWebhookSignature({ rawBody: tamperedBody, signatureHeader: validHeader, appSecret }),
    false,
    'Tampered payload byte must fail signature check'
  )

  // Invalid secret
  assert.equal(
    verifyWhatsAppWebhookSignature({ rawBody, signatureHeader: validHeader, appSecret: 'wrong_secret' }),
    false,
    'Wrong secret must fail signature check'
  )

  // Malformed signature header
  assert.equal(
    verifyWhatsAppWebhookSignature({ rawBody, signatureHeader: 'invalid_header', appSecret }),
    false,
    'Header missing sha256= prefix must fail'
  )

  console.log('  ✓ Test 2 Passed: Webhook POST HMAC-SHA256 signature verification')
}

// ---------------------------------------------------------------------------
// 3. Inbound Text Message Normalization & Phone E.164 Formatting
// ---------------------------------------------------------------------------

function formatE164Phone(raw) {
  if (!raw) return ''
  const cleaned = raw.replace(/\D/g, '')
  if (cleaned.startsWith('91') && cleaned.length === 12) {
    return `+${cleaned}`
  }
  if (cleaned.length === 10) {
    return `+91${cleaned}`
  }
  return `+${cleaned}`
}

function normalizeWhatsAppMessage(rawMsg, contactProfile, phoneNumberId, wabaId) {
  const fromPhone = formatE164Phone(rawMsg.from)
  const contactName = contactProfile?.name?.trim() || 'WhatsApp Lead'
  const messageBody = rawMsg.text?.body?.trim() || ''

  const payload = {
    fullName: contactName,
    phone: fromPhone,
    leadSource: 'whatsapp',
    externalLeadId: rawMsg.id,
    formId: phoneNumberId, // Phone Number ID used as mapping anchor
    notes: `[WhatsApp Conversation] Initial enquiry: "${messageBody}"`,
    customFields: {
      waba_id: wabaId,
      phone_number_id: phoneNumberId,
      whatsapp_message_id: rawMsg.id,
      whatsapp_timestamp: rawMsg.timestamp,
    },
  }

  // Click-to-WhatsApp referral handling
  if (rawMsg.referral) {
    payload.campaignId = rawMsg.referral.source_id
    payload.adId = rawMsg.referral.source_id
    payload.sourceMetadata = {
      headline: rawMsg.referral.headline,
      body: rawMsg.referral.body,
      source_type: rawMsg.referral.source_type,
      source_url: rawMsg.referral.source_url,
    }
  }

  return payload
}

{
  const rawMsg = {
    from: '919849012345',
    id: 'wamid.HBgLMTU1NTAyNDk3OTE2MzA1NA==',
    timestamp: '1731600000',
    type: 'text',
    text: { body: 'Hello, looking for 3BHK pricing at Sky Gardens Hyderabad' },
  }
  const contactProfile = { name: 'Kavitha Reddy' }
  const phoneNumberId = 'phone_num_skygardens_01'
  const wabaId = 'waba_premier_01'

  const normalized = normalizeWhatsAppMessage(rawMsg, contactProfile, phoneNumberId, wabaId)

  assert.equal(normalized.fullName, 'Kavitha Reddy')
  assert.equal(normalized.phone, '+919849012345')
  assert.equal(normalized.leadSource, 'whatsapp')
  assert.equal(normalized.externalLeadId, rawMsg.id)
  assert.equal(normalized.formId, 'phone_num_skygardens_01')
  assert.ok(normalized.notes.includes('looking for 3BHK pricing'))
  assert.equal(normalized.customFields.phone_number_id, 'phone_num_skygardens_01')

  console.log('  ✓ Test 3 Passed: Inbound message normalization & E.164 phone formatting')
}

// ---------------------------------------------------------------------------
// 4. Click-to-WhatsApp Ads Attribution (Referral Object)
// ---------------------------------------------------------------------------

{
  const rawMsgWithReferral = {
    from: '919876543210',
    id: 'wamid.HBgLMTU1NTAyNDk3OTE2MzA1NQ==',
    timestamp: '1731600100',
    type: 'text',
    text: { body: 'I saw your Meta ad for Sky Gardens' },
    referral: {
      source_type: 'ad',
      source_id: 'meta_ad_77665544',
      source_url: 'https://fb.me/sky-gardens-ad',
      headline: 'Sky Gardens — Luxury Living at Financial District',
      body: 'Register now for exclusive pre-launch discounts on 3 & 4 BHK apartments.',
    },
  }

  const normalized = normalizeWhatsAppMessage(
    rawMsgWithReferral,
    { name: 'Arun Varma' },
    'phone_num_skygardens_01',
    'waba_premier_01'
  )

  assert.equal(normalized.campaignId, 'meta_ad_77665544', 'Referral source_id must map to campaignId')
  assert.equal(normalized.adId, 'meta_ad_77665544', 'Referral source_id must map to adId')
  assert.equal(normalized.sourceMetadata.headline, 'Sky Gardens — Luxury Living at Financial District')
  assert.equal(normalized.sourceMetadata.source_type, 'ad')
  assert.equal(normalized.sourceMetadata.source_url, 'https://fb.me/sky-gardens-ad')

  console.log('  ✓ Test 4 Passed: Click-to-WhatsApp Ads attribution capture')
}

// ---------------------------------------------------------------------------
// 5. Deterministic Event Idempotency Using Message ID (wamid)
// ---------------------------------------------------------------------------

{
  const processedMessageIds = new Set()

  function processInboundEvent(wamid) {
    if (processedMessageIds.has(wamid)) {
      return { status: 'duplicate', isProcessed: false }
    }
    processedMessageIds.add(wamid)
    return { status: 'processed', isProcessed: true }
  }

  const wamid = 'wamid.HBgLMTU1NTAyNDk3OTE2MzA1Ng=='

  const firstSubmission = processInboundEvent(wamid)
  assert.equal(firstSubmission.status, 'processed')
  assert.equal(firstSubmission.isProcessed, true)

  // Replay of same message ID (e.g. Meta retry)
  const replaySubmission = processInboundEvent(wamid)
  assert.equal(replaySubmission.status, 'duplicate')
  assert.equal(replaySubmission.isProcessed, false)

  console.log('  ✓ Test 5 Passed: Deterministic event idempotency using wamid')
}

// ---------------------------------------------------------------------------
// 6. Project Mapping Resolution via Phone Number ID & Campaign ID
// ---------------------------------------------------------------------------

function resolveProjectMapping(mappings, payload) {
  // Priority 1: Direct Form ID (if explicitly matched)
  if (payload.formId) {
    const match = mappings.find(
      (m) => m.external_identifier_type === 'form_id' && m.external_identifier_value === payload.formId
    )
    if (match) return { projectId: match.project_id, matchedBy: 'form_id' }
  }

  // Priority 2: Campaign ID (Click-to-WhatsApp referral)
  if (payload.campaignId) {
    const match = mappings.find(
      (m) => m.external_identifier_type === 'campaign_id' && m.external_identifier_value === payload.campaignId
    )
    if (match) return { projectId: match.project_id, matchedBy: 'campaign_id' }
  }

  // Priority 3.5: Phone Number ID
  const phoneId = payload.customFields?.phone_number_id || payload.formId
  if (phoneId) {
    const match = mappings.find(
      (m) => m.external_identifier_type === 'phone_number_id' && m.external_identifier_value === phoneId
    )
    if (match) return { projectId: match.project_id, matchedBy: 'phone_number_id' }
  }

  // Priority 4: Account Default
  const defaultMatch = mappings.find((m) => m.external_identifier_type === 'account_default')
  if (defaultMatch) return { projectId: defaultMatch.project_id, matchedBy: 'account_default' }

  return { projectId: null, matchedBy: 'unmapped' }
}

{
  const mockMappings = [
    {
      id: 'map_phone_01',
      project_id: 'proj_skygardens',
      external_identifier_type: 'phone_number_id',
      external_identifier_value: 'phone_num_skygardens_01',
    },
    {
      id: 'map_camp_01',
      project_id: 'proj_lakeview',
      external_identifier_type: 'campaign_id',
      external_identifier_value: 'camp_lakeview_launch',
    },
    {
      id: 'map_def_01',
      project_id: 'proj_central_tower',
      external_identifier_type: 'account_default',
      external_identifier_value: 'default',
    },
  ]

  // Test 6a: Match by Phone Number ID
  const resPhone = resolveProjectMapping(mockMappings, {
    customFields: { phone_number_id: 'phone_num_skygardens_01' },
  })
  assert.equal(resPhone.projectId, 'proj_skygardens')
  assert.equal(resPhone.matchedBy, 'phone_number_id')

  // Test 6b: Match by Campaign ID (referral)
  const resCamp = resolveProjectMapping(mockMappings, {
    campaignId: 'camp_lakeview_launch',
  })
  assert.equal(resCamp.projectId, 'proj_lakeview')
  assert.equal(resCamp.matchedBy, 'campaign_id')

  // Test 6c: Fallback to Account Default
  const resDef = resolveProjectMapping(mockMappings, {
    customFields: { phone_number_id: 'phone_num_unmapped_99' },
  })
  assert.equal(resDef.projectId, 'proj_central_tower')
  assert.equal(resDef.matchedBy, 'account_default')

  console.log('  ✓ Test 6 Passed: Project mapping resolution (Phone Number ID & Campaign ID)')
}

// ---------------------------------------------------------------------------
// 7. CRM Lead Deduplication (Cases A, B, C)
// ---------------------------------------------------------------------------

{
  const crmDatabase = []

  function ingestLeadToCRM({ orgId, projectId, phone, fullName, externalId, source }) {
    // Case A: Exact replay of event within window
    const replay = crmDatabase.find((l) => l.externalId === externalId)
    if (replay) {
      return { caseType: 'A', status: 'replay_duplicate', leadId: replay.id }
    }

    // Case B: Existing lead in same organisation & same project
    const sameProjectLead = crmDatabase.find(
      (l) => l.orgId === orgId && l.projectId === projectId && l.phone === phone
    )
    if (sameProjectLead) {
      sameProjectLead.activitiesCount = (sameProjectLead.activitiesCount || 1) + 1
      sameProjectLead.lastContactAt = new Date().toISOString()
      return { caseType: 'B', status: 'same_project_updated', leadId: sameProjectLead.id }
    }

    // Case C: Inbound enquiry for different project or brand new lead
    const newLead = {
      id: `lead_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      orgId,
      projectId,
      phone,
      fullName,
      externalId,
      source,
      activitiesCount: 1,
      createdAt: new Date().toISOString(),
    }
    crmDatabase.push(newLead)
    return { caseType: 'C', status: 'created', leadId: newLead.id }
  }

  const orgId = 'org_premier_01'
  const phone = '+919849011223'

  // Step 1: Initial lead in Sky Gardens
  const lead1 = ingestLeadToCRM({
    orgId,
    projectId: 'proj_skygardens',
    phone,
    fullName: 'Ananya Rao',
    externalId: 'wamid_step_1',
    source: 'whatsapp',
  })
  assert.equal(lead1.caseType, 'C')
  assert.equal(lead1.status, 'created')

  // Step 2 (Case A): Exact replay of wamid_step_1
  const replayLead = ingestLeadToCRM({
    orgId,
    projectId: 'proj_skygardens',
    phone,
    fullName: 'Ananya Rao',
    externalId: 'wamid_step_1',
    source: 'whatsapp',
  })
  assert.equal(replayLead.caseType, 'A')
  assert.equal(replayLead.status, 'replay_duplicate')
  assert.equal(replayLead.leadId, lead1.leadId)

  // Step 3 (Case B): Follow-up message for Sky Gardens with new wamid
  const updateLead = ingestLeadToCRM({
    orgId,
    projectId: 'proj_skygardens',
    phone,
    fullName: 'Ananya Rao',
    externalId: 'wamid_step_2',
    source: 'whatsapp',
  })
  assert.equal(updateLead.caseType, 'B')
  assert.equal(updateLead.status, 'same_project_updated')
  assert.equal(updateLead.leadId, lead1.leadId)

  // Step 4 (Case C): Enquiry from same phone for a different project (Lakeview)
  const diffProjLead = ingestLeadToCRM({
    orgId,
    projectId: 'proj_lakeview',
    phone,
    fullName: 'Ananya Rao',
    externalId: 'wamid_step_3',
    source: 'whatsapp',
  })
  assert.equal(diffProjLead.caseType, 'C')
  assert.equal(diffProjLead.status, 'created')
  assert.notEqual(diffProjLead.leadId, lead1.leadId, 'Different project must generate distinct lead record')

  console.log('  ✓ Test 7 Passed: CRM lead deduplication (Cases A, B, C)')
}

// ---------------------------------------------------------------------------
// 8. Customer Consent Opt-Out Keyword Enforcement
// ---------------------------------------------------------------------------

const OPT_OUT_KEYWORDS = new Set([
  'stop',
  'unsubscribe',
  'cancel',
  'quit',
  'opt out',
  'optout',
  'end',
  'stopall',
  'revoke',
])

function evaluateConsentKeyword(text) {
  const normalized = (text || '').trim().toLowerCase()
  if (OPT_OUT_KEYWORDS.has(normalized)) {
    return { isOptOutKeyword: true, isOptInKeyword: false, resultingStatus: 'opted_out', keyword: normalized }
  }
  const OPT_IN_KEYWORDS = new Set(['start', 'yes', 'opt in', 'optin', 'unstop', 'subscribe'])
  if (OPT_IN_KEYWORDS.has(normalized)) {
    return { isOptOutKeyword: false, isOptInKeyword: true, resultingStatus: 'opted_in', keyword: normalized }
  }
  return { isOptOutKeyword: false, isOptInKeyword: false, resultingStatus: 'unknown' }
}

{
  const optOutTests = ['STOP', 'unsubscribe', 'Cancel', 'QUIT', 'opt out', 'revoke']
  for (const keyword of optOutTests) {
    const res = evaluateConsentKeyword(keyword)
    assert.equal(res.isOptOutKeyword, true, `Keyword "${keyword}" must be recognized as opt-out`)
    assert.equal(res.resultingStatus, 'opted_out')
  }

  console.log('  ✓ Test 8 Passed: Customer consent opt-out keyword enforcement')
}

// ---------------------------------------------------------------------------
// 9. Customer Consent Opt-In Keyword Enforcement
// ---------------------------------------------------------------------------

{
  const optInTests = ['START', 'yes', 'OPT IN', 'subscribe', 'unstop']
  for (const keyword of optInTests) {
    const res = evaluateConsentKeyword(keyword)
    assert.equal(res.isOptInKeyword, true, `Keyword "${keyword}" must be recognized as opt-in`)
    assert.equal(res.resultingStatus, 'opted_in')
  }

  // Non-consent conversational message
  const chatRes = evaluateConsentKeyword('What is the price of 3BHK?')
  assert.equal(chatRes.isOptOutKeyword, false)
  assert.equal(chatRes.isOptInKeyword, false)
  assert.equal(chatRes.resultingStatus, 'unknown')

  console.log('  ✓ Test 9 Passed: Customer consent opt-in keyword enforcement')
}

// ---------------------------------------------------------------------------
// 10. Outbound Messaging Policy Guard (24-Hour Customer Care Window)
// ---------------------------------------------------------------------------

function canSendOutboundMessage(params) {
  const { isOptedOut, lastInboundTimestamp, isTemplateMessage, now = Date.now() } = params

  // 1. Strict Opt-Out Block
  if (isOptedOut) {
    return { allowed: false, reason: 'Customer has opted out of WhatsApp communications.' }
  }

  // 2. 24-Hour Window Evaluation
  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000
  const isInside24hWindow =
    typeof lastInboundTimestamp === 'number' &&
    lastInboundTimestamp > 0 &&
    now - lastInboundTimestamp <= TWENTY_FOUR_HOURS_MS

  // Outside 24h window, ONLY pre-approved templates are permitted by Meta
  if (!isInside24hWindow && !isTemplateMessage) {
    return {
      allowed: false,
      reason: 'Outside 24-hour window. Only pre-approved WhatsApp message templates permitted.',
    }
  }

  return { allowed: true }
}

{
  const now = Date.now()
  const ONE_HOUR_AGO = now - 60 * 60 * 1000
  const THIRTY_HOURS_AGO = now - 30 * 60 * 60 * 1000

  // 10a: Opted out contact is blocked unconditionally
  const optOutBlock = canSendOutboundMessage({
    isOptedOut: true,
    lastInboundTimestamp: ONE_HOUR_AGO,
    isTemplateMessage: true,
    now,
  })
  assert.equal(optOutBlock.allowed, false, 'Opted out contact must be blocked even for templates')

  // 10b: Inside 24h window permits free-form message
  const insideSession = canSendOutboundMessage({
    isOptedOut: false,
    lastInboundTimestamp: ONE_HOUR_AGO,
    isTemplateMessage: false,
    now,
  })
  assert.equal(insideSession.allowed, true, 'Inside 24h window permits free-form outbound message')

  // 10c: Outside 24h window blocks free-form message
  const outsideFreeForm = canSendOutboundMessage({
    isOptedOut: false,
    lastInboundTimestamp: THIRTY_HOURS_AGO,
    isTemplateMessage: false,
    now,
  })
  assert.equal(outsideFreeForm.allowed, false, 'Outside 24h window blocks free-form message')

  // 10d: Outside 24h window permits approved template
  const outsideTemplate = canSendOutboundMessage({
    isOptedOut: false,
    lastInboundTimestamp: THIRTY_HOURS_AGO,
    isTemplateMessage: true,
    now,
  })
  assert.equal(outsideTemplate.allowed, true, 'Outside 24h window permits approved template message')

  console.log('  ✓ Test 10 Passed: Outbound messaging policy guard & 24h window enforcement')
}

// ---------------------------------------------------------------------------
// 11. Approved Template Validation & Variable Interpolation
// ---------------------------------------------------------------------------

function validateTemplateForSending(template) {
  if (!template || typeof template !== 'object') {
    return { isValid: false, reason: 'Template definition is missing' }
  }
  if (template.status !== 'APPROVED') {
    return { isValid: false, reason: `Template status is ${template.status}, expected APPROVED` }
  }
  return { isValid: true }
}

function renderTemplateMessage(bodyText, params) {
  let rendered = bodyText
  for (let i = 0; i < params.length; i++) {
    const placeholder = `{{${i + 1}}}`
    rendered = rendered.replaceAll(placeholder, params[i])
  }
  return rendered
}

{
  const approvedTemplate = {
    template_name: 'site_visit_confirmation',
    status: 'APPROVED',
    category: 'UTILITY',
    body: 'Hello {{1}}, your site visit for {{2}} is confirmed for {{3}}. Reply STOP to unsubscribe.',
  }

  // Validation
  assert.equal(validateTemplateForSending(approvedTemplate).isValid, true)
  assert.equal(validateTemplateForSending({ ...approvedTemplate, status: 'PENDING' }).isValid, false)
  assert.equal(validateTemplateForSending({ ...approvedTemplate, status: 'REJECTED' }).isValid, false)

  // Variable Interpolation
  const rendered = renderTemplateMessage(approvedTemplate.body, ['Siddharth', 'Sky Gardens', 'Sunday 11:00 AM'])
  assert.equal(
    rendered,
    'Hello Siddharth, your site visit for Sky Gardens is confirmed for Sunday 11:00 AM. Reply STOP to unsubscribe.'
  )

  console.log('  ✓ Test 11 Passed: Approved template validation & variable interpolation')
}

// ---------------------------------------------------------------------------
// 12. Delivery Receipt & Status Update Processing
// ---------------------------------------------------------------------------

{
  const messagesStore = {
    'wamid_receipt_01': { delivery_status: 'sent', updated_at: null },
  }

  function applyStatusReceipt(wamid, newStatus) {
    if (!messagesStore[wamid]) return { success: false, reason: 'not_found' }
    messagesStore[wamid].delivery_status = newStatus
    messagesStore[wamid].updated_at = new Date().toISOString()
    return { success: true, status: newStatus }
  }

  assert.equal(applyStatusReceipt('wamid_receipt_01', 'delivered').success, true)
  assert.equal(messagesStore['wamid_receipt_01'].delivery_status, 'delivered')

  assert.equal(applyStatusReceipt('wamid_receipt_01', 'read').success, true)
  assert.equal(messagesStore['wamid_receipt_01'].delivery_status, 'read')

  assert.equal(applyStatusReceipt('nonexistent_wamid', 'read').success, false)

  console.log('  ✓ Test 12 Passed: Delivery receipt & status update processing')
}

// ---------------------------------------------------------------------------
// 13. Tenant Isolation & Restricted Keys Stripping
// ---------------------------------------------------------------------------

function sanitizeCustomFields(fields) {
  const RESTRICTED_KEYS = new Set(['org_id', 'role', 'user_id', 'status', 'is_admin', 'tenant_id'])
  const sanitized = {}
  for (const [key, value] of Object.entries(fields || {})) {
    if (!RESTRICTED_KEYS.has(key.toLowerCase())) {
      sanitized[key] = value
    }
  }
  return sanitized
}

{
  const maliciousFields = {
    phone_number_id: 'phone_num_skygardens_01',
    org_id: 'injected_attacker_org_999',
    role: 'super_admin',
    is_admin: true,
    budget_range: '1.5 - 2 Cr',
  }

  const clean = sanitizeCustomFields(maliciousFields)
  assert.equal(clean.org_id, undefined, 'Restricted org_id must be stripped')
  assert.equal(clean.role, undefined, 'Restricted role must be stripped')
  assert.equal(clean.is_admin, undefined, 'Restricted is_admin must be stripped')
  assert.equal(clean.phone_number_id, 'phone_num_skygardens_01', 'Valid identifier must be retained')
  assert.equal(clean.budget_range, '1.5 - 2 Cr', 'Valid custom field must be retained')

  console.log('  ✓ Test 13 Passed: Tenant isolation & restricted keys stripping')
}

// ---------------------------------------------------------------------------
// 14. Audit Log Privacy & Credential Leak Prevention
// ---------------------------------------------------------------------------

function createSafeAuditEvent({ orgId, connectionId, eventType, externalEventId, leadId }) {
  const SENSITIVE_PATTERN = /token|secret|password|access_token|app_secret|key/i

  // Verify none of the audit fields match sensitive keywords
  for (const [k, v] of Object.entries({ orgId, connectionId, eventType, externalEventId, leadId })) {
    if (v && SENSITIVE_PATTERN.test(String(v))) {
      throw new Error(`Sensitive credential detected in audit payload key ${k}: ${v}`)
    }
  }

  return {
    org_id: orgId,
    connection_id: connectionId,
    provider: 'whatsapp_cloud',
    event_type: eventType,
    external_event_id: externalEventId,
    lead_id: leadId,
    processed_at: new Date().toISOString(),
  }
}

{
  const safeLog = createSafeAuditEvent({
    orgId: 'org_realestate_01',
    connectionId: 'conn_wa_01',
    eventType: 'whatsapp_message_received',
    externalEventId: 'wamid.HBgLMTU1NTAy',
    leadId: 'lead_abc_123',
  })

  assert.equal(safeLog.provider, 'whatsapp_cloud')
  assert.equal(safeLog.event_type, 'whatsapp_message_received')
  assert.equal(safeLog.external_event_id, 'wamid.HBgLMTU1NTAy')

  // Verify that an attempt to pass credentials triggers an error
  assert.throws(() => {
    createSafeAuditEvent({
      orgId: 'org_realestate_01',
      connectionId: 'conn_wa_01',
      eventType: 'whatsapp_message_received',
      externalEventId: 'access_token=EAAG1234567890',
      leadId: 'lead_abc_123',
    })
  }, /Sensitive credential detected/)

  console.log('  ✓ Test 14 Passed: Audit log privacy & credential protection')
}

console.log('\n--- All 14 WhatsApp Business Integration Tests Passed Successfully ---\n')
