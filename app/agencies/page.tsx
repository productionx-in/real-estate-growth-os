// app/agencies/page.tsx — Audience page: channel partner agencies and brokerages.
import { ProductPage, productMetadata, type ProductPageContent } from '@/components/marketing/ProductPage'

const c: ProductPageContent = {
  path: '/agencies',
  metaTitle: 'Real Estate Agency and Channel Partner CRM',
  metaDescription:
    'Agency CRM for channel partners and brokerages: manage buyers and follow-ups, work with several developers, see shared inventory and register buyers.',
  breadcrumb: 'For agencies',
  eyebrow: 'For channel partner agencies and brokerages',
  h1: 'Your buyers, your follow-ups, every developer you work with — in your own workspace',
  intro:
    'Agencies sell many developers’ projects to the same buyers. RE by PX gives your agency its own CRM for buyers and follow-ups, connects you with the developers you work with, and keeps a clear record of every buyer you register.',
  primaryCta: { label: 'Book an agency demo', href: '/demo?plan=agencies' },
  outcomes: [
    { title: 'Your buyers stay yours', body: 'Your agency has its own independent workspace. Partnering with a developer never gives them your buyer list.' },
    { title: 'Many developers, one place', body: 'Connect with each developer you work with, see the projects they share and register buyers against them.' },
    { title: 'Registrations on record', body: 'Each registration is time-stamped with the buyer’s consent recorded, so who registered first is never a matter of opinion.' },
  ],
  workflow: {
    heading: 'How an agency works in RE by PX',
    steps: [
      { title: 'Capture buyers', body: 'Enquiries from your forms, imports and connected sources land in your inbox and are assigned to your team.' },
      { title: 'Follow up', body: 'Reminders keep every promised call; requirements are recorded for each buyer.' },
      { title: 'Connect with developers', body: 'Share your partner code; accept partnership requests from developers.' },
      { title: 'See shared projects', body: 'View the projects each developer shares with you, at the inventory visibility they chose.' },
      { title: 'Register buyers', body: 'Register a buyer for a developer’s project; the developer reviews it.' },
      { title: 'Track progress', body: 'Follow each registration and deal from your own workspace.' },
    ],
  },
  capabilityGroups: [
    { heading: 'Agency CRM', ids: ['lead_inbox', 'rotation', 'follow_ups', 'lead_requirements', 'mobile_app', 'agency_ownership'] },
    { heading: 'Developer relationships', ids: ['partner_network', 'project_sharing', 'buyer_registration', 'price_permissions'] },
  ],
  faq: [
    { q: 'Does a developer’s partnership give them access to our buyers?', a: 'No. Developers see only the buyers you register with them. Your workspace and your other buyers stay private.' },
    { q: 'Do we pay if a developer invites us?', a: 'Each agency has its own workspace and plan. A developer partnering with you does not pay for your workspace, and you do not pay for theirs.' },
    { q: 'Can we work with developers who do not use RE by PX?', a: 'Yes, as an agency CRM for your own buyers and follow-ups. Online buyer registration works with developers who are on RE by PX.' },
  ],
  related: [
    { href: '/channel-partner-management', label: 'Channel partner management', body: 'How developers manage the partner network.' },
    { href: '/resources/channel-partner-buyer-registration', label: 'Guide: buyer registration', body: 'Registering buyers fairly with developers.' },
    { href: '/real-estate-crm', label: 'Real estate CRM', body: 'Lead management for your team.' },
  ],
}

export const metadata = productMetadata(c)
export default function Page() { return <ProductPage c={c} /> }
