// lib/email/demo-request.ts — the e-mail a person gets the moment they ask for a demo on RE by PX's website, and the
// alert RE by PX's sales team gets. The confirmation is written for them: it repeats what they told us, does the
// arithmetic on their lead flow (leads per salesperson per working day), and says what happens next and what to
// have ready. Only facts RE by PX can stand behind: no response-time promises, no invented statistics.
import { renderEmail } from '@/lib/email/layout'

export interface DemoRequestDetails {
  name: string
  phone: string
  email: string | null
  companyName: string | null
  companyType: 'developer' | 'channel_partner'
  teamSize: number | null
  interest: string | null      // e.g. "A product demo · RE for Developers"
  leadVolume: string | null    // "Under 300" | "300–1,000" | "1,000–3,000" | "Over 3,000"
  currentTool: string | null   // "Excel / Google Sheets / WhatsApp", …
  message: string | null
}

const WORKING_DAYS = 25 // a month of six-day weeks, as most Indian sales teams work

/** Lead volume as a monthly range. */
export function volumeRange(v: string | null): [number, number] | null {
  if (!v) return null
  const nums = v.replace(/,/g, '').match(/\d+/g)?.map(Number) ?? []
  if (/under/i.test(v) && nums[0]) return [Math.round(nums[0] / 3), nums[0]]
  if (/over/i.test(v) && nums[0]) return [nums[0], nums[0] * 2]
  if (nums.length >= 2) return [nums[0], nums[1]]
  return null
}

const roundNice = (n: number) => (n >= 10 ? Math.round(n) : Math.round(n * 10) / 10)
const span = (a: number, b: number) => (roundNice(a) === roundNice(b) ? `about ${roundNice(a)}` : `${roundNice(a)}–${roundNice(b)}`)

/** "That's 30–100 new leads per salesperson a month — about 1–4 every working day." or null without the numbers. */
export function leadMath(volume: string | null, team: number | null): string | null {
  const r = volumeRange(volume)
  if (!r || !team || team < 1) return null
  const [lo, hi] = r
  const perMonth = span(lo / team, hi / team)
  const perDayLo = lo / team / WORKING_DAYS
  const perDayHi = hi / team / WORKING_DAYS
  const perDay = perDayHi < 1
    ? `about one every ${Math.max(2, Math.round(2 / (perDayLo + perDayHi)))} working days`
    : Math.round(perDayHi) <= 1
      ? 'up to about one every working day'
      : `${Math.max(1, Math.round(perDayLo))}–${Math.round(perDayHi)} every working day`
  const said = volume?.toLowerCase().startsWith('under') ? `up to ${r[1].toLocaleString('en-IN')}` : (volume ?? '').replace(/^Over/, 'over')
  return `With ${said} leads a month and ${team} ${team === 1 ? 'person' : 'people'} in sales, that's ${perMonth} new leads per salesperson a month — ${perDay}. At that pace, what decides results is how fast each lead gets its first call and whether every follow-up happens. That's exactly what we'll show you.`
}

const TOOL_LINE: Record<string, string> = {
  'Excel / Google Sheets / WhatsApp': 'You mentioned sheets and WhatsApp today. We’ll show how leads stop slipping through groups and tabs, and how your existing sheet comes into RE by PX with a simple import.',
  'A real estate CRM': 'You already use a real estate CRM. We’ll show how you can bring your leads across with an import and run both side by side while your team switches.',
  'A general-purpose CRM': 'You use a general-purpose CRM today. We’ll show what changes when the system knows projects, units, site visits and channel partners.',
  'No CRM yet': 'You don’t use a CRM yet, so we’ll start simple: where your leads come from, who gets them, and how nobody is forgotten.',
}

const INTEREST_LINE: Array<[RegExp, string]> = [
  [/migration/i, 'You asked for a migration assessment: we’ll look at what you use today, what moves across, and how to switch without losing a single lead.'],
  [/consultation/i, 'You asked for a consultation: we’ll walk through how leads reach your team today and where they leak, before talking about software.'],
  [/talk to the team/i, 'You asked to talk to the team: we’ll call you and take it from there.'],
  [/demo/i, 'You asked for a product demo: about 30 minutes, built around your own lead sources and team — not a generic tour.'],
]

