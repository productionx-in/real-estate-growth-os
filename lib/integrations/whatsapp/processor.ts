// lib/integrations/whatsapp/processor.ts
// End-to-end inbound webhook event processor for WhatsApp Business Cloud API.
// Orchestrates lead ingestion, Click-to-WhatsApp referral attribution,
// conversation-to-lead association, message status updates, and consent compliance.

import { createServiceClient } from '@/lib/supabase/server'
import { processInboundLead } from '@/lib/integrations/inbound'
import { normalizeWhatsAppInboundMessage } from './normalizer'
import { evaluateConsentKeyword } from './consent'
import { recordWhatsAppConsent } from '@/lib/dal/campaigns'
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

          // A conversation already linked to a lead keeps that lead: later messages in the chat are part of
          // the same enquiry, not new leads (each would otherwise become a duplicate lead and pull the
          // conversation away from the salesperson who owns it). Only a buyer's first message, or a
          // conversation whose lead was removed, goes through the CRM's lead pipeline.
          const { data: existingConv } = await service
            .from('whatsapp_conversations')
            .select('id, lead_id')
            .eq('org_id', connection.org_id)
            .eq('connection_id', connection.id)
            .eq('wa_id', msg.from)
            .maybeSingle()
          const leadResult = existingConv?.lead_id
            ? { leadId: existingConv.lead_id as string, isDuplicate: false }
            : await processInboundLead(connection.org_id, normalizedPayload, { customClient: service })

          // Update / Record Conversation & Message in WhatsApp tables (resilient to schema availability)
          try {
            const waId = msg.from
            const leadId = leadResult.leadId || null

            // Upsert conversation record. Opt-out changes only on STOP / START keywords: an ordinary
            // message after STOP must not silently opt the buyer back in.
            const now = new Date().toISOString()
            const consentChange = consentResult.isOptOutKeyword
              ? { is_opted_out: true, opted_out_at: now }
              : consentResult.isOptInKeyword
              ? { is_opted_out: false, opted_out_at: null }
              : {}
            const contactName = (contact?.profile?.name || '').trim().slice(0, 120)
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
                  ...consentChange,
                  ...(contactName ? { contact_name: contactName } : {}),
                  last_inbound_at: now,
                  updated_at: now,
                },
                { onConflict: 'org_id,connection_id,wa_id' as never }
              )
              .select('id')
              .maybeSingle()

            const convId = conv?.id || null

            // STOP / START also update the workspace's marketing opt-out list, so campaigns respect them (20260088).
            if (consentResult.isOptOutKeyword || consentResult.isOptInKeyword) {
              await recordWhatsAppConsent(connection.org_id, waId, consentResult.isOptOutKeyword).catch((e) =>
                console.error('[whatsapp] could not record the marketing opt-out:', e instanceof Error ? e.message : e))
            }

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
