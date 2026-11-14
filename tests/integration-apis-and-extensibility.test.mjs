// tests/integration-apis-and-extensibility.test.mjs
// Stage 4H: Automated Verification Suite for Developer APIs & Customer Outbound Webhooks.
// Tests API key generation & SHA-256 hashing, HMAC-SHA256 payload signing, timestamp replay defense,
// event subscription dispatch filtering, programmatic lead validation, tenant isolation, and audit privacy.

import assert from 'node:assert/strict'
import crypto from 'node:crypto'

console.log('--- Running Integration APIs & Extensibility (Stage 4H) Tests ---')

// ---------------------------------------------------------------------------
// 1. API Key Utilities
// ---------------------------------------------------------------------------

function hashApiKey(rawKey) {
  return crypto.createHash('sha256').update(rawKey.trim()).digest('hex')
}

function generateDeveloperApiKey() {
  const randomBytes = crypto.randomBytes(24).toString('hex')
  const rawKey = `px_live_${randomBytes}`
  const keyPrefix = rawKey.slice(0, 16)
  const keyHash = hashApiKey(rawKey)
  return { rawKey, keyHash, keyPrefix }
}

function validateApiKeyFormat(authHeader) {
  if (!authHeader) return { valid: false, error: 'missing_header' }
  let clean = authHeader.trim()
  if (clean.toLowerCase().startsWith('bearer ')) {
    clean = clean.slice(7).trim()
  }
  if (!clean.startsWith('px_live_')) {
    return { valid: false, error: 'invalid_prefix' }
  }
  if (clean.length < 32) {
    return { valid: false, error: 'invalid_length' }
  }
  return { valid: true, rawKey: clean }
}

// ---------------------------------------------------------------------------
// 2. Cryptographic Outbound Webhook Signing & Verification
// ---------------------------------------------------------------------------

function signOutboundWebhookPayload(payload, secret, timestamp = Math.floor(Date.now() / 1000)) {
  const signedData = `${timestamp}.${payload}`
  const hmac = crypto.createHmac('sha256', secret)
  hmac.update(signedData)
  const signatureHex = hmac.digest('hex')
  return {
    'x-px-signature-256': `sha256=${signatureHex}`,
    'x-px-timestamp': String(timestamp),
  }
}

function verifyOutboundWebhookSignature(params) {
  const {
    payload,
    signatureHeader,
    timestampHeader,
    secret,
    toleranceSeconds = 300,
    nowSeconds = Math.floor(Date.now() / 1000),
  } = params

  if (!signatureHeader || !timestampHeader || !secret) {
    return { valid: false, reason: 'Missing signature headers or secret' }
  }

  const timestamp = parseInt(timestampHeader, 10)
  if (isNaN(timestamp) || timestamp <= 0) {
    return { valid: false, reason: 'Invalid timestamp header' }
  }

  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) {
    return { valid: false, reason: 'Timestamp outside tolerance window' }
  }

  if (!signatureHeader.startsWith('sha256=')) {
    return { valid: false, reason: 'Invalid signature prefix' }
  }

  const expectedSigHex = signatureHeader.slice('sha256='.length).trim()
  const signedData = `${timestamp}.${payload}`
  const hmac = crypto.createHmac('sha256', secret)
  hmac.update(signedData)
  const actualSigHex = hmac.digest('hex')

  const expectedBuf = Buffer.from(expectedSigHex, 'hex')
  const actualBuf = Buffer.from(actualSigHex, 'hex')
  if (expectedBuf.length !== actualBuf.length) {
    return { valid: false, reason: 'Signature length mismatch' }
  }

  const matches = crypto.timingSafeEqual(expectedBuf, actualBuf)
  return { valid: matches, reason: matches ? undefined : 'Signature mismatch' }
}

// ---------------------------------------------------------------------------
// Execution of Tests
// ---------------------------------------------------------------------------

// Test 1: Developer API Key Generation & Prefix Structure
{
  const key = generateDeveloperApiKey()
  assert.ok(key.rawKey.startsWith('px_live_'), 'Key must start with px_live_')
  assert.equal(key.keyPrefix.length, 16)
  assert.equal(typeof key.keyHash, 'string')
  assert.equal(key.keyHash.length, 64, 'SHA-256 hash must be 64 hex characters')

  console.log('  ✓ Test 1 Passed: Developer API Key generation & prefix structure')
}

