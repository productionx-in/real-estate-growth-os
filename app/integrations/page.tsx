// app/integrations/page.tsx — Integrations, with each source's real requirements stated.
import { ProductPage, productMetadata, type ProductPageContent } from '@/components/marketing/ProductPage'

const c: ProductPageContent = {
  path: '/integrations',
  metaTitle: 'Real Estate CRM Integrations: Lead Sources, Forms, API and WhatsApp',
  metaDescription:
    'Lead sources that connect to REGrow and what each needs: forms, import and API work straight away; Meta, Google, WhatsApp and portals need your own accounts.',
  breadcrumb: 'Integrations',
  eyebrow: 'Integrations',
  h1: 'Bring every enquiry into one place — with no surprises about setup',
  intro:
    'Some sources work as soon as your workspace is ready. Others depend on your own business accounts and, for property portals, on the portal granting API access. We tell you which is which up front and set them up with you.',
  definition: {
    question: 'How do real estate leads get into a CRM?',
    answer:
      'Leads arrive through website forms, through connections to ad platforms (such as Meta and Google lead forms), property portals and WhatsApp, through an API or webhook from other systems, or by importing a file. Platform connections use the business’s own accounts and permissions, so each one is authorised by the business before leads can flow.',
  },
  capabilityGroups: [
    { heading: 'Ready to use', ids: ['website_forms', 'microsites', 'csv_import', 'api_webhooks'] },
    { heading: 'Connect with your own account', ids: ['meta_leads', 'google_leads', 'whatsapp', 'portal_leads'] },
  ],
  sections: [
    {
      heading: 'What “connect with your own account” means',
      paragraphs: [
        'Meta, Google and WhatsApp require the business that owns the ad account or phone number to authorise the connection, and WhatsApp messages are charged by Meta. Property portals decide whether to grant API or lead-delivery access to an account. These requirements come from the platforms; we help you through them during onboarding.',
      ],
    },
  ],
  faq: [
    { q: 'Do I need a developer to connect sources?', a: 'No. Website forms are embedded with a snippet, and platform connections are authorised from inside REGrow. We do the setup with you.' },
    { q: 'Is there an API?', a: 'Yes. Leads can be sent to REGrow through a documented API with your workspace’s API key, or an inbound webhook.' },
    { q: 'Which property portals are supported?', a: 'REGrow can receive leads from portals such as 99acres, MagicBricks and Housing.com where the portal grants API or lead-delivery access to your account. Availability depends on the portal.' },
  ],
  related: [
    { href: '/real-estate-crm', label: 'Real estate CRM', body: 'What happens to a lead once it arrives.' },
    { href: '/migration', label: 'Migration & onboarding', body: 'Bringing existing leads and data across.' },
    { href: '/sales-operations', label: 'Sales operations', body: 'Routing leads by source and campaign.' },
  ],
}

export const metadata = productMetadata(c)
export default function Page() { return <ProductPage c={c} /> }
