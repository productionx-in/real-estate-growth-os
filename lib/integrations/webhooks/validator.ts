// lib/integrations/webhooks/validator.ts
// Cryptographic HMAC-SHA256 signature verification, timestamp anti-replay validation,
// and distributed rate limiter coordinator for generic public inbound webhooks.

import crypto from 'node:crypto'
import {
  checkDistributedRateLimit,
  type RateLimitResult,
  type RateLimitAdapter,
  resetLocalRateLimiter,
} from './rate-limiter'

export const MAX_WEBHOOK_PAYLOAD_BYTES = 1024 * 1024 // 1 MB
export const DEFAULT_TIMESTAMP_TOLERANCE_SECONDS = 300 // 5 minutes

export interface WebhookSecretConfig {
  activeSecret: string
  previousSecret?: string | null
  previousSecretExpiresAt?: string | null
}

export interface WebhookValidationResult {
  valid: boolean
  error?: string
  timestamp?: number
  usedPreviousSecret?: boolean
}

/**
 * Validates HMAC-SHA256 signature and timestamp freshness for inbound webhooks
 * against the exact raw request body string.
 * Supports active secret verification and seamless grace-period verification for rotated secrets.
 */
export function validateWebhookSignature(options: {
  rawBody: string
  signatureHeader: string | null
  timestampHeader?: string | null
  secret: string | WebhookSecretConfig
  toleranceSeconds?: number
}): WebhookValidationResult {
  const { rawBody, signatureHeader, timestampHeader, secret } = options
  const tolerance = options.toleranceSeconds ?? DEFAULT_TIMESTAMP_TOLERANCE_SECONDS

  const activeSecret = typeof secret === 'string' ? secret : secret.activeSecret
  if (!activeSecret) {
    return { valid: false, error: 'Connection webhook secret is not configured' }
  }

  if (!signatureHeader || typeof signatureHeader !== 'string') {
    return { valid: false, error: 'Missing or empty webhook signature header' }
  }

  let parsedTimestamp: number | null = null

  // 1. Timestamp Freshness Check
  if (timestampHeader) {
    let tsNum = Number(timestampHeader)
    if (isNaN(tsNum)) {
      const parsedDate = Date.parse(timestampHeader)
      if (!isNaN(parsedDate)) {
        tsNum = Math.floor(parsedDate / 1000)
      }
    } else if (tsNum > 1e11) {
      tsNum = Math.floor(tsNum / 1000)
    }

    if (isNaN(tsNum) || tsNum <= 0) {
      return { valid: false, error: 'Invalid webhook timestamp format' }
    }

    parsedTimestamp = tsNum
    const currentSeconds = Math.floor(Date.now() / 1000)
    const drift = Math.abs(currentSeconds - tsNum)

    if (drift > tolerance) {
      return {
        valid: false,
        error: `Webhook timestamp expired or skewed (${drift}s drift exceeds ${tolerance}s tolerance)`,
        timestamp: tsNum,
      }
    }
  }

  // 2. Extract raw signature hex
  let receivedHex = signatureHeader.trim()
  if (receivedHex.startsWith('sha256=')) {
    receivedHex = receivedHex.slice('sha256='.length)
  } else if (receivedHex.includes('v1=')) {
    // Format: t=123456,v1=hex
    const parts = receivedHex.split(',')
    const v1Part = parts.find((p) => p.trim().startsWith('v1='))
    if (v1Part) {
      receivedHex = v1Part.trim().slice('v1='.length)
    }
  }

  if (!/^[0-9a-fA-F]{64}$/.test(receivedHex)) {
    return { valid: false, error: 'Malformed webhook signature (expected 64-character hex)' }
  }

  // Helper to verify a single secret against exact rawBody
  const verifyWithSecret = (sec: string): boolean => {
    const candidates: string[] = []
    if (timestampHeader) {
      candidates.push(
        crypto.createHmac('sha256', sec).update(`${timestampHeader}.${rawBody}`, 'utf8').digest('hex')
      )
      if (parsedTimestamp !== null) {
        candidates.push(
          crypto.createHmac('sha256', sec).update(`${parsedTimestamp}.${rawBody}`, 'utf8').digest('hex')
        )
      }
    }
    candidates.push(crypto.createHmac('sha256', sec).update(rawBody, 'utf8').digest('hex'))

    const receivedBuf = Buffer.from(receivedHex.toLowerCase(), 'hex')
    for (const expectedHex of candidates) {
      const expectedBuf = Buffer.from(expectedHex.toLowerCase(), 'hex')
      if (receivedBuf.length === expectedBuf.length && crypto.timingSafeEqual(receivedBuf, expectedBuf)) {
        return true
      }
    }
    return false
  }

  // 3. Test primary active secret
  if (verifyWithSecret(activeSecret)) {
    return {
      valid: true,
      timestamp: parsedTimestamp ?? undefined,
      usedPreviousSecret: false,
    }
  }

  // 4. Test unexpired previous secret if rotating
  if (typeof secret === 'object' && secret.previousSecret) {
    const isExpired =
      secret.previousSecretExpiresAt &&
      Date.parse(secret.previousSecretExpiresAt) <= Date.now()

    if (!isExpired && verifyWithSecret(secret.previousSecret)) {
      return {
        valid: true,
        timestamp: parsedTimestamp ?? undefined,
        usedPreviousSecret: true,
      }
    }
  }

  return { valid: false, error: 'Invalid webhook signature: HMAC-SHA256 mismatch' }
}

// ---------------------------------------------------------------------------
// Rate Limiter Re-Exports for Distributed Vercel Serverless Execution
// ---------------------------------------------------------------------------

export {
  checkDistributedRateLimit,
  type RateLimitResult,
  type RateLimitAdapter,
  resetLocalRateLimiter,
}
