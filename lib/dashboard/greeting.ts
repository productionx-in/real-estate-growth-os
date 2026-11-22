// lib/dashboard/greeting.ts — the home page greeting, in India time (pure).
export function greeting(now: Date = new Date()): { hello: string; date: string } {
  const hour = Number(new Intl.DateTimeFormat('en-IN', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }).format(now)) % 24
  const hello = hour < 5 ? 'Good evening' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const date = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' }).format(now)
  return { hello, date }
}

export const firstName = (full: string | null | undefined) => (full ?? '').trim().split(/\s+/)[0] || 'there'
