// lib/integrations/portals/validator.ts
// Security validation, timing-safe authentication, and privilege stripping for Property Portal webhooks.

import crypto from 'node:crypto'

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

/**
 * Validates incoming portal API key / Bearer token using timing-safe comparison.
 */
export function verifyPortalAuthToken(headerToken: string | null | undefined, expectedToken: string): boolean {
  if (!headerToken || !expectedToken) return false

  // Strip 'Bearer ' if present
  let cleanHeader = headerToken.trim()
  if (cleanHeader.toLowerCase().startsWith('bearer ')) {
    cleanHeader = cleanHeader.slice(7).trim()
  }

  const tokenBuf = Buffer.from(cleanHeader, 'utf8')
  const expectedBuf = Buffer.from(expectedToken.trim(), 'utf8')

  if (tokenBuf.length !== expectedBuf.length) {
    return false
  }

  return crypto.timingSafeEqual(tokenBuf, expectedBuf)
}

/**
 * Strips restricted and internal tenant keys from untrusted portal payloads.
 */
export function sanitizePortalPayload(raw: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(raw || {})) {
    if (!RESTRICTED_KEYS.has(key.toLowerCase())) {
      clean[key] = value
    }
  }
  return clean
}
