// lib/theme/runtime.ts — day/night appearance. One self-contained function: it is serialised into an inline
// <head> script (so the right theme is set before the first paint, no flash) and also imported by the client
// controller and the tests. It must not reference anything outside its own body.
//
// Preferences: 'sun' (default) — light between local sunrise and sunset, dark otherwise, from the device's
// timezone (no location permission; accurate to roughly half an hour within a timezone); 'system' — follow the
// device; 'light'; 'dark'. Stored per browser (localStorage). Public, buyer-facing and marketing pages stay light.
export type ThemePreference = 'sun' | 'system' | 'light' | 'dark'

import { MARKETING_PATHS } from '@/lib/site/urls'

/** `lightPaths`: the public marketing pages (always light). Passed in, because this function must stay self-contained. */
export function themeRuntime(lightPaths: string[] = MARKETING_PATHS) {
  const KEY = 'repx-theme'
  const PREFS = ['sun', 'system', 'light', 'dark']
  const LIGHT_ONLY = [/^\/privacy(\/|$)/, /^\/terms(\/|$)/, /^\/refund-policy(\/|$)/, /^\/contact(\/|$)/, /^\/p\//, /^\/d\//, /^\/forms(\/|$)/] // plus every marketing page (lightPaths)

  // Representative coordinates for common timezones; others are estimated from the UTC offset.
  const ZONES: Record<string, [number, number]> = {
    'Asia/Kolkata': [21.1, 79.1], 'Asia/Calcutta': [21.1, 79.1], 'Asia/Dubai': [25.2, 55.3], 'Asia/Riyadh': [24.7, 46.7],
    'Asia/Qatar': [25.3, 51.5], 'Asia/Kathmandu': [27.7, 85.3], 'Asia/Dhaka': [23.8, 90.4], 'Asia/Colombo': [6.9, 79.9],
    'Asia/Singapore': [1.35, 103.8], 'Asia/Tokyo': [35.7, 139.7], 'Europe/London': [51.5, -0.1], 'Europe/Berlin': [52.5, 13.4],
    'America/New_York': [40.7, -74.0], 'America/Chicago': [41.9, -87.6], 'America/Los_Angeles': [34.0, -118.2],
    'America/Toronto': [43.7, -79.4], 'Australia/Sydney': [-33.9, 151.2],
  }
  function coords(zone: string | undefined, offsetMinutes: number): [number, number] {
    if (zone && ZONES[zone]) return ZONES[zone]
    return [20, Math.max(-180, Math.min(180, -offsetMinutes / 4))]
  }

  // Sunrise and sunset (ms since epoch) for the day containing `date` at lat/lng — standard solar-position
  // formulas (as used by SunCalc / NOAA). Polar day or night returns null.
  function sunTimes(date: Date, lat: number, lng: number): { rise: number; set: number } | null {
    const rad = Math.PI / 180, dayMs = 86400000, J1970 = 2440588, J2000 = 2451545, J0 = 0.0009, e = rad * 23.4397
    const d = date.valueOf() / dayMs - 0.5 + J1970 - J2000
    const lw = rad * -lng, phi = rad * lat
    const n = Math.round(d - J0 - lw / (2 * Math.PI))
    const ds = J0 + lw / (2 * Math.PI) + n
    const M = rad * (357.5291 + 0.98560028 * ds)
    const L = M + rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)) + rad * 102.9372 + Math.PI
    const dec = Math.asin(Math.sin(e) * Math.sin(L))
    const transit = (a: number) => J2000 + a + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L)
    const jNoon = transit(ds)
    const w = Math.acos((Math.sin(-0.833 * rad) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec)))
    if (Number.isNaN(w)) return null
    const jSet = transit(J0 + (w + lw) / (2 * Math.PI) + n)
    const jRise = jNoon - (jSet - jNoon)
    const toMs = (j: number) => (j + 0.5 - J1970) * dayMs
    return { rise: toMs(jRise), set: toMs(jSet) }
  }

  function readPreference(): ThemePreference {
    try { const v = localStorage.getItem(KEY); if (v && PREFS.includes(v)) return v as ThemePreference } catch { /* storage blocked */ }
    return 'sun'
  }

  function effective(pref: ThemePreference, now: Date, systemDark: boolean, zone: string | undefined, offsetMinutes: number): 'light' | 'dark' {
    if (pref === 'light' || pref === 'dark') return pref
    if (pref === 'system') return systemDark ? 'dark' : 'light'
    const [lat, lng] = coords(zone, offsetMinutes)
    const t = sunTimes(now, lat, lng)
    if (!t) { const h = now.getHours(); return h >= 6 && h < 18 ? 'light' : 'dark' }
    return now.valueOf() >= t.rise && now.valueOf() < t.set ? 'light' : 'dark'
  }

  const lightOnly = (path: string) => LIGHT_ONLY.some((re) => re.test(path)) || lightPaths.indexOf(path.replace(/\/+$/, '') || '/') >= 0

  function apply(path?: string) {
    const p = path ?? location.pathname
    let zone: string | undefined
    try { zone = Intl.DateTimeFormat().resolvedOptions().timeZone } catch { zone = undefined }
    const now = new Date()
    const theme = lightOnly(p) ? 'light'
      : effective(readPreference(), now, typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches, zone, now.getTimezoneOffset())
    const root = document.documentElement
    if (theme === 'dark') root.setAttribute('data-theme', 'dark'); else root.removeAttribute('data-theme')
    return theme
  }

  function setPreference(pref: ThemePreference) {
    try { localStorage.setItem(KEY, pref) } catch { /* storage blocked: applies to this page only */ }
    return apply()
  }

  return { KEY, coords, sunTimes, effective, lightOnly, readPreference, apply, setPreference }
}

/** Inline before first paint. */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=(${themeRuntime.toString()})(${JSON.stringify(MARKETING_PATHS)});window.__repxTheme=t;t.apply()}catch(e){}})()`
