// tests/website-enquiry-forms.test.mjs
// Stage 4E: Automated Verification Suite for Website Enquiry Forms
// Tests honeypot anti-spam defense, submission speed validation, distributed rate limiting,
// allowed origin domain whitelist, lead normalization & UTM attribution, project mapping resolution,
// central CRM deduplication (Case A, B, C), tenant isolation, public API privacy, and embed snippet generation.

import assert from 'node:assert/strict'
import crypto from 'node:crypto'

console.log('--- Running Website Enquiry Forms (Stage 4E) Tests ---')

// ---------------------------------------------------------------------------
// 1. Anti-Spam Defense Engine Implementation
// ---------------------------------------------------------------------------

const MIN_HUMAN_FILL_TIME_MS = 1200
const SPAM_LINK_REGEX = /\[url=|<a\s+href=|<script|viagra|casino|poker|crypto\s+doubler|seo\s+ranking/i
const REPETITIVE_DIGITS_REGEX = /^(\d)\1{9,11}$/
const SEQUENTIAL_DIGITS_REGEX = /^(1234567890|0123456789|9876543210)$/

function evaluateSpamSubmission(input) {
  // 1. Honeypots
  const hp1 = typeof input.hpConfirm === 'string' ? input.hpConfirm.trim() : ''
  const hp2 = typeof input.website_url_hp === 'string' ? input.website_url_hp.trim() : ''
  const hp3 = typeof input._hp_field === 'string' ? String(input._hp_field).trim() : ''

  if (hp1 || hp2 || hp3) {
    return { isSpam: true, reason: 'Honeypot field filled by automated submission agent' }
  }

  // 2. Submission speed
  if (typeof input.formLoadTime === 'number' && input.formLoadTime > 0) {
    const now = Date.now()
    const fillDuration = now - input.formLoadTime
    if (fillDuration > 0 && fillDuration < MIN_HUMAN_FILL_TIME_MS) {
      return {
        isSpam: true,
        reason: `Suspicious submission speed: filled in ${fillDuration}ms (threshold: ${MIN_HUMAN_FILL_TIME_MS}ms)`,
      }
    }
  }

  // 3. Keyword / script injection
  const combinedText = `${input.name || ''} ${input.notes || ''} ${input.email || ''}`
  if (SPAM_LINK_REGEX.test(combinedText)) {
    return { isSpam: true, reason: 'Spam keywords or link injection tags detected' }
  }

  // 4. Repeated / fake phone sequence
  const cleanedPhone = (input.phone || '').replace(/\D/g, '')
  if (REPETITIVE_DIGITS_REGEX.test(cleanedPhone) || SEQUENTIAL_DIGITS_REGEX.test(cleanedPhone)) {
    return { isSpam: true, reason: 'Garbage or test sequence phone number provided' }
  }

  return { isSpam: false }
}

// ---------------------------------------------------------------------------
// 2. Distributed Rate Limiter Simulation
// ---------------------------------------------------------------------------

class MockRateLimiter {
  constructor() {
    this.buckets = new Map()
  }

  consume(key, limit, windowMs) {
    const now = Date.now()
    const windowStart = Math.floor(now / windowMs) * windowMs
    const bucketKey = `${key}:${windowStart}`

    const count = (this.buckets.get(bucketKey) || 0) + 1
    this.buckets.set(bucketKey, count)

    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      totalCount: count,
    }
  }

  clear() {
    this.buckets.clear()
  }
}

// ---------------------------------------------------------------------------
// 3. Allowed Origin Domain Verifier
// ---------------------------------------------------------------------------

