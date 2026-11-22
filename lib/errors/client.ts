// lib/errors/client.ts — errors that happen in the browser (pure helpers, safe on both sides).
// The most common one after a release: a tab opened before the deploy asks for code files of the old version that no
// longer exist. Reloading the page fixes it, so the error page does that once, by itself.

const STALE_BUILD = [
  /ChunkLoadError/i,
  /Loading (CSS )?chunk [\w-]+ failed/i,
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
  /error loading dynamically imported module/i,
  /Failed to find Server Action/i,
  /Failed to load chunk/i,
]

export function isStaleBuildError(e: { name?: string; message?: string } | null | undefined): boolean {
  const text = `${e?.name ?? ''} ${e?.message ?? ''}`
  return STALE_BUILD.some((re) => re.test(text))
}

/** A short reference for an error that has no server digest, e.g. "C-7K2M9Q". */
export function clientReference(): string {
  const a = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  let s = ''
  const bytes = new Uint8Array(6)
  globalThis.crypto.getRandomValues(bytes)
  for (const b of bytes) s += a[b % a.length]
  return `C-${s}`
}

/** What a browser error report may contain: no stack traces with data, no query strings, no personal details. */
export function sanitiseReport(input: { ref?: unknown; name?: unknown; message?: unknown; path?: unknown; digest?: unknown; stale?: unknown }) {
  const str = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, n) : '')
  const path = str(input.path, 300).split('?')[0].split('#')[0]
  return {
    ref: /^C-[A-Z0-9]{6}$/.test(str(input.ref, 8)) ? str(input.ref, 8) : 'C-INVALID',
    name: str(input.name, 80),
    // E-mail addresses and long digit runs (phone numbers) are masked before anything is logged.
    message: str(input.message, 500).replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]').replace(/\d{7,}/g, '[number]'),
    path: path.startsWith('/') ? path : '',
    digest: str(input.digest, 40),
    stale: input.stale === true,
  }
}
