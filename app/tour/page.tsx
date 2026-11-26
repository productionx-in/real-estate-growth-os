// app/tour/page.tsx — Product tour: click through RE's real screens with fictional sample data, no sign-up.
// Screenshots in /public/tour are captured from the demo seed (scripts/demo/seed-demo.mjs) — every name, phone number
// and company in them is fictional.
import type { Metadata } from 'next'
import Link from 'next/link'
import { PRODUCT_NAME } from '@/lib/brand'
import { MarketingShell } from '@/components/marketing/MarketingShell'
import { ProductTour, type TourStep } from '@/components/marketing/ProductTour'

export const metadata: Metadata = {
  title: { absolute: `Product tour — see ${PRODUCT_NAME} with sample data` },
  description: 'Click through RE with sample data: the morning dashboard, a lead from first call to site visit, routing, inventory, and channel partners — no sign-up.',
  alternates: { canonical: '/tour' },
}

const STEPS: TourStep[] = [
  {
    id: 'home', nav: 'Morning dashboard', image: '/tour/dashboard.jpg',
    title: 'Start the day with what needs a call',
    body: 'Owners and managers open RE to the leads that are slipping: never called, nobody assigned, follow-up overdue. One click opens the list behind each number.',
    hotspots: [
      { x: 21, y: 31, title: 'Needs attention', text: 'Leads waiting for a first call, unassigned, or with a missed follow-up — counted live.' },
      { x: 21, y: 52, title: 'Call these first', text: 'The oldest waiting buyers, with the time left to call inside your response target.' },
      { x: 82, y: 50, title: 'Enquiry to booking', text: 'Where this week’s new leads are in the funnel, step by step.' },
    ],
  },
  {
    id: 'lead', nav: 'A lead', image: '/tour/lead.jpg',
    title: 'Everything about a buyer on one screen',
    body: 'Call or WhatsApp in one tap, record how it went, and RE suggests the next step. Every call, note and stage change is kept on the lead’s history.',
    hotspots: [
      { x: 42, y: 27, title: 'Stage at a glance', text: 'New → contacted → qualified → visit → negotiating → booked.' },
      { x: 85, y: 38, title: 'Next best action', text: 'What to do now, and by when, based on the lead’s stage and your response rules.' },
      { x: 79, y: 63, title: 'Call or WhatsApp', text: 'Tap to call or message from the phone; the attempt is logged for you.' },
      { x: 85, y: 77, title: 'How did it go?', text: 'One tap records the outcome and schedules the follow-up or site visit.' },
    ],
  },
  {
    id: 'leads', nav: 'All leads', image: '/tour/leads.jpg',
    title: 'Every enquiry, from every source, in one list',
    body: 'Meta and Google lead forms, property portals, your website and WhatsApp land here — deduplicated, with the source and the salesperson on every row.',
    hotspots: [
      { x: 35, y: 26, title: 'Filter and save views', text: 'By status, source, project, owner, tag or what needs attention.' },
      { x: 48, y: 42, title: 'Status', text: 'Where each buyer is, so nobody is called twice or forgotten.' },
      { x: 80, y: 42, title: 'Who owns it', text: 'Assigned automatically by your routing rules — or visibly unassigned.' },
    ],
  },
  {
    id: 'routing', nav: 'Lead routing', image: '/tour/routing.jpg',
    title: 'Decide who gets each new lead',
    body: 'Set how fast a new lead must be called and share leads across your team by weight and daily limit. Missed leads move to the next person and managers are alerted.',
    hotspots: [
      { x: 28, y: 31, title: 'Response rules', text: 'First-call target, a nudge before it runs out, and your working hours.' },
      { x: 46, y: 77, title: 'Fair sharing', text: 'Each salesperson’s share, daily limit and on-duty switch.' },
    ],
  },
  {
    id: 'inventory', nav: 'Inventory', image: '/tour/inventory.jpg',
    title: 'Live availability for every unit',
    body: 'Projects, towers, floors and plots with prices and status. Holds expire on their own, so the availability your team quotes is always current.',
    hotspots: [
      { x: 42, y: 22, title: 'At a glance', text: 'Available, on hold, booked, sold and blocked across all projects.' },
      { x: 29, y: 52, title: 'Tower and plot views', text: 'Open a project as a floor-by-floor tower or a plot map.' },
      { x: 67, y: 74, title: 'Price and status', text: 'Every unit with its size, price and current status.' },
    ],
  },
  {
    id: 'partners', nav: 'Channel partners', image: '/tour/partners.jpg',
    title: 'Work with agencies without losing track of buyers',
    body: 'Share projects with partner agencies — with prices or availability only — and review the buyers they register. Each agency keeps its own workspace.',
    hotspots: [
      { x: 29, y: 28, title: 'Add a partner', text: 'Agencies send you their partner code; you decide whether to accept.' },
      { x: 80, y: 53, title: 'What they see', text: 'Per project: availability and prices, or availability only.' },
    ],
  },
  {
    id: 'agency', nav: 'Agency workspace', image: '/tour/partner.jpg',
    title: 'Agencies get the same tools, for their own buyers',
    body: 'A channel-partner agency has its own RE workspace: its buyers, team, follow-ups, listings and commissions — and the projects developers have shared with it.',
    hotspots: [
      { x: 7, y: 34, title: 'Built for agencies', text: 'Referred leads, listings, and deals and commissions.' },
      { x: 39, y: 56, title: 'Same speed-to-lead', text: 'The same first-call list and attention counts as developers.' },
    ],
  },
]

export default function TourPage() {
  return (
    <MarketingShell>
      <section className="mx-auto max-w-6xl px-4 pt-14 pb-16 sm:px-6 md:pt-20">
        <p className="text-[13px] font-semibold text-[var(--brand)]">Product tour · about 2 minutes</p>
        <h1 className="mt-2 max-w-3xl text-[32px] font-extrabold leading-tight tracking-tight sm:text-[40px]">See {PRODUCT_NAME} the way your team will use it</h1>
        <p className="mt-3 max-w-2xl text-[16px] leading-relaxed text-muted">
          Seven real screens with sample data. Tap the numbered dots, or use the arrow keys. Every name and number shown is fictional.
        </p>
        <div className="mt-10"><ProductTour steps={STEPS} /></div>
        <div className="ceramic mt-14 flex flex-col items-start gap-4 rounded-2xl p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-[20px] font-bold">Want to see it with your own projects?</h2>
            <p className="mt-1 text-[15px] text-muted">We set up a walkthrough with your lead sources and inventory.</p>
          </div>
          <div className="flex gap-2">
            <Link href="/demo" className="inline-flex min-h-11 items-center rounded-full bg-[var(--ink)] px-5 text-[14px] font-semibold text-[#fff] hover:bg-brand">Book a demo</Link>
            <Link href="/pricing" className="inline-flex min-h-11 items-center rounded-full border border-default bg-surface px-5 text-[14px] font-semibold">See pricing</Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  )
}
