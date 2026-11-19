// lib/notifications/push.ts
// Web Push channel (M1-6). Sends each notification to every device the recipient enabled alerts on.
// Configured by VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT; without them the channel is skipped.
import { appUrl as appOrigin } from '@/lib/site/urls'
import webpush, { WebPushError } from 'web-push'
import { createServiceClient } from '@/lib/supabase/server'
import type { ChannelAdapter, DeliveryOutcome, NotificationRecord } from './channels'

export function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY?.trim() || null
}

function vapidConfig() {
  const publicKey = vapidPublicKey()
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim()
  const subject = process.env.VAPID_SUBJECT?.trim() || 'mailto:alerts@regrow.app'
  return publicKey && privateKey ? { publicKey, privateKey, subject } : null
}

/** Payload the service worker (public/sw.js) renders. Kept small: push services cap payloads at ~4 KB. */
export function buildPushPayload(n: NotificationRecord, appUrl: string, orgSlug: string | null): string {
  const url = n.lead_id && orgSlug ? `${appUrl}/${orgSlug}/leads/${n.lead_id}` : `${appUrl}/select-org`
  return JSON.stringify({ title: n.title.slice(0, 120), body: n.body.slice(0, 300), url, tag: n.lead_id ?? n.id, notificationId: n.id })
}

const GONE = new Set([404, 410])
const MAX_FAILURES = 20

export const pushAdapter: ChannelAdapter = {
  channel: 'push',
  isConfigured: () => vapidConfig() !== null,
  async deliver(notification: NotificationRecord): Promise<DeliveryOutcome> {
    const cfg = vapidConfig()
    if (!cfg) return { status: 'skipped', detail: 'push not configured' }
    const db = createServiceClient()
    const { data: subs, error } = await db.from('push_subscriptions')
      .select('id, endpoint, p256dh, auth, failure_count').eq('profile_id', notification.recipient_profile_id)
    if (error) throw new Error(`push: load subscriptions failed: ${error.message}`)
    if (!subs?.length) return { status: 'skipped', detail: 'no push subscription' }

    const appUrl = appOrigin() ?? ''
    const { data: org } = await db.from('organisations').select('slug').eq('id', notification.org_id).maybeSingle()
    const payload = buildPushPayload(notification, appUrl, org?.slug ?? null)
    let sent = 0
    const transient: string[] = []
    for (const s of subs) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
          vapidDetails: cfg, TTL: 60 * 60, urgency: 'high',
        })
        sent++
        await db.from('push_subscriptions').update({ last_success_at: new Date().toISOString(), failure_count: 0 }).eq('id', s.id)
      } catch (err) {
        if (err instanceof WebPushError && GONE.has(err.statusCode)) {
          await db.from('push_subscriptions').delete().eq('id', s.id) // device unsubscribed or expired
        } else {
          transient.push(err instanceof Error ? err.message : String(err))
          // A device that keeps failing is dropped so it cannot hold up delivery to the user's other devices forever.
          if (s.failure_count + 1 >= MAX_FAILURES) await db.from('push_subscriptions').delete().eq('id', s.id)
          else await db.from('push_subscriptions').update({ failure_count: s.failure_count + 1 }).eq('id', s.id)
        }
      }
    }
    if (sent > 0) return { status: 'sent' }
    if (transient.length > 0) throw new Error(`push: ${transient[0]}`) // retry later
    return { status: 'skipped', detail: 'all subscriptions expired' }
  },
}
