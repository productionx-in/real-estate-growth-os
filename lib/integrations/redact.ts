// lib/integrations/redact.ts — connection metadata as the browser may see it.
/** Metadata keys that hold secrets or tokens (even encrypted ones): never sent to the browser. */
const SECRET_META_KEY = /token|secret|password|credential|signing|api_?key/i

/** Connection metadata with every secret-bearing key removed, recursively. Safe to send to the browser. */
export function redactConnectionMetadata(meta: unknown): Record<string, unknown> {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk)
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([k]) => !SECRET_META_KEY.test(k)).map(([k, x]) => [k, walk(x)]))
    }
    return v
  }
  return (meta && typeof meta === 'object' && !Array.isArray(meta) ? walk(meta) : {}) as Record<string, unknown>
}
