// lib/auth/safe-redirect.ts
// Post-sign-in destinations come from the URL (?next=, ?redirectTo=), so they are attacker-controlled.
// Only same-origin relative paths are allowed: a single leading "/", no "//" or "/\" (protocol-relative),
// no backslashes, no control characters, no scheme. Anything else falls back to a safe default.
export const DEFAULT_AFTER_SIGN_IN = '/select-org'

export function safeRedirectPath(raw: string | null | undefined, fallback: string = DEFAULT_AFTER_SIGN_IN): string {
  if (typeof raw !== 'string') return fallback
  const value = raw.trim()
  if (value.length === 0 || value.length > 2048) return fallback
  if (!value.startsWith('/')) return fallback          // "@evil.com", "https://…", "javascript:…"
  if (value.startsWith('//') || value.startsWith('/\\')) return fallback // protocol-relative
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return fallback // backslashes and control chars (incl. encoded tab/newline after decoding)
  try {
    // Resolve against a dummy origin: the result must stay on that origin and keep the same path.
    const url = new URL(value, 'https://repx.invalid')
    if (url.origin !== 'https://repx.invalid') return fallback
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return fallback
  }
}
