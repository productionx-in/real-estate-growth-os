// app/developers/page.tsx — Audience page: real estate developers and builders.
import { ProductPage, productMetadata, type ProductPageContent } from '@/components/marketing/ProductPage'

const c: ProductPageContent = {
  path: '/developers',
  metaTitle: 'Real Estate Developer Software for Sales, Inventory and Partners',
  metaDescription:
    'Software for real estate developers and builders: leads, sales teams, project and unit inventory, site visits, bookings and channel partners in one platform.',
  breadcrumb: 'For developers',
  eyebrow: 'For real estate developers and builders',
  h1: 'Run every project’s sales — leads, teams, inventory and partners — from one system',
  intro:
    'Your marketing team buys the leads, your sales team works them, your channel partners bring more, and your inventory changes every day. RE by PX connects all of it, so you can see what is happening across every project and act before a lead or a unit slips.',
  primaryCta: { label: 'Book a developer demo', href: '/demo?plan=leads' },
  outcomes: [
    { title: 'Every campaign lead answered', body: 'Leads from your website, imports and connected ad, portal and WhatsApp accounts are assigned in seconds, with escalation if nobody calls.' },
    { title: 'Sales team control', body: 'Teams per project, fair rotation, daily caps and on-duty status — and a manager view of who has each lead and why.' },
    { title: 'Inventory that sales and partners trust', body: 'Live availability by tower and floor, holds with expiry, bookings that update stock, and full history.' },
  ],
  workflow: {
    heading: 'A developer’s week in RE by PX',
    steps: [
      { title: 'Launch or campaign', body: 'Set up the project, its structure and units; connect the lead sources for the campaign.' },
      { title: 'Leads arrive and are routed', body: 'Each enquiry goes to the right project team and the next salesperson in the rotation.' },
      { title: 'Partners register buyers', body: 'Partner agencies register buyers for the projects you share; you review conflicts and accept.' },
      { title: 'Visits and holds', body: 'Site visits are scheduled and tracked; interested buyers get a unit held with a token and expiry.' },
      { title: 'Bookings', body: 'Bookings update inventory immediately for the team and partners.' },
      { title: 'Review performance', body: 'Funnel, source performance, response time and absorption for each project.' },
    ],
  },
  capabilityGroups: [
    { heading: 'Leads and sales teams', ids: ['lead_inbox', 'routing_rules', 'rotation', 'follow_ups', 'speed_to_lead', 'roles'] },
    { heading: 'Projects and inventory', ids: ['projects', 'hierarchy', 'units', 'unit_blocking', 'bookings', 'microsites'] },
    { heading: 'Channel partners and performance', ids: ['project_sharing', 'registration_review', 'funnel', 'channel_performance'] },
  ],
  faq: [
    { q: 'We sell through our own team and through channel partners. Does RE by PX handle both?', a: 'Yes. Your team works leads in your workspace; partner agencies work in theirs and register buyers with you for the projects you share.' },
    { q: 'Can we run several projects with different teams?', a: 'Yes. Teams and routing rules can be set per project, source or campaign.' },
    { q: 'Do we need to replace our current tools on day one?', a: 'No. We start with an assessment and a planned transition; many teams run RE by PX alongside their current tools at first.' },
  ],
  related: [
    { href: '/inventory-management', label: 'Inventory management', body: 'Projects, towers, floors and units.' },
    { href: '/channel-partner-management', label: 'Channel partner management', body: 'Share projects and review registrations.' },
    { href: '/sales-analytics', label: 'Sales analytics', body: 'Funnel, sources, response time and absorption.' },
  ],
}

export const metadata = productMetadata(c)
export default function Page() { return <ProductPage c={c} /> }
