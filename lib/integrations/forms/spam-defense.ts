// lib/integrations/forms/spam-defense.ts
// Multi-layer anti-spam and bot defense for public website enquiry forms.
// Protects against automated form fillers without friction for human home buyers.

import type { EnquirySubmissionInput, SpamEvaluationResult } from './types'

const MIN_HUMAN_FILL_TIME_MS = 1200 // Humans take >1.2s to fill a real estate enquiry form
const SPAM_LINK_REGEX = /\[url=|<a\s+href=|<script|viagra|casino|poker|crypto\s+doubler|seo\s+ranking/i
const REPETITIVE_DIGITS_REGEX = /^(\d)\1{9,11}$/ // e.g. 0000000000, 1111111111
const SEQUENTIAL_DIGITS_REGEX = /^(1234567890|0123456789|9876543210)$/

/**
 * Evaluates whether an inbound website enquiry submission is automated spam.
 */
export function evaluateSpamSubmission(input: EnquirySubmissionInput): SpamEvaluationResult {
  // 1. Honeypot Field Verification (Invisible to humans, automatically filled by dumb bots)
  const hp1 = typeof input.hpConfirm === 'string' ? input.hpConfirm.trim() : ''
  const hp2 = typeof input.website_url_hp === 'string' ? input.website_url_hp.trim() : ''
  const hp3 = typeof (input as Record<string, unknown>)._hp_field === 'string' ? String((input as Record<string, unknown>)._hp_field).trim() : ''

  if (hp1 || hp2 || hp3) {
    return {
      isSpam: true,
      reason: 'Honeypot field filled by automated submission agent',
    }
  }

  // 2. Submission Speed Check (Time-to-Fill)
  if (typeof input.formLoadTime === 'number' && input.formLoadTime > 0) {
    const now = Date.now()
    const fillDuration = now - input.formLoadTime

    // Submissions filled in under 1.2s are guaranteed automated scripts
    if (fillDuration > 0 && fillDuration < MIN_HUMAN_FILL_TIME_MS) {
      return {
        isSpam: true,
        reason: `Suspicious submission speed: filled in ${fillDuration}ms (threshold: ${MIN_HUMAN_FILL_TIME_MS}ms)`,
      }
    }
  }

  // 3. Known Bot Text & Link Injection Patterns
  const combinedText = `${input.name || ''} ${input.notes || ''} ${input.email || ''}`
  if (SPAM_LINK_REGEX.test(combinedText)) {
    return {
      isSpam: true,
      reason: 'Spam keywords or link injection tags detected in submission text',
    }
  }

  // 4. Garbage / Repeated Phone Number Check
  const cleanedPhone = (input.phone || '').replace(/\D/g, '')
  if (REPETITIVE_DIGITS_REGEX.test(cleanedPhone) || SEQUENTIAL_DIGITS_REGEX.test(cleanedPhone)) {
    return {
      isSpam: true,
      reason: 'Garbage or test sequence phone number provided',
    }
  }

  return { isSpam: false }
}