// Test 2: Deterministic SHA-256 Hashing
{
  const raw = 'px_live_112233445566778899aabbcc'
  const hash1 = hashApiKey(raw)
  const hash2 = hashApiKey(raw)
  assert.equal(hash1, hash2, 'Hash must be strictly deterministic')
  assert.notEqual(hash1, raw, 'Hash must not equal raw key')

  console.log('  ✓ Test 2 Passed: Deterministic SHA-256 API key hashing')
}

// Test 3: API Key Format Validation
{
  assert.equal(validateApiKeyFormat('Bearer px_live_112233445566778899aabbccddeeff').valid, true)
  assert.equal(validateApiKeyFormat('px_live_112233445566778899aabbccddeeff').valid, true)
  assert.equal(validateApiKeyFormat('Bearer test_key_123').valid, false)
  assert.equal(validateApiKeyFormat('').valid, false)
  assert.equal(validateApiKeyFormat(null).valid, false)

  console.log('  ✓ Test 3 Passed: API Key format validation & prefix enforcement')
}

// Test 4: Outbound Webhook Signing & Verification
{
  const secret = 'px_sec_wh_super_secret_99'
  const payload = JSON.stringify({ event: 'lead.created', leadId: 'lead_123', name: 'Suresh' })
  const now = Math.floor(Date.now() / 1000)

  const headers = signOutboundWebhookPayload(payload, secret, now)
  assert.ok(headers['x-px-signature-256'].startsWith('sha256='))
  assert.equal(headers['x-px-timestamp'], String(now))

  const verified = verifyOutboundWebhookSignature({
    payload,
    signatureHeader: headers['x-px-signature-256'],
    timestampHeader: headers['x-px-timestamp'],
    secret,
    nowSeconds: now,
  })
  assert.equal(verified.valid, true, 'Valid signature must verify successfully')

  console.log('  ✓ Test 4 Passed: Outbound webhook payload signing and verification')
}

// Test 5: Replay & Tampering Defense
{
  const secret = 'px_sec_wh_super_secret_99'
  const payload = JSON.stringify({ event: 'lead.created', leadId: 'lead_123' })
  const now = Math.floor(Date.now() / 1000)
  const headers = signOutboundWebhookPayload(payload, secret, now)

  // Tampered payload
  const tampered = payload + ' '
  const tamperedCheck = verifyOutboundWebhookSignature({
    payload: tampered,
    signatureHeader: headers['x-px-signature-256'],
    timestampHeader: headers['x-px-timestamp'],
    secret,
    nowSeconds: now,
  })
  assert.equal(tamperedCheck.valid, false, 'Tampered payload must fail')

  // Expired timestamp (replay attack older than 300s)
  const oldTimestamp = now - 400
  const expiredHeaders = signOutboundWebhookPayload(payload, secret, oldTimestamp)
  const replayCheck = verifyOutboundWebhookSignature({
    payload,
    signatureHeader: expiredHeaders['x-px-signature-256'],
    timestampHeader: expiredHeaders['x-px-timestamp'],
    secret,
    nowSeconds: now,
    toleranceSeconds: 300,
  })
  assert.equal(replayCheck.valid, false, 'Expired timestamp must be rejected')
  assert.ok(replayCheck.reason.includes('tolerance window'))

  console.log('  ✓ Test 5 Passed: Tampering defense and 300s replay window protection')
}

// Test 6: Webhook Subscription Event Filtering
{
  const subscriptions = [
    { id: 'sub_1', url: 'https://crm.dev.com/webhook', event_types: ['lead.created', 'lead.status_changed'] },
    { id: 'sub_2', url: 'https://erp.dev.com/webhook', event_types: ['inventory.status_changed'] },
    { id: 'sub_3', url: 'https://audit.dev.com/webhook', event_types: ['*'] },
  ]

  function filterSubscriptions(event) {
    return subscriptions.filter((s) => s.event_types.includes(event) || s.event_types.includes('*'))
  }

  const leadCreatedSubs = filterSubscriptions('lead.created')
  assert.equal(leadCreatedSubs.length, 2, 'Sub 1 and Sub 3 must receive lead.created')

  const invSubs = filterSubscriptions('inventory.status_changed')
  assert.equal(invSubs.length, 2, 'Sub 2 and Sub 3 must receive inventory.status_changed')

  const siteVisitSubs = filterSubscriptions('site_visit.scheduled')
  assert.equal(siteVisitSubs.length, 1, 'Only wildcard Sub 3 must receive site_visit.scheduled')

  console.log('  ✓ Test 6 Passed: Webhook subscription event routing and wildcard filtering')
}

