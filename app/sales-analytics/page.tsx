// app/sales-analytics/page.tsx — Real estate sales analytics.
import { ProductPage, productMetadata, type ProductPageContent } from '@/components/marketing/ProductPage'

const c: ProductPageContent = {
  path: '/sales-analytics',
  metaTitle: 'Real Estate Sales Analytics and Reporting',
  metaDescription:
    'See your real estate sales funnel, lead source performance, response time, sales velocity and inventory absorption — from the same records your team works in every day.',
  breadcrumb: 'Sales analytics',
  eyebrow: 'Real estate sales analytics',
  h1: 'Know which sources, teams and projects are actually selling',
  intro:
    'Because leads, visits, bookings and inventory live in one system, RE by PX’s reports come from the work itself — not from a spreadsheet someone updates on Friday.',
  definition: {
    question: 'Which sales metrics matter most for a real estate developer?',
    answer:
      'The core metrics are lead-to-site-visit and site-visit-to-booking conversion, cost and quality by lead source, speed to lead (how quickly each enquiry is first contacted), sales velocity (days from enquiry to booking) and inventory absorption (the share of units booked or sold). Together they show where buyers drop out and which spend produces bookings.',
  },
  capabilityGroups: [
    { heading: 'Sales performance', ids: ['funnel', 'channel_performance', 'sales_velocity', 'speed_to_lead'] },
    { heading: 'Inventory', ids: ['inventory_absorption'] },
  ],
  sections: [
    {
      heading: 'Who sees what',
      paragraphs: [
        'Organisation-wide analytics are available to roles that can see every lead — owners, admins and managers. Salespeople see their own work. Each organisation’s figures come only from its own data.',
      ],
    },
  ],
  faq: [
    { q: 'Can we export reports?', a: 'Lead lists can be exported. Ask us about specific reporting needs during the demo.' },
    { q: 'Does analytics include ad spend?', a: 'Not automatically. Source performance counts leads, visits, bookings and booking value by source; ad spend lives in your ad accounts.' },
  ],
  related: [
    { href: '/sales-operations', label: 'Sales operations', body: 'Speed to lead and follow-up accountability.' },
    { href: '/inventory-management', label: 'Inventory management', body: 'Absorption from live inventory.' },
    { href: '/leakage-audit', label: 'Free lead-leakage audit', body: 'Measure your current response time from an export.' },
  ],
}

export const metadata = productMetadata(c)
export default function Page() { return <ProductPage c={c} /> }