export function demoConfirmationEmail(d: DemoRequestDetails, links: { site: string }) {
  const first = d.name.trim().split(/\s+/)[0] || 'there'
  const company = d.companyName?.trim() || null
  const agency = d.companyType === 'channel_partner'
  const interestLine = INTEREST_LINE.find(([re]) => re.test(d.interest ?? ''))?.[1] ?? INTEREST_LINE[3][1]
  const math = leadMath(d.leadVolume, d.teamSize)
  const tool = d.currentTool ? TOOL_LINE[d.currentTool] : null
  const focus = agency
    ? 'For an agency, we’ll focus on your buyers and team: every enquiry answered fast, follow-ups that happen, and your registrations with developers on record so your buyers stay yours.'
    : 'For a developer, we’ll focus on the whole path: every lead answered fast, site visits and bookings, live unit availability, and your channel partners’ registrations on record.'

  const paragraphs = [
    `Hi ${first},`,
    `Thank you for your interest in RE by PX${company ? ` for **${company}**` : ''}. We’ve received your request and a member of our team will call you on **${d.phone}** to fix a time that suits you.`,
    interestLine,
    ...(math ? [math] : []),
    focus,
    ...(tool ? [tool] : []),
    '**To make the most of the call, it helps to have:**',
    '• where your leads come from (Meta, Google, property portals, your website, walk-ins)',
    '• how a new lead reaches a salesperson today, and who follows up',
    `• ${agency ? 'the developers and projects you sell' : 'the projects you’re selling and roughly how many units'}`,
    'In the meantime, you can see everything RE by PX does on our website.',
  ]
  return {
    subject: `Thanks, ${first} — we’ve received your RE by PX ${/migration/i.test(d.interest ?? '') ? 'migration request' : /consultation/i.test(d.interest ?? '') ? 'consultation request' : 'demo request'}`,
    ...renderEmail({
      preheader: `We’ll call you on ${d.phone} to fix a time. Here’s what to expect.`,
      heading: company ? `Your request for ${company}` : 'We’ve received your request',
      paragraphs,
      cta: { label: 'See what RE by PX does', url: `${links.site}/features` },
      footnote: 'You’re receiving this because this e-mail address was entered on RE by PX’s demo form. If that wasn’t you, ignore this e-mail — we won’t contact you again unless you ask.',
      reason: 'You received this because you asked RE by PX for a demo or a call.',
    }),
  }
}

/** For RE by PX's sales team: everything the person told us, and where to act on it. */
export function demoAlertEmail(d: DemoRequestDetails, links: { console: string }) {
  const company = d.companyName?.trim() || d.name
  const math = leadMath(d.leadVolume, d.teamSize)
  return {
    subject: `New demo request: ${company} (${d.companyType === 'channel_partner' ? 'agency' : 'developer'}${d.teamSize ? `, team of ${d.teamSize}` : ''})`,
    ...renderEmail({
      preheader: `${d.name} · ${d.phone}${d.leadVolume ? ` · ${d.leadVolume} leads/month` : ''}`,
      heading: `New request from ${company}`,
      paragraphs: [
        `**${d.name}** · ${d.phone}${d.email ? ` · ${d.email}` : ''}`,
        `**Asked for:** ${d.interest ?? 'a demo'}`,
        `**Type:** ${d.companyType === 'channel_partner' ? 'Channel-partner agency' : 'Developer / builder'} · **Sales team:** ${d.teamSize ?? 'not given'} · **Leads/month:** ${d.leadVolume ?? 'not given'} · **Today they use:** ${d.currentTool ?? 'not given'}`,
        ...(math ? [`**Load:** ${math.split(' — ')[0].replace(/^With .*?, that's /, '')}`] : []),
        ...(d.message ? [`**Their note:** ${d.message}`] : []),
        d.email ? 'They have been sent a confirmation e-mail.' : 'They gave no e-mail address, so no confirmation was sent — call them.',
      ],
      cta: { label: 'Open in the console', url: links.console },
      reason: 'Sent to the RE by PX sales team for every website request.',
    }),
  }
}
