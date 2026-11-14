// lib/integrations/whatsapp/processor.ts
// End-to-end inbound webhook event processor for WhatsApp Business Cloud API.
// Orchestrates lead ingestion, Click-to-WhatsApp referral attribution,
// conversation-to-lead association, message status updates, and consent compliance.

import { createServiceClient } from '@/lib/supabase/server'
import { processInboundLead } from '@/lib/integrations/inbound'
import { normalizeWhatsAppInboundMessage } from './normalizer'
import { evaluateConsentKeyword } from './consent'
import type {
  WhatsAppWebhookPayload,
} from './types'

export interface WhatsAppProcessingSummary {
  processedMessages: number
  processedStatuses: number
  optOutEvents: number
  errors: string[]
}

/**
 * Processes a verified Meta WhatsApp Business Cloud API webhook payload.
 */
export async function processWhatsAppWebhookPayload(params: {
  connectionId: string
  payload: WhatsAppWebhookPayload
  customServiceClient?: ReturnType<typeof createServiceClient>
}): Promise<WhatsAppProcessingSummary> {
  const { connectionId, payload, customServiceClient } = params
  const service = customServiceClient || createServiceClient()

  const summary: WhatsAppProcessingSummary = {
    processedMessages: 0,
    processedStatuses: 0,
    optOutEvents: 0,
    errors: [],
  }

  // 1. Fetch and verify connection
  const { data: connection, error: connErr } = await service
    .from('integration_connections')
    .select('id, org_id, status, provider, metadata')
    .eq('id', connectionId)
    .maybeSingle()

  if (connErr || !connection) {
    summary.errors.push('Integration connection not found.')
    return summary
  }

  if (connection.status !== 'connected') {
    summary.errors.push(`Connection is in ${connection.status} state. Processing halted.`)
    return summary
  }

  // 2. Iterate through webhook entries
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      const val = change.value
      if (!val || val.messaging_product !== 'whatsapp') continue

      const phoneNumberId = val.metadata?.phone_number_id || ''
      const displayPhone = val.metadata?.display_phone_number || ''
      const contacts = val.contacts || []

      // ── Process Inbound Messages ──────────────────────────────────────────
      for (const msg of val.messages || []) {
        try {
          const contact = contacts.find((c) => c.wa_id === msg.from)
          const textContent = msg.text?.body || msg.button?.text || ''

          // Check for consent keywords (STOP, UNSUBSCRIBE, START, etc.)
          const consentResult = evaluateConsentKeyword(textContent)
          if (consentResult.isOptOutKeyword) {
            summary.optOutEvents++
          }

          // Normalize message into canonical InboundLeadPayload
          const normalizedPayload = normalizeWhatsAppInboundMessage({
            connectionId: connection.id,
            phoneNumberId,
            displayPhoneNumber: displayPhone,
            contact,
            message: msg,
          })

          // Ingest lead into CRM through unified pipeline
          const leadResult = await processInboundLead(connection.org_id, normalizedPayload, {
            customClient: service,
          })

          // Update / Record Conversation & Message in WhatsApp tables (resilient to schema availability)
          try {
            const waId = msg.from
            const leadId = leadResult.leadId || null

            // Upsert conversation record
            const { data: conv } = await service
              .from('whatsapp_conversations')
              .upsert(
                {
                  org_id: connection.org_id,
                  connection_id: connection.id,
                  wa_id: waId,
                  phone_number_id: phoneNumberId,
                  lead_id: leadId,
                  status: 'open',
                  is_opted_out: consentResult.isOptOutKeyword
                    ? true
                    : consentResult.isOptInKeyword
                    ? false
                    : false,
                  last_inbound_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                },
                { onConflict: 'org_id,connection_id,wa_id' as never }
              )
              .select('id')
              .maybeSingle()

            const convId = conv?.id || null

            // Insert message record
            await service.from('whatsapp_messages').insert({
              org_id: connection.org_id,
              conversation_id: convId,
              lead_id: leadId,
              wamid: msg.id,
              direction: 'inbound',
              message_type: msg.type,
              body: textContent || `[${msg.type.toUpperCase()}]`,
              referral_metadata: (msg.referral as unknown as Record<string, unknown>) || null,
              delivery_status: 'delivered',
              received_at: new Date(Number(msg.timestamp) * 1000).toISOString(),
            })
          } catch {
            // Non-blocking: conversation table storage is optional/staged
          }

          // Safe audit event logging
          await service.from('integration_event_logs').insert({
            org_id: connection.org_id,
            connection_id: connection.id,
            provider: 'whatsapp_cloud',
            event_type: consentResult.isOptOutKeyword
              ? 'whatsapp_opt_out_received'
              : 'whatsapp_message_received',
            external_event_id: msg.id,
            processing_status: leadResult.isDuplicate ? 'duplicate' : 'processed',
            lead_id: leadResult.leadId ?? null,
            processed_at: new Date().toISOString(),
          })

          summary.processedMessages++
        } catch (err: unknown) {
          summary.errors.push(
            `Failed to process message ${msg.id}: ${err instanceof Error ? err.message : String(err)}`
          )
        }
      }

      // ── Process Message Status Updates (Delivery Receipts) ─────────────────
      for (const status of val.statuses || []) {
        try {
          try {
            await service
              .from('whatsapp_messages')
              .update({
                delivery_status: status.status,
                updated_at: new Date().toISOString(),
              })
              .eq('wamid', status.id)
              .eq('org_id', connection.org_id)
          } catch {
            // Non-blocking
          }

          await service.from('integration_event_logs').insert({
            org_id: connection.org_id,
            connection_id: connection.id,
            provider: 'whatsapp_cloud',
            event_type: `whatsapp_status_${status.status}`,
            external_event_id: status.id,
            processing_status: status.status === 'failed' ? 'failed' : 'processed',
            error_message: status.errors ? JSON.stringify(status.errors) : null,
            processed_at: new Date().toISOString(),
          })

          summary.processedStatuses++
        } catch (err: unknown) {
          summary.errors.push(
            `Failed to process status ${status.id}: ${err instanceof Error ? err.message : String(err)}`
          )
        }
      }
    }
  }

  return summary
}