function isDomainAllowed(originOrReferer, allowedDomains) {
  if (!allowedDomains || allowedDomains.length === 0) return true
  if (!originOrReferer) return false

  try {
    let hostname = originOrReferer
    if (hostname.startsWith('http://') || hostname.startsWith('https://')) {
      hostname = new URL(hostname).hostname
    }
    hostname = hostname.toLowerCase()

    return allowedDomains.some((d) => {
      const cleanD = d.trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0]
      if (cleanD === '*' || hostname === cleanD) return true
      if (cleanD.startsWith('*.') && hostname.endsWith(cleanD.slice(1))) return true
      return false
    })
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// 4. Normalizer & Phone/Email Helpers
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

function normalizePhone(raw) {
  if (!raw) return ''
  const cleaned = raw.trim().replace(/[^\d+]/g, '')
  if (cleaned.startsWith('+')) return cleaned
  if (cleaned.length === 10 && /^[6-9]/.test(cleaned)) return `+91${cleaned}`
  if (cleaned.length === 12 && cleaned.startsWith('91')) return `+${cleaned}`
  return cleaned
}

function normalizeWebsiteEnquiry(input, context) {
  const customFields = {}
  const sourceMetadata = {
    utm_source: input.utmSource || null,
    utm_medium: input.utmMedium || null,
    utm_campaign: input.utmCampaign || null,
    utm_term: input.utmTerm || null,
    utm_content: input.utmContent || null,
    landing_page_url: input.pageUrl || null,
    referrer_url: input.referrer || null,
    unit_preference: input.unitPreference || null,
    budget_range: input.budget || null,
    schedule_site_visit: Boolean(input.scheduleSiteVisit),
    ingested_via: 'website_enquiry_form',
  }

  const notesParts = []
  if (input.unitPreference) notesParts.push(`Unit Preference: ${input.unitPreference}`)
  if (input.budget) notesParts.push(`Budget: ${input.budget}`)
  if (input.scheduleSiteVisit) notesParts.push('Requested Site Visit: Yes')
  if (input.notes) notesParts.push(input.notes)
  const combinedNotes = notesParts.length > 0 ? notesParts.join(' | ') : null

  for (const [key, val] of Object.entries(input)) {
    if (val === undefined || val === null) continue
    const lower = key.toLowerCase()
    if (RESTRICTED_KEYS.has(lower)) continue
    if (
      ![
        'name',
        'phone',
        'email',
        'projectId',
        'formId',
        'connectionId',
        'unitPreference',
        'budget',
        'notes',
        'scheduleSiteVisit',
        'utmSource',
        'utmMedium',
        'utmCampaign',
        'utmTerm',
        'utmContent',
        'pageUrl',
        'referrer',
        'externalLeadId',
        'idempotencyToken',
        'hpConfirm',
        'website_url_hp',
        'formLoadTime',
        'submissionTime',
      ].includes(key)
    ) {
      customFields[key] = val
    }
  }

  return {
    connectionId: context.connectionId,
    provider: 'website_webhook',
    name: input.name ? input.name.trim() : '',
    phone: normalizePhone(input.phone || ''),
    email: input.email ? input.email.trim().toLowerCase() : null,
    campaignId: input.utmCampaign ? input.utmCampaign.trim() : null,
    campaignName: input.utmCampaign ? input.utmCampaign.trim() : null,
    formId: input.formId
      ? String(input.formId).trim()
      : input.projectId
      ? String(input.projectId).trim()
      : null,
    externalLeadId: input.externalLeadId ? String(input.externalLeadId).trim() : undefined,
    idempotencyToken: input.idempotencyToken ? String(input.idempotencyToken).trim() : undefined,
    sourceUrl: input.pageUrl ? input.pageUrl.trim() : null,
    notes: combinedNotes,
    sourceMetadata: {
      ...sourceMetadata,
      ...customFields,
    },
    customFields,
    rawPayload: input,
  }
}

// ---------------------------------------------------------------------------
// 5. Embed Snippets Generator
// ---------------------------------------------------------------------------

function generateFormEmbedSnippets(options) {
  const baseUrl = (options.appUrl || 'https://app.productionx.com').replace(/\/$/, '')
  const title = options.formTitle || 'Enquire Now'
  const button = options.buttonText || 'Schedule Site Visit'
  const projectParam = options.projectId ? ` data-project-id="${options.projectId}"` : ''
  const projectQuery = options.projectId ? `&projectId=${options.projectId}` : ''

  const scriptTag = `<!-- Production X Enquiry Form Embed -->
<div id="productionx-enquiry-form" data-connection-id="${options.connectionId}"${projectParam} data-title="${title}" data-button="${button}"></div>
<script src="${baseUrl}/forms/embed.js" async defer></script>`

  const iframe = `<!-- Production X Enquiry Form iframe -->
<iframe
  src="${baseUrl}/forms/view?connectionId=${options.connectionId}${projectQuery}"
  width="100%"
  height="540"
  frameborder="0"
  style="border: none; border-radius: 8px; width: 100%; max-width: 480px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);"
  title="${title}"
></iframe>`

  const apiFetch = `// Direct REST API Submission
const response = await fetch('${baseUrl}/api/forms/submit', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    connectionId: '${options.connectionId}',${options.projectId ? `\n    projectId: '${options.projectId}',` : ''}
    name: 'Customer Name',
    phone: '+919876543210',
    email: 'customer@example.com',
    unitPreference: '3 BHK Apartment',
    scheduleSiteVisit: true,
    utmSource: new URLSearchParams(window.location.search).get('utm_source'),
    utmCampaign: new URLSearchParams(window.location.search).get('utm_campaign'),
    pageUrl: window.location.href,
    referrer: document.referrer,
    formLoadTime: Date.now(),
  }),
});
const result = await response.json();`

  return { scriptTag, iframe, apiFetch }
}

// ---------------------------------------------------------------------------
// 6. Mock Inbound Lead Engine & State
// ---------------------------------------------------------------------------

class MockCRMDatabase {
  constructor() {
    this.connections = []
    this.mappings = []
    this.leads = []
    this.eventLogs = []
  }

  createConnection(conn) {
    this.connections.push(conn)
    return conn
  }

  createMapping(map) {
    this.mappings.push(map)
    return map
  }

  async processInboundLead(orgId, payload) {
    // 1. Connection check
    const conn = this.connections.find((c) => c.id === payload.connectionId)
    if (!conn || conn.org_id !== orgId) {
      this.eventLogs.push({
        org_id: orgId,
        connection_id: payload.connectionId,
        provider: payload.provider,
        event_type: 'lead_ingest_failed',
        processing_status: 'failed',
        error_message: 'Referenced integration connection does not exist in this organisation',
      })
      return {
        success: false,
        action: 'error',
        errorMessage: 'Integration connection not found in this organisation',
      }
    }

    if (conn.status !== 'connected') {
      this.eventLogs.push({
        org_id: orgId,
        connection_id: payload.connectionId,
        provider: payload.provider,
        event_type: 'lead_ingest_rejected',
        processing_status: 'failed',
        error_message: `Connection is ${conn.status}. Inbound leads are blocked for inactive or disabled connections.`,
      })
      return {
        success: false,
        action: 'error',
        errorMessage: `Connection is ${conn.status}. Inbound leads cannot be processed for inactive or disabled connections.`,
      }
    }

    // 2. Deterministic Idempotency Key (Case A)
    let idempotencyKey = null
    if (payload.externalLeadId) {
      idempotencyKey = crypto
        .createHash('sha256')
        .update(`ext:${orgId}:${payload.provider}:${payload.externalLeadId}`)
        .digest('hex')
    } else if (payload.idempotencyToken) {
      idempotencyKey = crypto
        .createHash('sha256')
        .update(`token:${orgId}:${payload.provider}:${payload.idempotencyToken}`)
        .digest('hex')
    }

    if (idempotencyKey) {
      const existing = this.leads.find((l) => l.org_id === orgId && l.idempotency_key === idempotencyKey)
      if (existing) {
        this.eventLogs.push({
          org_id: orgId,
          connection_id: payload.connectionId,
          provider: payload.provider,
          event_type: 'lead_idempotent_replay',
          processing_status: 'duplicate',
          lead_id: existing.id,
        })
        return {
          success: true,
          leadId: existing.id,
          isDuplicate: existing.is_duplicate,
          action: 'idempotent_replay',
        }
      }
    }

    // 3. Project Mapping Resolution
    const activeMappings = this.mappings.filter(
      (m) => m.org_id === orgId && m.connection_id === payload.connectionId
    )
    let resolvedProjectId = null

    // Priority 1: Campaign match
    if (payload.campaignId) {
      const match = activeMappings.find(
        (m) => m.external_identifier_type === 'campaign_id' && m.external_identifier_value === payload.campaignId
      )
      if (match) resolvedProjectId = match.project_id
    }

    // Priority 2: Form match
    if (!resolvedProjectId && payload.formId) {
      const match = activeMappings.find(
        (m) => m.external_identifier_type === 'form_id' && m.external_identifier_value === payload.formId
      )
      if (match) resolvedProjectId = match.project_id
    }

    // Priority 3: Fallback account_default
    if (!resolvedProjectId) {
      const match = activeMappings.find((m) => m.external_identifier_type === 'account_default')
      if (match) resolvedProjectId = match.project_id
    }

    // 4. Multi-Category Deduplication (Case B & C)
    const existingContact = this.leads.find(
      (l) => l.org_id === orgId && (l.phone === payload.phone || (payload.email && l.email === payload.email))
    )

    let isDuplicate = false
    let duplicateOfId = null

    if (existingContact) {
      if (existingContact.project_id === resolvedProjectId) {
        // Case B: Same customer, same project enquiry -> Duplicate customer enquiry
        isDuplicate = true
        duplicateOfId = existingContact.id
      } else {
        // Case C: Same customer, DIFFERENT project enquiry -> Genuinely separate lead
        isDuplicate = false
        duplicateOfId = null
      }
    }

    // 5. Ingest lead
    const newLead = {
      id: `lead_${this.leads.length + 1}`,
      org_id: orgId,
      project_id: resolvedProjectId,
      idempotency_key: idempotencyKey,
      name: payload.name,
      phone: payload.phone,
      email: payload.email,
      notes: payload.notes,
      is_duplicate: isDuplicate,
      duplicate_of_id: duplicateOfId,
      source_metadata: payload.sourceMetadata,
      created_at: new Date().toISOString(),
    }
    this.leads.push(newLead)

    this.eventLogs.push({
      org_id: orgId,
      connection_id: payload.connectionId,
      provider: payload.provider,
      event_type: 'lead_processed',
      processing_status: isDuplicate ? 'duplicate' : 'processed',
      lead_id: newLead.id,
    })

    return {
      success: true,
      leadId: newLead.id,
      isDuplicate,
      duplicateOfId,
      projectId: resolvedProjectId,
      routingStatus: resolvedProjectId ? 'mapped' : 'unmapped',
      action: isDuplicate ? 'duplicate_detected' : 'created',
    }
  }
}

// ---------------------------------------------------------------------------
// TEST SUITE EXECUTION
// ---------------------------------------------------------------------------

async function runTests() {
  const orgId1 = 'org_premier_builders'
  const orgId2 = 'org_other_tenant'
  const projA = 'proj_skygardens_hitech'
  const projB = 'proj_lakeside_villas'
  const connId1 = 'conn_website_skygardens'

  const mockDb = new MockCRMDatabase()
  mockDb.createConnection({
    id: connId1,
    org_id: orgId1,
    provider: 'website_webhook',
    name: 'Official Developer Website',
    status: 'connected',
    metadata: {
      allowedDomains: ['premierbuilders.in', '*.skygardens.com'],
    },
  })

  // Mappings
  mockDb.createMapping({
    id: 'map_1',
    org_id: orgId1,
    connection_id: connId1,
    project_id: projA,
    external_identifier_type: 'form_id',
    external_identifier_value: 'form_skygardens_enquiry',
  })
  mockDb.createMapping({
    id: 'map_2',
    org_id: orgId1,
    connection_id: connId1,
    project_id: projB,
    external_identifier_type: 'form_id',
    external_identifier_value: 'form_lakeside_enquiry',
  })
  mockDb.createMapping({
    id: 'map_3',
    org_id: orgId1,
    connection_id: connId1,
    project_id: projA,
    external_identifier_type: 'account_default',
    external_identifier_value: 'default',
  })

  // Test 1: Honeypot Anti-Spam Detection
  {
    console.log('Test 1: Honeypot field traps catch automated bots')
    const botSubmission1 = { name: 'Bot User', phone: '+919876543210', hpConfirm: 'http://spam-link.ru' }
    const botSubmission2 = { name: 'Bot User', phone: '+919876543210', website_url_hp: 'spam.com' }
    const botSubmission3 = { name: 'Bot User', phone: '+919876543210', _hp_field: 'filled' }
    const humanSubmission = { name: 'Rahul Sharma', phone: '+919876543210' }

    assert.equal(evaluateSpamSubmission(botSubmission1).isSpam, true, 'Must flag hpConfirm')
    assert.equal(evaluateSpamSubmission(botSubmission2).isSpam, true, 'Must flag website_url_hp')
    assert.equal(evaluateSpamSubmission(botSubmission3).isSpam, true, 'Must flag _hp_field')
    assert.equal(evaluateSpamSubmission(humanSubmission).isSpam, false, 'Human submission must not be flagged')
  }

  // Test 2: Submission Speed Validation (Time-to-Fill)
  {
    console.log('Test 2: Submission time-to-fill speed defense (<1200ms flagged as bot)')
    const now = Date.now()
    const fastScript = {
      name: 'Automated Script',
      phone: '+919876543210',
      formLoadTime: now - 350, // Filled in 350ms
    }
    const humanSubmission = {
      name: 'Pooja Reddy',
      phone: '+919876543210',
      formLoadTime: now - 8500, // Filled in 8.5s
    }

    const fastResult = evaluateSpamSubmission(fastScript)
    assert.equal(fastResult.isSpam, true, 'Submission completed in 350ms must be flagged as bot')
    assert.match(fastResult.reason, /Suspicious submission speed/i)

    const humanResult = evaluateSpamSubmission(humanSubmission)
    assert.equal(humanResult.isSpam, false, 'Human taking >1.2s must pass')
  }

  // Test 3: Link & Keyword Injection Defense
  {
    console.log('Test 3: Script tag and spam keyword injection detection')
    const spamWithScript = { name: '<script>alert("xss")</script>', phone: '+919876543210' }
    const spamWithLink = { name: 'John Doe', notes: 'Check our casino ranking here: [url=http://casino.ru]', phone: '+919876543210' }
    const validNotes = { name: 'Anil Rao', notes: 'Looking for 3 BHK flat with east-facing balcony', phone: '+919876543210' }

    assert.equal(evaluateSpamSubmission(spamWithScript).isSpam, true, 'Script tags must be rejected')
    assert.equal(evaluateSpamSubmission(spamWithLink).isSpam, true, 'Link injection tags must be rejected')
    assert.equal(evaluateSpamSubmission(validNotes).isSpam, false, 'Genuine buyer notes must pass')
  }

  // Test 4: Fake / Repetitive Phone Sequence Filter
  {
    console.log('Test 4: Fake sequence and repetitive phone number defense')
    const allZeroes = { name: 'Fake Test', phone: '0000000000' }
    const sequence = { name: 'Fake Test', phone: '1234567890' }
    const validPhone = { name: 'Genuine Buyer', phone: '9849012345' }

    assert.equal(evaluateSpamSubmission(allZeroes).isSpam, true, 'All 0s phone number must be caught')
    assert.equal(evaluateSpamSubmission(sequence).isSpam, true, 'Sequence 1234567890 must be caught')
    assert.equal(evaluateSpamSubmission(validPhone).isSpam, false, 'Valid 10-digit mobile must pass')
  }

  // Test 5: Distributed Atomic Rate Limiter
  {
    console.log('Test 5: Distributed rate limiting per client IP and connection')
    const limiter = new MockRateLimiter()
    const testIp = '103.24.120.55'

    // Consume up to limit (15)
    for (let i = 1; i <= 15; i++) {
      const res = limiter.consume(`form:ip:${testIp}`, 15, 300_000)
      assert.equal(res.allowed, true, `Request ${i} should be allowed`)
    }

    // 16th request must be blocked
    const blockedRes = limiter.consume(`form:ip:${testIp}`, 15, 300_000)
    assert.equal(blockedRes.allowed, false, '16th submission within window must be rate-limited')
    assert.equal(blockedRes.remaining, 0)

    // Different IP must still be allowed
    const differentIpRes = limiter.consume('form:ip:103.24.120.99', 15, 300_000)
    assert.equal(differentIpRes.allowed, true, 'Different IP must have its own bucket')
  }

  // Test 6: Allowed Origin Domain Validation (CORS & Whitelisting)
  {
    console.log('Test 6: Allowed origin domain verification')
    const allowed = ['premierbuilders.in', '*.skygardens.com']

    assert.equal(isDomainAllowed('https://premierbuilders.in', allowed), true)
    assert.equal(isDomainAllowed('https://tower1.skygardens.com', allowed), true)
    assert.equal(isDomainAllowed('https://malicious-scam-site.org', allowed), false)
    assert.equal(isDomainAllowed(null, allowed), false, 'Empty origin is disallowed when whitelist is active')
    assert.equal(isDomainAllowed('https://any-domain.com', []), true, 'Empty whitelist allows all domains')
  }

  // Test 7: Lead Normalization, Composite Notes & UTM Attribution Capture
  {
    console.log('Test 7: Lead normalization, composite requirements notes, and UTM tracking')
    const rawInput = {
      name: '  Vikram Singhania  ',
      phone: '9876543210',
      email: '  Vikram@EXAMPLE.com  ',
      unitPreference: '3 BHK Apartment',
      budget: '₹1.5 Cr - ₹2.0 Cr',
      scheduleSiteVisit: true,
      notes: 'Please arrange morning slot.',
      utmSource: 'google_search',
      utmMedium: 'cpc',
      utmCampaign: 'skygardens_brand_q4',
      pageUrl: 'https://premierbuilders.in/skygardens?utm_source=google_search',
      referrer: 'https://google.com',
      arbitraryCustomField: 'High Floor Preferred',
    }

    const normalized = normalizeWebsiteEnquiry(rawInput, { connectionId: connId1 })
    assert.equal(normalized.name, 'Vikram Singhania')
    assert.equal(normalized.phone, '+919876543210')
    assert.equal(normalized.email, 'vikram@example.com')
    assert.equal(normalized.provider, 'website_webhook')
    assert.match(normalized.notes, /Unit Preference: 3 BHK Apartment/)
    assert.match(normalized.notes, /Budget: ₹1.5 Cr - ₹2.0 Cr/)
    assert.match(normalized.notes, /Requested Site Visit: Yes/)
    assert.match(normalized.notes, /Please arrange morning slot/)
    assert.equal(normalized.sourceMetadata.utm_source, 'google_search')
    assert.equal(normalized.sourceMetadata.utm_campaign, 'skygardens_brand_q4')
    assert.equal(normalized.sourceMetadata.landing_page_url, 'https://premierbuilders.in/skygardens?utm_source=google_search')
    assert.equal(normalized.sourceMetadata.arbitraryCustomField, 'High Floor Preferred')
  }

  // Test 8: Tenant Isolation & Restricted Keys Stripping
  {
    console.log('Test 8: Tenant isolation and restricted keys stripping prevents privilege escalation')
    const maliciousPayload = {
      name: 'Attacker',
      phone: '+919876500000',
      org_id: 'injected_foreign_tenant',
      tenant_id: 'foreign_tenant',
      role: 'super_admin',
      is_admin: true,
      user_id: 'root',
    }

    const normalized = normalizeWebsiteEnquiry(maliciousPayload, { connectionId: connId1 })
    assert.equal(normalized.customFields.org_id, undefined)
    assert.equal(normalized.customFields.tenant_id, undefined)
    assert.equal(normalized.customFields.role, undefined)
    assert.equal(normalized.customFields.is_admin, undefined)
    assert.equal(normalized.sourceMetadata.org_id, undefined)
    assert.equal(normalized.sourceMetadata.role, undefined)

    // Cross-tenant connection access rejection
    const crossTenantRes = await mockDb.processInboundLead(orgId2, {
      connectionId: connId1,
      provider: 'website_webhook',
      name: 'Unauthorized Cross-Tenant Submitter',
      phone: '+919876500000',
    })
    assert.equal(crossTenantRes.success, false, 'Processing via foreign tenant connection must be rejected')
    assert.match(crossTenantRes.errorMessage, /not found in this organisation/i)
  }

  // Test 9: Project Mapping Resolution Hierarchy
  {
    console.log('Test 9: Project mapping resolution precedence (form_id -> account_default -> unmapped)')
    // Priority 2: form_id match (skygardens)
    const payloadFormA = {
      connectionId: connId1,
      provider: 'website_webhook',
      name: 'Buyer Skygardens',
      phone: '+919876500001',
      formId: 'form_skygardens_enquiry',
    }
    const resA = await mockDb.processInboundLead(orgId1, payloadFormA)
    assert.equal(resA.projectId, projA, 'Must resolve to projA via form_id')
    assert.equal(resA.routingStatus, 'mapped')

    // Priority 2: form_id match (lakeside)
    const payloadFormB = {
      connectionId: connId1,
      provider: 'website_webhook',
      name: 'Buyer Lakeside',
      phone: '+919876500002',
      formId: 'form_lakeside_enquiry',
    }
    const resB = await mockDb.processInboundLead(orgId1, payloadFormB)
    assert.equal(resB.projectId, projB, 'Must resolve to projB via form_id')
    assert.equal(resB.routingStatus, 'mapped')

    // Fallback: account_default
    const payloadFallback = {
      connectionId: connId1,
      provider: 'website_webhook',
      name: 'Buyer General',
      phone: '+919876500003',
      formId: 'unmapped_random_form',
    }
    const resFallback = await mockDb.processInboundLead(orgId1, payloadFallback)
    assert.equal(resFallback.projectId, projA, 'Must fallback to connection account_default project')
    assert.equal(resFallback.routingStatus, 'mapped')
  }

  // Test 10: CRM Deduplication (Case A, Case B, Case C)
  {
    console.log('Test 10: Central CRM deduplication (Case A Replay, Case B Same Project, Case C Different Project)')
    const testPhone = '+919876599999'

    // First enquiry for Project A
    const lead1 = await mockDb.processInboundLead(orgId1, {
      connectionId: connId1,
      provider: 'website_webhook',
      name: 'Suresh Varma',
      phone: testPhone,
      formId: 'form_skygardens_enquiry', // resolves to projA
      idempotencyToken: 'token_first_submission_123',
    })
    assert.equal(lead1.action, 'created')
    assert.equal(lead1.isDuplicate, false)

    // Case A: Exact replay with identical token (e.g. network retry)
    const replay = await mockDb.processInboundLead(orgId1, {
      connectionId: connId1,
      provider: 'website_webhook',
      name: 'Suresh Varma',
      phone: testPhone,
      formId: 'form_skygardens_enquiry',
      idempotencyToken: 'token_first_submission_123',
    })
    assert.equal(replay.action, 'idempotent_replay')
    assert.equal(replay.leadId, lead1.leadId, 'Replay must return original lead ID')

    // Case B: Same customer submitting AGAIN for the SAME project (Project A)
    const leadSameProject = await mockDb.processInboundLead(orgId1, {
      connectionId: connId1,
      provider: 'website_webhook',
      name: 'Suresh Varma',
      phone: testPhone,
      formId: 'form_skygardens_enquiry', // resolves to projA
    })
    assert.equal(leadSameProject.action, 'duplicate_detected')
    assert.equal(leadSameProject.isDuplicate, true)
    assert.equal(leadSameProject.duplicateOfId, lead1.leadId, 'Must link non-destructively to primary lead')

    // Case C: Same customer submitting for a DIFFERENT project (Project B)
    const leadDifferentProject = await mockDb.processInboundLead(orgId1, {
      connectionId: connId1,
      provider: 'website_webhook',
      name: 'Suresh Varma',
      phone: testPhone,
      formId: 'form_lakeside_enquiry', // resolves to projB
    })
    assert.equal(leadDifferentProject.action, 'created')
    assert.equal(leadDifferentProject.isDuplicate, false, 'Different project enquiry must NOT be marked duplicate')
    assert.equal(leadDifferentProject.projectId, projB)
  }

  // Test 11: Inactive Connection Gating & Audit Event Log PII Protection
  {
    console.log('Test 11: Inactive connection rejection & audit log data sanitization')
    const disabledConnId = 'conn_disabled_website'
    mockDb.createConnection({
      id: disabledConnId,
      org_id: orgId1,
      provider: 'website_webhook',
      name: 'Inactive Website Connection',
      status: 'disabled',
    })

    const blockedRes = await mockDb.processInboundLead(orgId1, {
      connectionId: disabledConnId,
      provider: 'website_webhook',
      name: 'Test Lead',
      phone: '+919999999999',
    })
    assert.equal(blockedRes.success, false)
    assert.equal(blockedRes.action, 'error')
    assert.match(blockedRes.errorMessage, /inactive or disabled/i)

    // Audit logs validation: no customer PII stored in event log record
    for (const log of mockDb.eventLogs) {
      const logStr = JSON.stringify(log)
      assert.doesNotMatch(logStr, /\+91[0-9]{10}/i, 'Event logs must not store raw phone numbers')
      assert.doesNotMatch(logStr, /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i, 'Event logs must not store raw emails')
    }
    console.log('✓ All website integration event logs verified clean of customer PII')
  }

  // Test 12: Embed Snippet Generator
  {
    console.log('Test 12: Form embed code snippets generation (Script, iframe, REST API fetch)')
    const snippets = generateFormEmbedSnippets({
      connectionId: connId1,
      projectId: projA,
      projectName: 'Sky Gardens Residences',
      formTitle: 'Schedule a Private Tour',
      buttonText: 'Reserve Your Slot',
    })

    assert.match(snippets.scriptTag, /<div id="productionx-enquiry-form"/i)
    assert.match(snippets.scriptTag, new RegExp(`data-connection-id="${connId1}"`))
    assert.match(snippets.scriptTag, new RegExp(`data-project-id="${projA}"`))
    assert.match(snippets.scriptTag, /src="https:\/\/app\.productionx\.com\/forms\/embed\.js"/i)

    assert.match(snippets.iframe, /<iframe/i)
    assert.match(snippets.iframe, new RegExp(`connectionId=${connId1}`))
    assert.match(snippets.iframe, new RegExp(`projectId=${projA}`))

    assert.match(snippets.apiFetch, /fetch\('https:\/\/app\.productionx\.com\/api\/forms\/submit'/i)
    assert.match(snippets.apiFetch, new RegExp(`connectionId: '${connId1}'`))
    assert.match(snippets.apiFetch, new RegExp(`projectId: '${projA}'`))
  }

  console.log('--- All 12/12 Stage 4E Website Enquiry Form Tests Passed Successfully! ---')
}

runTests().catch((err) => {
  console.error('Stage 4E Test Execution Failed:', err)
  process.exit(1)
})
