// lib/integrations/whatsapp/auto-reply.ts
// Automatic WhatsApp replies (Settings → WhatsApp, 20260089). Plain rules here; the processor sends.
//
//   welcome — the buyer's first message to the workspace's number, during business hours.
//   away    — any message outside business hours (India time), at most once every 12 hours per buyer.
// Never: after STOP/START (the consent reply is Meta's and the buyer's), to an opted-out buyer, or for a webhook
// retry of a message already recorded. Both replies are free text, allowed because the buyer has just written
// (inside WhatsApp's 24-hour customer-care window).
import type { WhatsAppSettings } from '@/lib/settings/workspace'

export const AWAY_GAP_MS = 12 * 60 * 60 * 1000

/** Day of week (0 = Sunday) and hour in India. */
export function indiaClock(now: Date): { day: number; hour: number } {
  const ist = new Date(now.getTime() + 330 * 60_000)
  return { day: ist.getUTCDay(), hour: ist.getUTCHours() }
}

export function isBusinessHours(s: Pick<WhatsAppSettings, 'hoursStart' | 'hoursEnd' | 'workDays'>, now: Date): boolean {
  const { day, hour } = indiaClock(now)
  return s.workDays.includes(day) && hour >= s.hoursStart && hour < s.hoursEnd
}

export interface AutoReplyInput {
  settings: WhatsAppSettings
  /** The conversation did not exist before this message. */
  firstMessage: boolean
  /** The message was STOP / START (or another consent keyword). */
  consentKeyword: boolean
  optedOut: boolean
  /** This message was newly recorded (not a webhook retry). */
  newMessage: boolean
  lastAutoReplyAt: Date | null
  now: Date
}

export function decideAutoReply(i: AutoReplyInput): { kind: 'welcome' | 'away'; template: string } | null {
  if (!i.newMessage || i.consentKeyword || i.optedOut) return null
  const s = i.settings
  if (!isBusinessHours(s, i.now)) {
    if (!s.awayEnabled) return null
    if (i.lastAutoReplyAt && i.now.getTime() - i.lastAutoReplyAt.getTime() < AWAY_GAP_MS) return null
    return { kind: 'away', template: s.awayMessage }
  }
  if (s.welcomeEnabled && i.firstMessage && !i.lastAutoReplyAt) return { kind: 'welcome', template: s.welcomeMessage }
  return null
}

/** {{first_name}} from the buyer's WhatsApp profile name; "there" when there is none. */
export function fillAutoReply(template: string, profileName: string | null | undefined): string {
  const w = (profileName ?? '').trim().split(/\s+/)[0]?.replace(/[^\p{L}\p{M}'-]/gu, '') ?? ''
  const first = w.length >= 2 ? w[0].toUpperCase() + w.slice(1, 40) : 'there'
  return template.replace(/\{\{\s*first_name\s*\}\}/gi, first).slice(0, 1000)
}
