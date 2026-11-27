// lib/calendar/ics.ts — a person's follow-ups and site visits as an iCalendar (RFC 5545) feed, for the calendar apps
// on their phone and computer (Google, Apple, Outlook). Pure: escaping, line folding and the events themselves.
import { KINDS, type CalendarItem } from '@/lib/calendar/rules'

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

/** Lines longer than 75 octets continue on the next line, starting with a space. */
export function fold(line: string): string {
  const out: string[] = []
  let cur = ''
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch, 'utf8') > 75) { out.push(cur); cur = ' ' + ch } else cur += ch
  }
  out.push(cur)
  return out.join('\r\n')
}

export interface FeedOptions { calendarName: string; leadUrl: (leadId: string) => string; now?: Date }

export function buildIcs(items: CalendarItem[], { calendarName, leadUrl, now = new Date() }: FeedOptions): string {
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Production X//RE//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(calendarName)}`, 'X-PUBLISHED-TTL:PT1H', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
  ]
  for (const it of items) {
    if (it.status === 'cancelled') continue
    const start = new Date(it.dueAt)
    const minutes = it.kind === 'site_visit' ? 60 : it.kind === 'meeting' ? 45 : 15
    const what = KINDS[it.kind]?.label ?? 'Follow-up'
    const done = it.status === 'done'
    lines.push(
      'BEGIN:VEVENT',
      `UID:${it.id}@re.productionx.in`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART:${stamp(start)}`,
      `DTEND:${stamp(new Date(start.getTime() + minutes * 60000))}`,
      `SUMMARY:${esc(`${done ? '✓ ' : ''}${what}: ${it.leadName}`)}`,
      `DESCRIPTION:${esc([it.note ?? '', `Open in RE: ${leadUrl(it.leadId)}`].filter(Boolean).join('\n'))}`,
      `URL:${leadUrl(it.leadId)}`,
      `STATUS:${done ? 'CONFIRMED' : 'TENTATIVE'}`,
      'TRANSP:OPAQUE',
    )
    if (!done && start > now) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(`${what}: ${it.leadName}`)}`, 'TRIGGER:-PT10M', 'END:VALARM')
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}
