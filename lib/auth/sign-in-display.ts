// lib/auth/sign-in-display.ts — how sign-in activity is shown to workspace admins (Settings → Sign-in activity):
// a plain device name instead of a raw browser string, and a partly hidden IP address (enough to tell an office from
// somewhere unexpected, not a precise location). No server dependencies.

export function describeDevice(ua: string | null | undefined): string {
  if (!ua) return 'Unknown device'
  const browser =
    /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /SamsungBrowser/.test(ua) ? 'Samsung Internet'
    : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\/|CriOS/.test(ua) ? 'Chrome' : /Safari\//.test(ua) && /Version\//.test(ua) ? 'Safari'
    : /okhttp|Dart|node|curl|python/i.test(ua) ? 'An app or script' : 'A browser'
  const os =
    /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android'
    : /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /CrOS/.test(ua) ? 'Chromebook' : /Linux/.test(ua) ? 'Linux' : null
  return os ? `${browser} on ${os}` : browser
}

export function maskIp(ip: string | null | undefined): string {
  if (!ip) return '—'
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return ip.replace(/\.\d{1,3}$/, '.x')
  if (ip.includes(':')) return `${ip.split(':').filter(Boolean).slice(0, 3).join(':')}:…`
  return '—'
}
