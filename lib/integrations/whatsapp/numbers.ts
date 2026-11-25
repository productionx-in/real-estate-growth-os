// lib/integrations/whatsapp/numbers.ts — a workspace can connect several WhatsApp Business numbers (each is one
// integration_connections row, provider whatsapp_cloud). Plain helpers shared by the webhook, the sender, the
// sign-up flow and the screens. No server dependencies.
//
// Connections made before this used different metadata keys: Embedded Signup stores selectedPhoneNumberId /
// displayPhoneNumber, the manual wizard phone_number_id / display_phone_number. Both are read everywhere.

export const MAX_WHATSAPP_NUMBERS = 5

type Meta = Record<string, unknown> | null | undefined
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** Meta's id for the number (what messages are sent from and addressed to). */
export function phoneNumberIdOf(meta: Meta): string | null {
  return str(meta?.phone_number_id) ?? str(meta?.selectedPhoneNumberId)
}

/** The number as people read it, e.g. "+91 80000 00000". */
export function displayNumberOf(meta: Meta): string | null {
  return str(meta?.displayPhoneNumber) ?? str(meta?.display_phone_number)
}

export function wabaIdOf(meta: Meta, externalAccountId?: string | null): string | null {
  return str(meta?.wabaId) ?? str(externalAccountId)
}

/** "Sales line · +91 80000 00000" — the connection's own name when it adds something, then the number. */
export function numberLabel(conn: { name?: string | null; metadata?: Meta }): string {
  const num = displayNumberOf(conn.metadata)
  const verified = str(conn.metadata?.verifiedName)
  const name = verified ?? (conn.name && !/^WhatsApp( Business)?$/i.test(conn.name.trim()) ? conn.name.replace(/^WhatsApp · /, '') : null)
  return [name, num].filter(Boolean).join(' · ') || 'WhatsApp number'
}

export interface RoutableConnection { id: string; metadata: Meta; external_account_id?: string | null }
interface Change { value?: { metadata?: { phone_number_id?: string } } }
interface Entry { id?: string; changes?: Change[] }

/**
 * Splits one Meta webhook delivery between connections. A change goes to the connection whose number it was sent to.
 * Only when no connection has that number does a connection without a stored number fall back to its business
 * account id, and only if it is the single such connection — so two numbers of one business account never both
 * receive the same message, and nothing is guessed across workspaces.
 */
export function routeWebhookEntries<E extends Entry>(entries: E[], connections: RoutableConnection[]): Map<string, E[]> {
  const byPhone = new Map<string, string>()
  for (const c of connections) { const p = phoneNumberIdOf(c.metadata); if (p) byPhone.set(p, c.id) }
  const out = new Map<string, E[]>()
  for (const entry of entries) {
    const groups = new Map<string, Change[]>()
    for (const change of entry.changes ?? []) {
      const phone = change.value?.metadata?.phone_number_id
      let target = phone ? byPhone.get(phone) ?? null : null
      if (!target && entry.id) {
        const legacy = connections.filter((c) => !phoneNumberIdOf(c.metadata) && wabaIdOf(c.metadata, c.external_account_id) === entry.id)
        if (legacy.length === 1) target = legacy[0].id
      }
      if (!target) continue
      groups.set(target, [...(groups.get(target) ?? []), change])
    }
    for (const [id, changes] of groups) out.set(id, [...(out.get(id) ?? []), { ...entry, changes } as E])
  }
  return out
}
