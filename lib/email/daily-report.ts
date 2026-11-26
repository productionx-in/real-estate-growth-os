// lib/email/daily-report.ts — the 8 AM e-mails: "Your day" for each salesperson and "Your team's day" for owners,
// admins and managers. Numbers first, one clear next step, a link into RE by PX. Lead names only (never phone
// numbers or other details), and only to people in the same workspace who could already see those leads.
import { renderEmail } from '@/lib/email/layout'

export interface PersonDay {
  name: string
  newAssigned: number       // leads assigned to them yesterday
  waitingFirstCall: number  // their open leads nobody has acted on yet
  followUpsToday: number    // their open follow-ups due today
  followUpsOverdue: number  // their open follow-ups due before today
  visitsToday: number       // their site visits scheduled today
  callFirst: string[]       // up to 5 lead names to call first (oldest waiting)
}

export interface TeamDay {
  newLeads: number
  bySource: Array<[string, number]>   // top sources yesterday
  answeredMedianMinutes: number | null // median minutes from arrival to first action, yesterday's leads
  notYetAnswered: number               // yesterday's leads still without a first action
  unassigned: number                   // open leads with nobody assigned
  followUpsOverdue: number
  visitsYesterday: { done: number; noShow: number }
  visitsToday: number
  bookingsYesterday: number
  bookingValueYesterday: number        // rupees
  people: PersonDay[]                  // per person, busiest first
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const inr = (rupees: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(rupees)
const mins = (m: number) => (m < 60 ? `${Math.round(m)} min` : m < 1440 ? `${Math.round(m / 6) / 10} h` : `${Math.round(m / 144) / 10} days`)
const REASON = 'You get this each morning as a member of a RE by PX workspace. Turn it off in Account → E-mail notifications.'

/** True when there is nothing worth telling this person today. */
export const quietDay = (d: PersonDay) => !d.newAssigned && !d.waitingFirstCall && !d.followUpsToday && !d.followUpsOverdue && !d.visitsToday

/** The single most useful thing to do first. */
export function firstStep(d: PersonDay): string {
  if (d.waitingFirstCall) return `Start with the ${plural(d.waitingFirstCall, 'lead')} waiting for a first call — the sooner they hear from you, the warmer they are.`
  if (d.followUpsOverdue) return `Clear the ${plural(d.followUpsOverdue, 'overdue follow-up')} first, then today’s.`
  if (d.visitsToday) return `Confirm today’s ${plural(d.visitsToday, 'site visit')} with each buyer this morning.`
  if (d.followUpsToday) return `You have ${plural(d.followUpsToday, 'follow-up')} today — they’re in Today.`
  return 'Your list is clear. Check Today for anything new.'
}

function personLines(d: PersonDay): string[] {
  return [
    `• **${d.newAssigned}** new ${d.newAssigned === 1 ? 'lead' : 'leads'} assigned to you yesterday`,
    `• **${d.waitingFirstCall}** waiting for a first call`,
    `• **${d.followUpsToday}** follow-up${d.followUpsToday === 1 ? '' : 's'} due today${d.followUpsOverdue ? `, **${d.followUpsOverdue}** overdue` : ''}`,
    `• **${d.visitsToday}** site visit${d.visitsToday === 1 ? '' : 's'} today`,
    ...(d.callFirst.length ? [`**Call first:** ${d.callFirst.join(', ')}`] : []),
  ]
}

export function memberDayEmail(o: { orgName: string; firstName: string; dateLabel: string; day: PersonDay; url: string }) {
  return {
    subject: `Your day at ${o.orgName}: ${o.day.waitingFirstCall ? `${plural(o.day.waitingFirstCall, 'lead')} to call` : `${plural(o.day.followUpsToday + o.day.followUpsOverdue, 'follow-up')}`}${o.day.visitsToday ? `, ${plural(o.day.visitsToday, 'visit')}` : ''}`,
    ...renderEmail({
      preheader: firstStep(o.day),
      heading: `Good morning, ${o.firstName}`,
      paragraphs: [`Here’s your day at **${o.orgName}** — ${o.dateLabel}.`, ...personLines(o.day), firstStep(o.day)],
      cta: { label: 'Open Today', url: o.url },
      reason: REASON,
    }),
  }
}

export function managerDayEmail(o: { orgName: string; firstName: string; dateLabel: string; team: TeamDay; own: PersonDay | null; url: string }) {
  const t = o.team
  const attention = [
    ...(t.notYetAnswered ? [`**${plural(t.notYetAnswered, 'lead')}** from yesterday still not answered`] : []),
    ...(t.unassigned ? [`**${t.unassigned}** open ${t.unassigned === 1 ? 'lead has' : 'leads have'} nobody assigned`] : []),
    ...(t.followUpsOverdue ? [`**${plural(t.followUpsOverdue, 'follow-up')}** overdue across the team`] : []),
  ]
  const busiest = t.people.filter((p) => !quietDay(p)).slice(0, 10)
  return {
    subject: `${o.orgName} yesterday: ${plural(t.newLeads, 'new lead')}${t.bookingsYesterday ? `, ${plural(t.bookingsYesterday, 'booking')}` : ''}${attention.length ? ' — needs attention' : ''}`,
    ...renderEmail({
      preheader: attention.length ? attention[0].replace(/\*\*/g, '') : `${t.newLeads} new leads, ${t.visitsToday} visits today.`,
      heading: `Your team’s day, ${o.firstName}`,
      paragraphs: [
        `**${o.orgName}** — ${o.dateLabel}.`,
        '**Yesterday**',
        `• **${t.newLeads}** new ${t.newLeads === 1 ? 'lead' : 'leads'}${t.bySource.length ? ` (${t.bySource.map(([s, n]) => `${s} ${n}`).join(', ')})` : ''}`,
        `• First answer: ${t.answeredMedianMinutes === null ? 'no answered leads yet' : `half were answered within **${mins(t.answeredMedianMinutes)}**`}`,
        `• Site visits: **${t.visitsYesterday.done}** done${t.visitsYesterday.noShow ? `, ${t.visitsYesterday.noShow} no-show` : ''}`,
        `• Bookings: **${t.bookingsYesterday}**${t.bookingsYesterday ? ` worth ${inr(t.bookingValueYesterday)}` : ''}`,
        '**Today**',
        `• **${t.visitsToday}** site visit${t.visitsToday === 1 ? '' : 's'} scheduled`,
        ...(attention.length ? ['**Needs attention**', ...attention.map((a) => `• ${a}`)] : ['Nothing needs your attention right now.']),
        ...(busiest.length ? ['**By person** (new yesterday · waiting for first call · follow-ups due/overdue · visits today)',
          ...busiest.map((p) => `• ${p.name}: ${p.newAssigned} · ${p.waitingFirstCall} · ${p.followUpsToday}/${p.followUpsOverdue} · ${p.visitsToday}`)] : []),
        ...(o.own && !quietDay(o.own) ? ['**Your own list**', ...personLines(o.own)] : []),
      ],
      cta: { label: 'Open the dashboard', url: o.url },
      reason: REASON,
    }),
  }
}
