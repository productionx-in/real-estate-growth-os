// lib/integrations/whatsapp/embedded-signup.ts — finish Meta's WhatsApp Embedded Signup for one workspace.
// The customer signs in to Meta in a popup (Facebook JS SDK, configuration META_WA_CONFIG_ID) and picks or creates
// their own WhatsApp Business Account and number. The popup returns a short-lived code plus the WABA id and phone
// number id. Here, on the server, we:
//   1. exchange the code for the customer's business integration token (needs META_APP_SECRET),
//   2. subscribe the central app to the WABA's webhooks (messages reach /api/webhooks/whatsapp),
//   3. register the phone number for Cloud API messaging (needs a 6-digit two-step PIN),
//   4. read the number's display name/quality for the Integration Centre.
// The token is returned to the caller to be encrypted (lib/integrations/crypto.ts); it is never logged.

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export interface SignupInput {
  code: string
  wabaId: string
  phoneNumberId: string
  /** Two-step verification PIN to register the number with (6 digits). */
  pin: string
}

export interface SignupResult {
  accessToken: string
  phone: { displayPhoneNumber: string | null; verifiedName: string | null; qualityRating: string | null }
  registered: boolean
  /** A non-fatal problem worth showing (e.g. registration needs the existing PIN). */
  warning: string | null
}

export class EmbeddedSignupError extends Error {
  constructor(message: string, readonly step: 'exchange' | 'subscribe' | 'register' | 'phone') {
    super(message)
  }
}

/** Only messages from Meta's own pages carry the signup result (window 'message' events). */
export function isMetaOrigin(origin: string): boolean {
  try {
    const u = new URL(origin)
    return u.protocol === 'https:' && (u.hostname === 'facebook.com' || u.hostname.endsWith('.facebook.com'))
  } catch { return false }
}

const ID = /^\d{5,30}$/
export function checkSignupInput(i: Partial<SignupInput>): string | null {
  if (typeof i.code !== 'string' || i.code.length < 10 || i.code.length > 2048) return 'The sign-up code from Meta is missing.'
  if (typeof i.wabaId !== 'string' || !ID.test(i.wabaId)) return 'The WhatsApp Business Account id is missing.'
  if (typeof i.phoneNumberId !== 'string' || !ID.test(i.phoneNumberId)) return 'The phone number id is missing.'
  if (typeof i.pin !== 'string' || !/^\d{6}$/.test(i.pin)) return 'Enter a 6-digit PIN for the number’s two-step verification.'
  return null
}

async function graph(fetcher: FetchLike, url: string, init?: RequestInit) {
  const res = await fetcher(url, init)
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: { message?: string; code?: number } }
  return { ok: res.ok && !body.error, body, message: body.error?.message ?? `HTTP ${res.status}` }
}

export async function completeEmbeddedSignup(
  input: SignupInput,
  app: { appId: string; appSecret: string; apiVersion: string },
  fetcher: FetchLike = fetch,
): Promise<SignupResult> {
  const base = `https://graph.facebook.com/${app.apiVersion}`

  // 1. Code → business integration system-user token. Embedded Signup codes take no redirect_uri.
  const q = new URLSearchParams({ client_id: app.appId, client_secret: app.appSecret, code: input.code })
  const ex = await graph(fetcher, `${base}/oauth/access_token?${q}`)
  const accessToken = typeof ex.body.access_token === 'string' ? ex.body.access_token : null
  if (!ex.ok || !accessToken) throw new EmbeddedSignupError(`Meta did not accept the sign-up code (${ex.message}).`, 'exchange')
  const auth = { Authorization: `Bearer ${accessToken}` }

  // 2. Webhooks for this WABA come to the central app.
  const sub = await graph(fetcher, `${base}/${input.wabaId}/subscribed_apps`, { method: 'POST', headers: auth })
  if (!sub.ok) throw new EmbeddedSignupError(`Could not subscribe to the WhatsApp account’s messages (${sub.message}).`, 'subscribe')

  // 3. Register the number for Cloud API. A number already registered with a different PIN fails here; the
  //    connection still works for receiving, so report it rather than abandon the signup.
  const reg = await graph(fetcher, `${base}/${input.phoneNumberId}/register`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', pin: input.pin }),
  })
  const warning = reg.ok ? null : `The number could not be registered for sending (${reg.message}). If it already has two-step verification, enter that PIN and reconnect.`

  // 4. What the Integration Centre shows.
  const ph = await graph(fetcher, `${base}/${input.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`, { headers: auth })
  const str = (v: unknown) => (typeof v === 'string' && v ? v : null)
  return {
    accessToken,
    registered: reg.ok,
    warning,
    phone: ph.ok
      ? { displayPhoneNumber: str(ph.body.display_phone_number), verifiedName: str(ph.body.verified_name), qualityRating: str(ph.body.quality_rating) }
      : { displayPhoneNumber: null, verifiedName: null, qualityRating: null },
  }
}
