// lib/integrations/whatsapp/validator.ts
// Cryptographic webhook verification for WhatsApp Cloud API.
// Validates GET subscription challenges and POST HMAC-SHA256 signatures against exact raw bytes.

import crypto from 'node:crypto'

/**
 * Validates Meta WhatsApp Webhook GET verification challenge.
 */
export function verifyWhatsAppWebhookChallenge(params: {
  mode: string | null
  token: string | null
  challenge: string | null
  expectedToken: string
}): { isValid: boolean; challenge?: string } {
  const { mode, token, challenge, expectedToken } = params

  if (mode !== 'subscribe' || !challenge || !token) {
    return { isValid: false }
  }

  // Timing-safe comparison to prevent timing attacks
  const tokenBuf = Buffer.from(token, 'utf8')
  const expectedBuf = Buffer.from(expectedToken, 'utf8')

  if (tokenBuf.length !== expectedBuf.length) {
    return { isValid: false }
  }

  const matches = crypto.timingSafeEqual(tokenBuf, expectedBuf)
  return { isValid: matches, challenge: matches ? challenge : undefined }
}

/**
 * Validates Meta WhatsApp Webhook POST HMAC-SHA256 signature against exact unparsed bytes.
 */
export function verifyWhatsAppWebhookSignature(params: {
  rawBody: string | Buffer
  signatureHeader: string | null
  appSecret: string
}): boolean {
  const { rawBody, signatureHeader, appSecret } = params

  if (!signatureHeader || !appSecret) {
    return false
  }

  if (!signatureHeader.startsWith('sha256=')) {
    return false
  }

  const signatureHex = signatureHeader.slice('sha256='.length).trim()
  if (!signatureHex) {
    return false
  }

  try {
    const hmac = crypto.createHmac('sha256', appSecret)
    hmac.update(rawBody)
    const expectedHex = hmac.digest('hex')

    const sigBuf = Buffer.from(signatureHex, 'hex')
    const expBuf = Buffer.from(expectedHex, 'hex')

    if (sigBuf.length !== expBuf.length) {
      return false
    }

    return crypto.timingSafeEqual(sigBuf, expBuf)
  } catch {
    return false
  }
}
