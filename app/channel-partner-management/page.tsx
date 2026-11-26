// app/channel-partner-management/page.tsx — Channel partner management for developers (the agency view is /agencies).
import { ProductPage, productMetadata, type ProductPageContent } from '@/components/marketing/ProductPage'

const c: ProductPageContent = {
  path: '/channel-partner-management',
  metaTitle: 'Real Estate Channel Partner Management Software',
  metaDescription:
    'Share projects and inventory with channel partner agencies and review buyer registrations with clear, auditable conflict rules. Built for real estate developers.',
  breadcrumb: 'Channel partner management',
  eyebrow: 'Channel partner management',
  h1: 'Work with channel partners on clear, fair and auditable terms',
  intro:
    'Developers and partner agencies each keep their own RE by PX workspace. Developers share the projects they choose, partners register their buyers, and the rules for who brought a buyer first are applied the same way every time.',
  definition: {
    question: 'What is channel partner management in real estate?',
    answer:
      'Channel partner management is how a developer works with the brokers and agencies (channel partners) who bring buyers to its projects: sharing project and inventory information, receiving buyer registrations, deciding which partner a buyer belongs to when two claim the same person, and tracking registrations through to booking and commission.',
  },
  outcomes: [
    { title: 'One source of truth for registrations', body: 'Every registration is time-stamped and checked against existing leads, so disputes are settled by the record rather than by phone calls.' },
    { title: 'You control what partners see', body: 'Share a project at the visibility you choose: none, availability only, or availability with prices.' },
    { title: 'Partners keep their own buyers', body: 'Agencies work in their own workspace; a partnership never gives either side access to the other’s data beyond what is shared.' },
  ],
  workflow: {
    heading: 'How the partner network works',
    steps: [
      { title: 'Connect', body: 'Send a partnership request using the agency’s partner code; the agency accepts it from its own workspace.' },
      { title: 'Share projects', body: 'Choose which projects the partner can sell, and how much inventory detail they see.' },
      { title: 'Partner registers a buyer', body: 'The agency submits the buyer for a shared project. The buyer’s consent is recorded.' },
      { title: 'Conflict check', body: 'The registration is checked against your open and booked leads; the first registration submitted wins.' },
      { title: 'Review', body: 'Your admins or managers accept or reject it. Accepted registrations are protected for an agreed period.' },
      { title: 'Track', body: 'Both sides follow the registration’s status; every step is recorded.' },
    ],
  },
  capabilityGroups: [
    { heading: 'Partnerships and sharing', ids: ['partner_network', 'project_sharing', 'price_permissions', 'agency_ownership'] },
    { heading: 'Registrations', ids: ['buyer_registration', 'registration_review', 'commissions', 'audit_log'] },
  ],
  faq: [
    { q: 'Does the partner agency need its own RE by PX account?', a: 'Yes. Each agency has its own workspace and plan, so its buyers stay its own. A partnership connects the two workspaces only for what is shared.' },
    { q: 'How are duplicate registrations handled?', a: 'The registration submitted first wins. A registration for a buyer who is already an open or booked lead with you is flagged as a conflict for your review.' },
    { q: 'Can partners see our prices?', a: 'Only if you choose “availability with prices” for that project. New shares default to availability without prices.' },
    { q: 'Does RE by PX pay partner commissions?', a: 'No. RE by PX records commission details against bookings; payouts are handled outside RE by PX.' },
  ],
  related: [
    { href: '/agencies', label: 'For channel partner agencies', body: 'The agency side of the network.' },
    { href: '/resources/channel-partner-buyer-registration', label: 'Guide: buyer registration', body: 'A fair, auditable registration process.' },
    { href: '/inventory-management', label: 'Inventory management', body: 'The inventory you share with partners.' },
  ],
}

export const metadata = productMetadata(c)
export default function Page() { return <ProductPage c={c} /> }
