// lib/integrations/outbound/dispatcher.ts
// Outbound webhook dispatcher: signs payloads and delivers events to customer endpoints.

import { createServiceClient } from '@/lib/supabase/server'
import { decryptCredential } from '@/lib/integrations/crypto'
import { signOutboundWebhookPayload } from './signer'
import type { WebhookEventType } from './types'

export interface DispatchWebhookResult {
  dispatchedCount: number
  failedCount: number
  errors: string[]
}

/**
 * Dispatches an event to all subscribed customer endpoints for an organisation.
 */
export async function dispatchOutboundWebhook(params: {
  orgId: string
  eventType: WebhookEventType
  payload: Record<string, unknown>
  timeoutMs?: number
}): Promise<DispatchWebhookResult> {
  const { orgId, eventType, payload, timeoutMs = 5000 } = params
  const service = createServiceClient()
  const summary: DispatchWebhookResult = { dispatchedCount: 0, failedCount: 0, errors: [] }

  // 1. Fetch active subscriptions for this org
  let subscriptions: Array<{
    id: string
    url: string
    secret_ref: string | null
    event_types: string[]
  }> = []

  try {
    const { data } = await service
      .from('webhook_subscriptions')
      .select('id, url, secret_ref, event_types')
      .eq('org_id', orgId)
      .eq('is_active', true)

    subscriptions = data || []
  } catch {
    // Staged table fallback
    return summary
  }

  // Filter subscriptions that listen to this event
  const matched = subscriptions.filter(
    (s) => s.event_types?.includes(eventType) || s.event_types?.includes('*')
  )

  if (matched.length === 0) return summary

  const payloadString = JSON.stringify({
    event: eventType,
    orgId,
    timestamp: new Date().toISOString(),
    data: payload,
  })

  // 2. Deliver to each endpoint
  for (const sub of matched) {
    let secret = 'px_wh_default_signing_secret'
    if (sub.secret_ref) {
      try {
        secret = decryptCredential(sub.secret_ref)
      } catch {
        // Fallback to default
      }
    }

    const signatureHeaders = signOutboundWebhookPayload({
      payload: payloadString,
      secret,
    })

    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)

      const res = await fetch(sub.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'ProductionX-Webhooks/1.0',
          'x-px-event': eventType,
          ...signatureHeaders,
        },
        body: payloadString,
        signal: controller.signal,
      })

      clearTimeout(timer)

      const success = res.ok
      if (success) {
        summary.dispatchedCount++
      } else {
        summary.failedCount++
        summary.errors.push(`Endpoint ${sub.url} returned HTTP ${res.status}`)
      }

      // Log delivery attempt
      try {
        await service.from('webhook_delivery_logs').insert({
          org_id: orgId,
          subscription_id: sub.id,
          event_type: eventType,
          payload: { event: eventType, data: payload } as unknown as import('@/types/database').Json,
          response_status: res.status,
          attempt: 1,
          success,
        })
      } catch {
        // Non-blocking log insert
      }
    } catch (err: unknown) {
      summary.failedCount++
      const msg = err instanceof Error ? err.message : String(err)
      summary.errors.push(`Delivery failed to ${sub.url}: ${msg}`)

      try {
        await service.from('webhook_delivery_logs').insert({
          org_id: orgId,
          subscription_id: sub.id,
          event_type: eventType,
          payload: { event: eventType, data: payload } as unknown as import('@/types/database').Json,
          response_status: 0,
          attempt: 1,
          success: false,
          error_message: msg,
        })
      } catch {
        // Non-blocking
      }
    }
  }

  return summary
}
