// lib/integrations/whatsapp/consent.ts
// Customer consent, opt-in and opt-out management for WhatsApp Business integration.
// Enforces WhatsApp Messaging Policy, TRAI/DND guidelines, and outbound message gating.

import type { ConsentStatus } from './types'

export const OPT_OUT_KEYWORDS = new Set([
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

export const OPT_IN_KEYWORDS = new Set([
  'start',
  'yes',
  'opt in',
  'optin',
  'unstop',
  'subscribe',
])

export interface ConsentEvaluationResult {
  isOptOutKeyword: boolean
  isOptInKeyword: boolean
  resultingStatus: ConsentStatus
  keywordMatched?: string
}

/**
 * Checks if incoming message text contains standard WhatsApp consent keywords.
 */
export function evaluateConsentKeyword(text: string): ConsentEvaluationResult {
  const normalized = (text || '').trim().toLowerCase()

  if (OPT_OUT_KEYWORDS.has(normalized)) {
    return {
      isOptOutKeyword: true,
      isOptInKeyword: false,
      resultingStatus: 'opted_out',
      keywordMatched: normalized,
    }
  }

  if (OPT_IN_KEYWORDS.has(normalized)) {
    return {
      isOptOutKeyword: false,
      isOptInKeyword: true,
      resultingStatus: 'opted_in',
      keywordMatched: normalized,
    }
  }

  return {
    isOptOutKeyword: false,
    isOptInKeyword: false,
    resultingStatus: 'unknown',
  }
}

/**
 * Verifies if an outbound message can be legally sent to a contact under WhatsApp policy.
 */
export function canSendOutboundMessage(params: {
  isOptedOut: boolean
  lastInboundTimestamp?: number | null // epoch ms
  isTemplateMessage: boolean
  now?: number
}): { allowed: boolean; reason?: string } {
  const { isOptedOut, lastInboundTimestamp, isTemplateMessage, now = Date.now() } = params

  // 1. Strict Opt-Out Block
  if (isOptedOut) {
    return {
      allowed: false,
      reason: 'Customer has opted out of WhatsApp communications. Outbound messages are prohibited.',
    }
  }

  // 2. WhatsApp 24-Hour Customer Care Window Evaluation
  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000
  const isInside24hWindow =
    typeof lastInboundTimestamp === 'number' &&
    lastInboundTimestamp > 0 &&
    now - lastInboundTimestamp <= TWENTY_FOUR_HOURS_MS

  // Outside 24-hour window, ONLY pre-approved templates are permitted by Meta
  if (!isInside24hWindow && !isTemplateMessage) {
    return {
      allowed: false,
      reason:
        'Outside the 24-hour customer service window. Only pre-approved WhatsApp message templates can be sent.',
    }
  }

  return { allowed: true }
}
