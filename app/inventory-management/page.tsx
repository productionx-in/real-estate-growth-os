// app/inventory-management/page.tsx — Real estate inventory management: a major product category, not a CRM add-on.
import { ProductPage, productMetadata, type ProductPageContent } from '@/components/marketing/ProductPage'

const c: ProductPageContent = {
  path: '/inventory-management',
  metaTitle: 'Real Estate Inventory Management Software for Developers',
  metaDescription:
    'Manage projects, towers, floors and units with live availability, unit holds, bookings and audit history. Inventory management software for Indian developers.',
  breadcrumb: 'Inventory management',
  eyebrow: 'Real estate inventory management',
  h1: 'One current inventory for every project, tower, floor and unit',
  intro:
    'RE keeps your property inventory in one place, structured the way your projects are built. Sales teams, managers and channel partners see the same availability, units are held and booked through controlled steps, and every change is recorded.',
  definition: {
    question: 'What is real estate inventory management software?',
    answer:
      'Real estate inventory management software keeps a developer’s saleable units — apartments, villas, plots, offices or shops — in a structured, single record with each unit’s configuration, area, price and status (available, on hold, booked or sold). It replaces shared spreadsheets so that everyone selling a project works from the same availability, double-selling is prevented, and the history of every unit is auditable.',
  },
  primaryCta: { label: 'See inventory in a demo', href: '/demo' },
  outcomes: [
    { title: 'No more “is this unit still available?”', body: 'Availability changes the moment a unit is held, booked or released, so nobody quotes a unit that went yesterday.' },
    { title: 'Holds that expire on their own terms', body: 'A unit held for a buyer carries a token amount and an expiry, and is either converted to a booking or released — not forgotten.' },
    { title: 'Partners see what you choose', body: 'Share a project with partner agencies and decide whether they see nothing, availability only, or availability with prices.' },
  ],
  workflow: {
    heading: 'How inventory works in RE',
    intro: 'From project setup to a sold unit, each step is a controlled action rather than an edit to a shared sheet.',
    steps: [
      { title: 'Set up the project', body: 'Create the project with its category (apartments, villas, plots, commercial or mixed use), RERA number, approvals, dates, amenities and specifications.' },
      { title: 'Build the structure', body: 'Arrange phases, towers, blocks, floors or clusters to mirror the real project, in the order you sell them.' },
      { title: 'Load the units', body: 'Add units one by one or import a sheet of hundreds. Each unit has its number, configuration (for example 2 BHK or 3 BHK), carpet and built-up areas, facing, floor, parking and price. The import is validated before anything is saved.' },
      { title: 'Sell from live availability', body: 'Sales teams filter the inventory table or use the visual floor-by-floor view, and match units to a buyer’s recorded requirements.' },
      { title: 'Hold, book and release', body: 'Hold a unit for a buyer with a token amount and an expiry; convert it to a booking or release it. Status changes follow allowed transitions, so a sold unit cannot quietly become available again.' },
      { title: 'Track and report', body: 'Every status change is kept with who made it and when. Absorption — available, blocked, booked and sold — is reported per organisation.' },
    ],
  },
  capabilityGroups: [
    { heading: 'Projects and structure', ids: ['projects', 'hierarchy', 'units', 'inventory_import'] },
    { heading: 'Availability and control', ids: ['inventory_status', 'unit_blocking', 'bookings', 'inventory_history', 'inventory_views'] },
    { heading: 'Sharing and reporting', ids: ['price_permissions', 'project_sharing', 'lead_requirements', 'inventory_absorption', 'microsites'] },
  ],
  sections: [
    {
      heading: 'Built for how Indian developers structure projects',
      paragraphs: [
        'An apartment project is phases, towers and floors; a plotted development is phases, streets and plots; a commercial project mixes offices, retail and showrooms. RE lets each project take its own shape instead of forcing every project into the same template, and keeps the unit attributes that matter for each category — carpet and super built-up area for apartments, plot dimensions, road width and corner plots for plotted developments.',
        'Inventory is part of the same system as leads, site visits and bookings, so a booking updates availability and a salesperson can see what is available while talking to the buyer.',
      ],
    },
    {
      heading: 'Pricing visibility and permissions',
      paragraphs: [
        'Each unit can carry its price. Inside your organisation, access follows the roles you assign. For channel partners, visibility is set per shared project: nothing, availability without prices, or availability with prices. New shares default to availability without prices.',
      ],
    },
  ],
  faq: [
    { q: 'Can we import our existing inventory sheet?', a: 'Yes. Bulk import validates every row — duplicates, missing fields and invalid values are reported before anything is saved. During onboarding we help map your sheet to RE’s fields.' },
    { q: 'Which statuses can a unit have?', a: 'Available, on hold, blocked, booked and sold. Changes follow allowed transitions and are recorded in the unit’s history.' },
    { q: 'Does RE handle plotted developments and commercial projects?', a: 'Yes. Projects can be apartments, villas and gated communities, plotted developments, commercial or mixed use, and each keeps the attributes relevant to its category.' },
    { q: 'Can channel partners see our inventory?', a: 'Only for projects you share with them, and only at the visibility you choose: none, availability only, or availability with prices.' },
    { q: 'Does RE manage payment schedules and demand letters?', a: 'RE records bookings and the booking amount received. Post-sales collections such as payment schedules and demand letters are not part of RE today.' },
  ],
  related: [
    { href: '/site-visits-and-bookings', label: 'Site visits & bookings', body: 'From a scheduled visit to a held and booked unit.' },
    { href: '/channel-partner-management', label: 'Channel partner management', body: 'Share projects and inventory with partner agencies.' },
    { href: '/resources/real-estate-inventory-management-guide', label: 'Guide: managing real estate inventory', body: 'How developers structure, price and control unit inventory.' },
  ],
}

export const metadata = productMetadata(c)
export default function Page() { return <ProductPage c={c} /> }
