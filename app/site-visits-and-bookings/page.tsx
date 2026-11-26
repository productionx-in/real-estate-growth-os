// app/site-visits-and-bookings/page.tsx — Site visit management, unit holds and booking management.
import { ProductPage, productMetadata, type ProductPageContent } from '@/components/marketing/ProductPage'

const c: ProductPageContent = {
  path: '/site-visits-and-bookings',
  metaTitle: 'Site Visit and Booking Management for Real Estate',
  metaDescription:
    'Schedule and track real estate site visits, hold units with a token and expiry, and record bookings that update inventory — connected to the lead and the salesperson.',
  breadcrumb: 'Site visits & bookings',
  eyebrow: 'Site visit and booking management',
  h1: 'From scheduled site visit to booked unit, without losing the thread',
  intro:
    'The site visit is where most property sales are won. RE keeps each visit tied to the buyer, the salesperson and the project, and turns interest into a held unit and a booking that updates availability for everyone.',
  definition: {
    question: 'What is site visit management in real estate?',
    answer:
      'Site visit management is scheduling, confirming and recording the visits buyers make to a project or sample flat, and following up afterwards. It tracks each visit’s status — scheduled, rescheduled, checked in, completed, cancelled or no-show — so managers know which buyers have visited and which visits need a follow-up.',
  },
  workflow: {
    heading: 'The path from visit to booking',
    steps: [
      { title: 'Schedule', body: 'Book the visit from the lead, with date, time, project and the salesperson who will host it. Online meetings can carry a meeting link.' },
      { title: 'Check in', body: 'Mark the buyer as arrived; the visit moves through a defined status flow.' },
      { title: 'Complete or reschedule', body: 'Record the outcome, reschedule, or mark a no-show so it is followed up.' },
      { title: 'Hold a unit', body: 'Hold the chosen unit with a token amount and an expiry date so it cannot be sold to someone else meanwhile.' },
      { title: 'Book', body: 'Convert the hold to a booking with the total amount and booking amount received; the unit’s availability updates.' },
      { title: 'Progress the booking', body: 'Track the booking from confirmed to agreement signed and registered, or cancelled.' },
    ],
  },
  capabilityGroups: [
    { heading: 'Visits', ids: ['site_visits', 'follow_ups', 'assignment_alerts'] },
    { heading: 'Holds and bookings', ids: ['unit_blocking', 'bookings', 'inventory_status', 'inventory_history', 'commissions'] },
  ],
  faq: [
    { q: 'Can a unit be held for a buyer?', a: 'Yes. A hold records the token amount and an expiry; it is then converted to a booking, released or left to expire.' },
    { q: 'Do bookings update inventory?', a: 'Yes. Inventory and bookings are the same system, so a booked unit no longer shows as available.' },
    { q: 'Does RE send visit reminders to buyers?', a: 'Reminders inside RE go to your team. Messages to buyers over WhatsApp need your WhatsApp Business account connected.' },
  ],
  related: [
    { href: '/inventory-management', label: 'Inventory management', body: 'Live availability for every unit.' },
    { href: '/sales-analytics', label: 'Sales analytics', body: 'Lead-to-visit-to-booking conversion.' },
    { href: '/developers', label: 'For developers', body: 'How developer sales teams use RE.' },
  ],
}

export const metadata = productMetadata(c)
export default function Page() { return <ProductPage c={c} /> }
