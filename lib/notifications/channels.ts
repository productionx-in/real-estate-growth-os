// lib/notifications/channels.ts
// External delivery channels for notifications. In-app delivery needs no adapter: the notification row IS the
// in-app message. Web push and WhatsApp register adapters here in later milestones (M1-6, M1-7).
export interface NotificationRecord {
  id: string
  org_id: string
  recipient_profile_id: string
  type: string
  title: string
  body: string
  lead_id: string | null
  data: unknown
}

export type DeliveryOutcome =
  | { status: 'sent'; providerMessageId?: string }
  | { status: 'skipped'; detail: string }        // e.g. recipient has no device / no opt-in
// A thrown error means a transient failure: the job is retried with backoff.

export interface ChannelAdapter {
  channel: 'push' | 'whatsapp' | 'email'
  /** False when the channel is not configured in this environment (missing keys). */
  isConfigured(): boolean
  deliver(notification: NotificationRecord): Promise<DeliveryOutcome>
}

const adapters: ChannelAdapter[] = []

export function registerChannelAdapter(adapter: ChannelAdapter): void {
  if (!adapters.some((a) => a.channel === adapter.channel)) adapters.push(adapter)
}

export function getChannelAdapters(): readonly ChannelAdapter[] {
  return adapters
}

/** Test helper: reset the registry between test cases. */
export function clearChannelAdapters(): void {
  adapters.length = 0
}
