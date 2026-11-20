// components/marketing/MarketingShell.tsx
import { MarketingHeader } from './MarketingHeader'
import { MarketingFooter } from './MarketingFooter'
import { SupportBubble } from '@/components/support/SupportBubble'
import { JsonLd, organizationJsonLd, softwareApplicationJsonLd, websiteJsonLd } from './JsonLd'

export function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-white text-[var(--foreground)] text-[15px]">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-3 focus:py-2 focus:bg-white focus:rounded">Skip to content</a>
      {/* The same entity description on every public page: who we are, what the site is, what the product is. */}
      <JsonLd data={[organizationJsonLd(), websiteJsonLd(), softwareApplicationJsonLd()]} />
      <MarketingHeader />
      <main id="main" className="flex-1">{children}</main>
      <MarketingFooter />
      <SupportBubble context="website" />
    </div>
  )
}
