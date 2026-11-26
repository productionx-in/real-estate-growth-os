// lib/support/prospect.ts — a callback request Rio collected in chat, saved as a prospect in RE by PX's internal Sales
// pipeline (staff console → Sales), exactly like the website demo form. Only with the visitor's agreement and
// only name, phone, company and what they told us; never a customer workspace.
import crypto from 'node:crypto'

type Db = { from: (t: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any
export interface CallbackRequest { name: string; phone: string; company: string | null; companyType: 'developer' | 'channel_partner' | 'unknown'; teamSize: number | null; summary: string }

export const validPhone = (p: string) => /^\+?[0-9 ()-]{7,20}$/.test(p.trim()) && p.replace(/\D/g, '').length >= 10

/** Saves the callback; the same number within a day counts once. Returns false when the details are not usable. */
export async function saveRioCallback(db: Db, c: CallbackRequest): Promise<boolean> {
  const name = c.name.trim(), phone = c.phone.trim()
  if (name.length < 2 || !validPhone(phone)) return false
  const since = new Date(Date.now() - 86_400_000).toISOString()
  const { data: recent } = await db.from('internal_prospects').select('id').eq('contact_phone', phone).gte('created_at', since).limit(1)
  if (recent?.length) return true
  const { error } = await db.from('internal_prospects').insert({
    company_name: (c.company && c.company.trim().length >= 2 ? c.company.trim() : name).slice(0, 200),
    org_type: c.companyType === 'channel_partner' ? 'channel_partner' : 'developer',
    team_size: c.teamSize && c.teamSize > 0 && c.teamSize < 100000 ? Math.round(c.teamSize) : null,
    source: 'website',
    campaign: 'rio-chat',
    stage: 'new',
    contact_name: name.slice(0, 120),
    contact_phone: phone,
    notes: `From the Rio chat: ${c.summary}`.slice(0, 1000),
    source_ref: `rio-chat:${crypto.randomUUID()}`,
  })
  if (error) { console.error('[rio] callback save failed:', error.message); return false }
  return true
}
