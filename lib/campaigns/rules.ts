// lib/campaigns/rules.ts
// Marketing campaigns (20260088): the plain rules — who may run them, how an address is normalised, who is skipped
// and why, and how the message is personalised. No server dependencies; safe for client and server files.
//
// What a campaign never does: send to someone who opted out (checked when recipients are chosen and again at the
// moment of sending), send to junk leads, send twice to the same address, or send a WhatsApp message that is not an
// approved MARKETING template. Every e-mail carries a working unsubscribe link.
import type { MemberRole } from '@/types/database'
import { MANAGER_ROLES } from '@/lib/leads/view-filters'

export type Channel = 'email' | 'whatsapp'
export type CampaignStatus = 'draft' | 'sending' | 'sent' | 'cancelled'
export type RecipientStatus = 'queued' | 'sent' | 'skipped' | 'failed'
export type SkipReason = 'no_address' | 'invalid_address' | 'opted_out' | 'duplicate' | 'junk'

export const MAX_RECIPIENTS = 5000
/** WhatsApp messages sent per job run (the worker runs every minute); keeps well inside Meta's throughput limits. */
export const WHATSAPP_BATCH = 60

export const CHANNEL_LABEL: Record<Channel, string> = { email: 'E-mail', whatsapp: 'WhatsApp' }
export const STATUS_LABEL: Record<CampaignStatus, string> = { draft: 'Draft', sending: 'Sending', sent: 'Sent', cancelled: 'Cancelled' }
export const SKIP_LABEL: Record<SkipReason, string> = {
  no_address: 'No e-mail or phone number',
  invalid_address: 'Address not valid',
  opted_out: 'Opted out of marketing',
  duplicate: 'Same address as another lead',
  junk: 'Marked as junk',
}

/** Owners, admins and managers create, send and cancel campaigns (the API and database check again). */
export function canRunCampaigns(role: MemberRole | null | undefined): boolean {
  return !!role && MANAGER_ROLES.includes(role)
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export function normalizeEmailAddress(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const e = raw.trim().toLowerCase()
  return e.length <= 320 && EMAIL.test(e) ? e : null
}

/**
 * A phone number as WhatsApp expects it: digits only, with the country code. Indian numbers written without a
 * country code (10 digits starting 6–9, or with a leading 0) get 91. Anything else must already carry its code.
 */
export function normalizeWhatsAppNumber(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const hasPlus = raw.trim().startsWith('+')
  let d = raw.replace(/\D/g, '')
  if (!hasPlus) {
    if (d.length === 11 && d.startsWith('0') && /^[6-9]/.test(d.slice(1))) d = `91${d.slice(1)}`
    else if (d.length === 10 && /^[6-9]/.test(d)) d = `91${d}`
    else if (d.startsWith('00')) d = d.slice(2)
  }
  return /^[1-9][0-9]{7,14}$/.test(d) ? d : null
}

export function addressFor(channel: Channel, lead: { email?: string | null; phone?: string | null }): string | null {
  return channel === 'email' ? normalizeEmailAddress(lead.email) : normalizeWhatsAppNumber(lead.phone)
}

/** The first word of a name, for "Hi {{first_name}}" (letters only; a number or blank becomes null). */
export function firstNameOf(name: unknown): string | null {
  if (typeof name !== 'string') return null
  const w = name.trim().split(/\s+/)[0] ?? ''
  const clean = w.replace(/[^\p{L}\p{M}'-]/gu, '').slice(0, 60)
  return clean.length >= 2 ? clean[0].toUpperCase() + clean.slice(1) : null
}

export interface Candidate { leadId: string; name: string | null; email: string | null; phone: string | null; status: string }
export interface Planned { leadId: string; address: string; firstName: string | null; status: 'queued' | 'skipped'; skipReason: SkipReason | null }

/**
 * Who gets the campaign, decided once when sending starts: one row per address (the first lead with it wins; the
 * others are recorded as duplicates), opted-out and junk leads skipped. A lead without a usable address is recorded
 * as skipped with an empty address keyed by the lead, so the report shows everyone in the segment.
 */
export function planRecipients(channel: Channel, candidates: Candidate[], suppressed: ReadonlySet<string>): Planned[] {
  const seen = new Set<string>()
  const out: Planned[] = []
  for (const c of candidates) {
    const raw = channel === 'email' ? c.email : c.phone
    const address = addressFor(channel, c)
    const firstName = firstNameOf(c.name)
    const skip = (reason: SkipReason, addr: string) => out.push({ leadId: c.leadId, address: addr, firstName, status: 'skipped', skipReason: reason })
    if (!address) { skip(raw && raw.trim() ? 'invalid_address' : 'no_address', `lead:${c.leadId}`); continue }
    if (seen.has(address)) { skip('duplicate', `dup:${c.leadId}`); continue }
    seen.add(address)
    if (c.status === 'junk') skip('junk', address)
    else if (suppressed.has(address)) skip('opted_out', address)
    else out.push({ leadId: c.leadId, address, firstName, status: 'queued', skipReason: null })
  }
  return out
}

/** Fills {{first_name}} (falls back to "there": "Hi there"). Only that one placeholder exists. */
export function personalise(text: string, firstName: string | null): string {
  return text.replace(/\{\{\s*first_name\s*\}\}/gi, firstName ?? 'there')
}

/** Placeholders other than {{first_name}} in an e-mail are mistakes; the API refuses them. */
export function unknownPlaceholders(text: string): string[] {
  return [...text.matchAll(/\{\{\s*([^}]*?)\s*\}\}/g)].map((m) => m[1]).filter((p) => p.toLowerCase() !== 'first_name')
}

/** A WhatsApp campaign can fill at most one template blank, with the buyer's first name. */
export function whatsappParams(paramCount: number, firstName: string | null): string[] | null {
  if (paramCount === 0) return []
  if (paramCount === 1) return [firstName ?? 'there']
  return null
}

export interface Counts { total: number; queued: number; sent: number; skipped: number; failed: number }

export function summarise(rows: { status: RecipientStatus }[]): Counts {
  const c: Counts = { total: rows.length, queued: 0, sent: 0, skipped: 0, failed: 0 }
  for (const r of rows) c[r.status]++
  return c
}
