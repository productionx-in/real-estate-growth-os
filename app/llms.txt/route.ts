// app/llms.txt/route.ts — a plain-text description of RE for AI assistants and answer engines (llms.txt
// convention): who we are, what the product does, each capability with its honest status, and where to read more.
// Generated from the same sources as the website (brand, capability register, page map), so it never drifts.
import { COMPANY_NAME, PRODUCT_DESCRIPTOR, PRODUCT_NAME } from '@/lib/brand'
import { CAPABILITIES, type CapabilityStatus } from '@/lib/marketing/capabilities'
import { SITE_PAGES } from '@/lib/marketing/site-pages'
import { PRICES_PUBLISHED } from '@/lib/marketing/pricing'
import { absolute, siteUrl } from '@/lib/site/urls'

const STATUS_TEXT: Record<CapabilityStatus, string | null> = {
  in_production: 'available',
  available: 'available',
  needs_setup: 'available; needs the customer’s own account connected',
  partial: 'partially available',
  planned: 'planned',
  not_available: null,
}

export function GET() {
  const site = siteUrl()
  const url = (p: string) => absolute(p, site)
  const caps = Object.values(CAPABILITIES)
  const lines = [
    `# ${PRODUCT_NAME}`,
    '',
    `> ${PRODUCT_NAME} is a ${PRODUCT_DESCRIPTOR} — a sales and operations platform for real estate developers, builders and channel partner agencies in India. It connects lead management, sales teams, projects and property inventory, site visits, bookings and channel partner workflows in one web application. ${PRODUCT_NAME} is a product of ${COMPANY_NAME}.`,
    '',
    'Key facts:',
    `- Audiences: real estate developers and builders; channel partner agencies and brokerages. Each organisation has its own separate workspace.`,
    '- Delivery: web application that works in any browser and installs on phones; no native app.',
    `- Pricing: packages for developers and for agencies; ${PRICES_PUBLISHED ? `published at ${url('/pricing')}` : 'prices are provided on request'}.`,
    '- Migration: assessment-led; scope depends on the customer’s current system and data. Migration is not automatic.',
    '',
    '## Pages',
    ...SITE_PAGES.map((p) => `- [${p.label}](${url(p.path)}): ${p.blurb}`),
    '',
    '## Capabilities',
    ...caps.filter((c) => STATUS_TEXT[c.status]).map((c) => `- ${c.name} (${STATUS_TEXT[c.status]}): ${c.summary}${'publicNote' in c && c.publicNote ? ` ${c.publicNote}` : ''}`),
    '',
    '## Not available',
    ...caps.filter((c) => c.status === 'not_available').map((c) => `- ${c.name}`),
    '',
  ]
  return new Response(lines.join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } })
}
