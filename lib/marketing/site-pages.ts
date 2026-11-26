// lib/marketing/site-pages.ts — the public website's page map: one place for navigation, footer, hub pages, sitemap
// and the keyword clusters each page owns (docs/marketing/SEO_KEYWORD_MAP.md mirrors this). One page per search
// intent — no duplicate landing pages, no location pages.

export type PageGroup = 'product' | 'solutions' | 'resources' | 'company'

export interface SitePage {
  path: string
  label: string
  group: PageGroup
  /** One line used in menus and hub pages. */
  blurb: string
  /** Primary keyword cluster this page targets. */
  cluster?: string
  priority: number
}

export const SITE_PAGES: SitePage[] = [
  { path: '/features', label: 'Platform overview', group: 'product', priority: 0.8, blurb: 'Everything RE does, in one place.', cluster: 'real estate sales software' },
  { path: '/real-estate-crm', label: 'Real estate CRM', group: 'product', priority: 0.9, blurb: 'Capture, organise and follow up every buyer enquiry.', cluster: 'real estate CRM software' },
  { path: '/inventory-management', label: 'Inventory management', group: 'product', priority: 0.9, blurb: 'Projects, towers, floors and units with live availability.', cluster: 'real estate inventory management software' },
  { path: '/sales-operations', label: 'Sales operations', group: 'product', priority: 0.8, blurb: 'Lead distribution, follow-ups and response time.', cluster: 'real estate lead distribution' },
  { path: '/site-visits-and-bookings', label: 'Site visits & bookings', group: 'product', priority: 0.8, blurb: 'From scheduled visit to booked unit.', cluster: 'site visit management software' },
  { path: '/channel-partner-management', label: 'Channel partner management', group: 'product', priority: 0.9, blurb: 'Share projects and review buyer registrations.', cluster: 'real estate channel partner management software' },
  { path: '/sales-analytics', label: 'Sales analytics', group: 'product', priority: 0.7, blurb: 'Funnel, sources, response time and absorption.', cluster: 'real estate sales analytics' },
  { path: '/integrations', label: 'Integrations', group: 'product', priority: 0.7, blurb: 'Lead sources, forms, API and WhatsApp.', cluster: 'real estate CRM integrations' },
  { path: '/developers', label: 'For developers & builders', group: 'solutions', priority: 0.9, blurb: 'Leads, teams, inventory and partners for developers.', cluster: 'real estate developer software' },
  { path: '/agencies', label: 'For channel partner agencies', group: 'solutions', priority: 0.9, blurb: 'Buyers, follow-ups and developer relationships for agencies.', cluster: 'real estate agency management software' },
  { path: '/migration', label: 'Migration & onboarding', group: 'solutions', priority: 0.7, blurb: 'Move to RE with an assessment-led plan.' },
  { path: '/resources', label: 'Resources', group: 'resources', priority: 0.6, blurb: 'Practical guides for real estate sales teams.' },
  { path: '/resources/real-estate-inventory-management-guide', label: 'Guide: real estate inventory management', group: 'resources', priority: 0.6, blurb: 'How developers structure, price and control unit inventory.', cluster: 'property inventory management' },
  { path: '/resources/channel-partner-buyer-registration', label: 'Guide: channel partner buyer registration', group: 'resources', priority: 0.6, blurb: 'A fair, auditable way to register buyers and settle conflicts.', cluster: 'channel partner CRM' },
  { path: '/resources/real-estate-lead-response-time', label: 'Guide: lead response time', group: 'resources', priority: 0.6, blurb: 'Why the first call decides the site visit, and how to measure it.', cluster: 'real estate lead management' },
  { path: '/pricing', label: 'Pricing', group: 'company', priority: 0.7, blurb: 'Packages for developers and agencies.' },
  { path: '/demo', label: 'Book a demo', group: 'company', priority: 0.7, blurb: 'See RE on your own projects.' },
  { path: '/leakage-audit', label: 'Free lead-leakage audit', group: 'company', priority: 0.6, blurb: 'Measure response time from your own export.' },
]

export const pagesIn = (group: PageGroup) => SITE_PAGES.filter((p) => p.group === group)
export const pageAt = (path: string) => {
  const p = SITE_PAGES.find((x) => x.path === path)
  if (!p) throw new Error(`unknown site page ${path}`)
  return p
}
