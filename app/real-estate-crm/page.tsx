// app/real-estate-crm/page.tsx — Real estate CRM and lead management.
import { ProductPage, productMetadata, type ProductPageContent } from '@/components/marketing/ProductPage'

const c: ProductPageContent = {
  path: '/real-estate-crm',
  metaTitle: 'Real Estate CRM and Lead Management Software',
  metaDescription:
    'A real estate CRM built for property sales in India: every buyer enquiry in one inbox, assigned in seconds, followed up on time and tracked from first call to booking.',
  breadcrumb: 'Real estate CRM',
  eyebrow: 'Real estate CRM and lead management',
  h1: 'A real estate CRM that makes sure every buyer gets a call back',
  intro:
    'RE by PX brings every enquiry into one inbox, sends it to the right salesperson in seconds and keeps the follow-ups, site visits and bookings that come after it on track — with projects and inventory in the same system.',
  definition: {
    question: 'What is a real estate CRM?',
    answer:
      'A real estate CRM (customer relationship management system) records every buyer enquiry, who owns it, every conversation and follow-up, and where the buyer is in the sales journey — from enquiry to site visit, booking or loss. A real-estate-specific CRM also connects leads to projects and unit inventory, handles channel partner leads, and measures how fast each enquiry is answered.',
  },
  outcomes: [
    { title: 'One list instead of five inboxes', body: 'Website forms, walk-ins, imports and connected ad, portal and WhatsApp accounts land in one inbox, with duplicates matched on phone number.' },
    { title: 'Every lead has an owner', body: 'Routing rules and fair rotation assign each enquiry the moment it arrives, and the salesperson is notified straight away.' },
    { title: 'Follow-ups that do not depend on memory', body: 'Reminders keep every promised call on the list, and leads not contacted in time are escalated to a manager.' },
  ],
  workflow: {
    heading: 'From enquiry to booking',
    steps: [
      { title: 'Capture', body: 'Each enquiry is saved with its source, campaign and project, and the time it was received.' },
      { title: 'Assign', body: 'Your rules choose the team; rotation chooses the salesperson. Returning buyers go back to the person who knows them.' },
      { title: 'Contact and qualify', body: 'The salesperson calls, logs the outcome and records the buyer’s budget, configuration and location preferences.' },
      { title: 'Follow up', body: 'Next steps are scheduled with reminders; missed first contact is escalated.' },
      { title: 'Visit and book', body: 'Site visits are scheduled and tracked; a booking is recorded against a unit and updates availability.' },
      { title: 'Review', body: 'Managers see each lead’s history, who has it and why, and how quickly it was answered.' },
    ],
  },
  capabilityGroups: [
    { heading: 'Lead capture', ids: ['lead_inbox', 'website_forms', 'csv_import', 'api_webhooks', 'meta_leads', 'google_leads', 'portal_leads', 'whatsapp'] },
    { heading: 'Working leads', ids: ['lead_stages', 'lead_requirements', 'lead_tags_merge', 'follow_ups', 'documents', 'mobile_app'] },
    { heading: 'Control and security', ids: ['roles', 'teams', 'audit_log', 'tenant_isolation'] },
  ],
  sections: [
    {
      heading: 'Why a real-estate-specific CRM',
      paragraphs: [
        'Property buyers compare several projects at once, enquire through ads, portals, websites and partners, and take weeks or months to decide. A general CRM records contacts; a real estate CRM also has to know the project and unit, the site visit, the channel partner who brought the buyer, and the inventory that is still available.',
        'RE by PX is built around that journey, so salespeople spend their time on calls and visits rather than on keeping records in step.',
      ],
    },
  ],
  faq: [
    { q: 'Is there a limit on the number of leads?', a: 'Lead allowances depend on the package. Enquiries from connected sources are always saved, so a buyer enquiry is never lost.' },
    { q: 'Can salespeople use RE by PX on their phones?', a: 'Yes. RE by PX works in any phone browser and can be installed to the home screen, with push notifications for new leads. There is no separate native app.' },
    { q: 'Does RE by PX include a dialer or call recording?', a: 'No. Salespeople call from their own phones and log the outcome in RE by PX.' },
    { q: 'Can we bring our existing leads?', a: 'Yes, from a CSV or Excel export. Migration starts with an assessment of your data and current system.' },
  ],
  related: [
    { href: '/sales-operations', label: 'Sales operations', body: 'Routing, rotation, follow-ups and response time.' },
    { href: '/integrations', label: 'Integrations', body: 'Where leads come from and what each source needs.' },
    { href: '/resources/real-estate-lead-response-time', label: 'Guide: lead response time', body: 'Why the first call decides the site visit.' },
  ],
}

export const metadata = productMetadata(c)
export default function Page() { return <ProductPage c={c} /> }