// Test 7: Programmatic Lead Submission Validation
{
  function validateProgrammaticLead(body) {
    const name = (body.name || body.fullName || '').trim()
    const phone = (body.phone || '').trim()
    if (!name || !phone) {
      return { valid: false, error: 'Missing required fields: name and phone are mandatory.' }
    }
    return { valid: true, name, phone }
  }

  assert.equal(validateProgrammaticLead({ name: 'Vikram', phone: '9849012345' }).valid, true)
  assert.equal(validateProgrammaticLead({ name: '', phone: '9849012345' }).valid, false)
  assert.equal(validateProgrammaticLead({ name: 'Vikram', phone: '' }).valid, false)

  console.log('  ✓ Test 7 Passed: Programmatic REST API lead submission validation')
}

// Test 8: Tenant Isolation Across API Keys
{
  const apiKeyStore = [
    { keyHash: hashApiKey('px_live_key_tenant_1'), orgId: 'org_acme_01', isActive: true },
    { keyHash: hashApiKey('px_live_key_tenant_2'), orgId: 'org_otho_02', isActive: true },
  ]

  function resolveApiKeyTenant(rawKey) {
    const hash = hashApiKey(rawKey)
    const match = apiKeyStore.find((k) => k.keyHash === hash)
    return match ? { success: true, orgId: match.orgId } : { success: false, error: 'Unauthorized' }
  }

  const tenant1 = resolveApiKeyTenant('px_live_key_tenant_1')
  assert.equal(tenant1.orgId, 'org_acme_01')

  const tenant2 = resolveApiKeyTenant('px_live_key_tenant_2')
  assert.equal(tenant2.orgId, 'org_otho_02')
  assert.notEqual(tenant1.orgId, tenant2.orgId, 'Keys must strictly resolve to separate tenants')

  console.log('  ✓ Test 8 Passed: Tenant isolation enforced across developer API keys')
}

// Test 9: Deactivated & Expired Key Defense
{
  const deactivatedKey = {
    keyHash: hashApiKey('px_live_deactivated_key'),
    isActive: false,
    expiresAt: null,
  }

  const expiredKey = {
    keyHash: hashApiKey('px_live_expired_key'),
    isActive: true,
    expiresAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
  }

  function evaluateKeyStatus(key) {
    if (!key.isActive) return { allowed: false, reason: 'deactivated' }
    if (key.expiresAt && new Date(key.expiresAt).getTime() < Date.now()) {
      return { allowed: false, reason: 'expired' }
    }
    return { allowed: true }
  }

  assert.equal(evaluateKeyStatus(deactivatedKey).allowed, false)
  assert.equal(evaluateKeyStatus(deactivatedKey).reason, 'deactivated')

  assert.equal(evaluateKeyStatus(expiredKey).allowed, false)
  assert.equal(evaluateKeyStatus(expiredKey).reason, 'expired')

  console.log('  ✓ Test 9 Passed: Deactivated and expired developer key rejection')
}

// Test 10: Privacy & Secret Protection Guarantee
{
  function sanitizeApiKeyResponse(keyRecord) {
    // Database record must never return key_hash in client responses
    const safe = { ...keyRecord }
    delete safe.key_hash
    delete safe.secret_ref
    return safe
  }

  const dbRecord = {
    id: 'key_1',
    name: 'Production Webhook Key',
    key_prefix: 'px_live_1122',
    key_hash: '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8',
    secret_ref: 'vault://aes256gcm:secret_data',
    created_at: new Date().toISOString(),
  }

  const sanitized = sanitizeApiKeyResponse(dbRecord)
  assert.equal(sanitized.key_hash, undefined, 'Key hash must never be serialized to client')
  assert.equal(sanitized.secret_ref, undefined, 'Secret ref must never be serialized to client')
  assert.equal(sanitized.key_prefix, 'px_live_1122')

  console.log('  ✓ Test 10 Passed: Privacy and secret protection guarantee in responses')
}

console.log('\n--- All 10 Integration APIs & Extensibility Tests Passed Successfully ---\n')
