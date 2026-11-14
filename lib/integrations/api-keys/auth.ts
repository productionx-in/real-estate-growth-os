// lib/integrations/api-keys/auth.ts
// Programmatic Developer API Key generation, hashing, and request authentication.

import crypto from 'node:crypto'
import { createServiceClient } from '@/lib/supabase/server'

export interface GeneratedApiKey {
  rawKey: string
  keyHash: string
  keyPrefix: string
}

export interface ApiKeyAuthResult {
  success: boolean
  orgId?: string
  keyName?: string
  permissions?: string[]
  error?: string
  statusCode?: number
}

/**
 * Computes SHA-256 hash of raw API key for secure database storage.
 */
export function hashApiKey(rawKey: string): string {
  return crypto.createHash('sha256').update(rawKey.trim()).digest('hex')
}

/**
 * Generates a cryptographically strong live developer API key.
 * Format: px_live_<32 hex chars>
 */
export function generateDeveloperApiKey(): GeneratedApiKey {
  const randomBytes = crypto.randomBytes(24).toString('hex')
  const rawKey = `px_live_${randomBytes}`
  const keyPrefix = rawKey.slice(0, 16)
  const keyHash = hashApiKey(rawKey)

  return { rawKey, keyHash, keyPrefix }
}

/**
 * Authenticates a programmatic request using a Developer API Key.
 */
export async function authenticateDeveloperApiKey(
  authHeader: string | null | undefined
): Promise<ApiKeyAuthResult> {
  if (!authHeader) {
    return {
      success: false,
      error: 'Missing Authorization header or API Key',
      statusCode: 401,
    }
  }

  let rawKey = authHeader.trim()
  if (rawKey.toLowerCase().startsWith('bearer ')) {
    rawKey = rawKey.slice(7).trim()
  }

  if (!rawKey.startsWith('px_live_')) {
    return {
      success: false,
      error: 'Invalid API Key format. Developer keys must start with px_live_',
      statusCode: 401,
    }
  }

  const keyHash = hashApiKey(rawKey)
  const service = createServiceClient()

  try {
    const { data: keyRecord } = await service
      .from('developer_api_keys')
      .select('id, org_id, name, permissions, is_active, expires_at')
      .eq('key_hash', keyHash)
      .maybeSingle()

    const key = keyRecord
    if (!key) {
      return {
        success: false,
        error: 'Invalid or revoked Developer API Key',
        statusCode: 401,
      }
    }

    if (!key.is_active) {
      return {
        success: false,
        error: 'Developer API Key has been deactivated',
        statusCode: 403,
      }
    }

    if (key.expires_at && new Date(key.expires_at).getTime() < Date.now()) {
      return {
        success: false,
        error: 'Developer API Key has expired',
        statusCode: 401,
      }
    }

    // Update last_used_at asynchronously
    try {
      await service
        .from('developer_api_keys')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', key.id)
    } catch {
      // Non-blocking
    }

    return {
      success: true,
      orgId: key.org_id,
      keyName: key.name,
      permissions: key.permissions || ['*'],
    }
  } catch (err: unknown) {
    return {
      success: false,
      error: `API Key authentication failed: ${err instanceof Error ? err.message : String(err)}`,
      statusCode: 500,
    }
  }
}
