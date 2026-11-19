// components/marketing/MarketingHeader.tsx — public site navigation from the page map (lib/marketing/site-pages.ts).
// Desktop: Product and Solutions menus open on hover and on keyboard focus (no JavaScript needed). Phones: a menu
// button opens the full list (MobileMenu).
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import { pagesIn } from '@/lib/marketing/site-pages'
import { BrandMark } from './BrandMark'
import { MobileMenu } from './MobileMenu'

const MENUS = [
  { label: 'Product', items: pagesIn('product') },
  { label: 'Solutions', items: pagesIn('solutions') },
]
const LINKS = [
  { href: '/inventory-management', label: 'Inventory' },
  { href: '/resources', label: 'Resources' },
  { href: '/pricing', label: 'Pricing' },
]

export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-30 bg-surface/90 backdrop-blur border-b border-[var(--border)]">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <Link href="/" aria-label="REGrow home"><BrandMark /></Link>
        <nav aria-label="Main" className="hidden lg:flex items-center gap-1 text-[14px] text-muted">
          {MENUS.map((m) => (
            <div key={m.label} className="relative group">
              <button type="button" aria-haspopup="true" className="inline-flex items-center gap-1 px-3 py-2 rounded-lg hover:text-foreground focus-visible:text-foreground">
                {m.label} <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
              <div className="invisible opacity-0 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 transition-opacity absolute left-0 top-full pt-2 w-[380px]">
                <ul className="rounded-2xl border border-[var(--border)] bg-surface shadow-xl p-2">
                  {m.items.map((p) => (
                    <li key={p.path}>
                      <Link href={p.path} className="block rounded-xl px-3 py-2.5 hover:bg-surface-hover focus-visible:bg-surface-hover">
                        <span className="block text-[14px] font-semibold text-foreground">{p.label}</span>
                        <span className="block text-[13px] text-muted">{p.blurb}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
          {LINKS.map((n) => (
            <Link key={n.href} href={n.href} className="px-3 py-2 rounded-lg hover:text-foreground">{n.label}</Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/login" className="hidden sm:inline-flex px-3 py-2 text-[14px] font-medium text-foreground hover:text-[var(--brand)]">Sign in</Link>
          <Link href="/demo" className="px-4 py-2 text-[14px] font-semibold text-brand-foreground bg-brand hover:bg-brand-hover rounded-lg shadow-sm transition-colors">
            Book a demo
          </Link>
          <MobileMenu groups={[...MENUS.map((m) => ({ label: m.label, links: m.items.map((p) => ({ href: p.path, label: p.label })) })),
            { label: 'More', links: [...LINKS, { href: '/demo?interest=contact', label: 'Contact the team' }, { href: '/login', label: 'Sign in' }] }]} />
        </div>
      </div>
    </header>
  )
}
