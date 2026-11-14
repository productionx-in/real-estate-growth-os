// lib/integrations/outbound/signer.ts
// Cryptographic HMAC-SHA256 signing and timestamp verification for customer outbound webhooks.

import crypto from 'node:crypto'

export interface OutboundSignatureHeaders {
  'x-px-signature-256': string
  'x-px-timestamp': string
}

/**
 * Computes an HMAC-SHA256 signature for an outbound webhook payload bound to a timestamp.
 */
export function signOutboundWebhookPayload(params: {
  payload: string | Buffer
  secret: string
  timestamp?: number
}): OutboundSignatureHeaders {
  const { payload, secret, timestamp = Math.floor(Date.now() / 1000) } = params
  const payloadStr = Buffer.isBuffer(payload) ? payload.toString('utf8') : payload
  const signedData = `${timestamp}.${payloadStr}`

  const hmac = crypto.createHmac('sha256', secret)
  hmac.update(signedData)
  const signatureHex = hmac.digest('hex')

  return {
    'x-px-signature-256': `sha256=${signatureHex}`,
    'x-px-timestamp': String(timestamp),
  }
}

/**
 * Verifies an outbound webhook signature on the receiving client side.
 */
export function verifyOutboundWebhookSignature(params: {
  payload: string
  signatureHeader: string | null | undefined
  timestampHeader: string | null | undefined
  secret: string
  toleranceSeconds?: number
  nowSeconds?: number
}): { valid: boolean; reason?: string } {
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

  // Replay & clock-skew defense
  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) {
    return { valid: false, reason: `Timestamp outside tolerance window of ${toleranceSeconds}s` }
  }

  if (!signatureHeader.startsWith('sha256=')) {
    return { valid: false, reason: 'Invalid signature prefix, expected sha256=' }
  }

  const expectedSigHex = signatureHeader.slice('sha256='.length).trim()
  const signedData = `${timestamp}.${payload}`
  const hmac = crypto.createHmac('sha256', secret)
  hmac.update(signedData)
  const actualSigHex = hmac.digest('hex')

  const expectedBuf = Buffer.from(expectedSigHex, 'hex')
  const actualBuf = Buffer.from(actualSigHex, 'hex')

  if (expectedBuf.length !== actualBuf.length) {
    return { valid: false, reason: 'Signature mismatch' }
  }

  const matches = crypto.timingSafeEqual(expectedBuf, actualBuf)
  return { valid: matches, reason: matches ? undefined : 'Cryptographic signature mismatch' }
}
