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
    <header className="sticky top-0 z-30 px-3 pt-3 sm:px-4">
      <div className="ceramic mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 !rounded-full px-4 sm:px-5">
        <Link href="/" aria-label="RE by PX home"><BrandMark /></Link>
        <nav aria-label="Main" className="hidden lg:flex items-center gap-1 text-[14px] text-muted">
          {MENUS.map((m) => (
            <div key={m.label} className="relative group">
              <button type="button" aria-haspopup="true" className="inline-flex items-center gap-1 px-3 py-2 rounded-full hover:bg-surface-hover hover:text-foreground focus-visible:text-foreground">
                {m.label} <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
              <div className="invisible opacity-0 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 transition-opacity absolute left-0 top-full pt-2 w-[380px]">
                <ul className="ceramic p-2">
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
            <Link key={n.href} href={n.href} className="px-3 py-2 rounded-full hover:bg-surface-hover hover:text-foreground">{n.label}</Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/login" className="hidden sm:inline-flex px-3 py-2 text-[14px] font-medium text-foreground hover:text-[var(--brand)]">Sign in</Link>
          <Link href="/demo" className="rounded-full bg-[var(--ink)] px-4 py-2 text-[14px] font-semibold text-[#fff] shadow-sm transition-colors hover:bg-brand">
            Book a demo
          </Link>
          <MobileMenu groups={[...MENUS.map((m) => ({ label: m.label, links: m.items.map((p) => ({ href: p.path, label: p.label })) })),
            { label: 'More', links: [...LINKS, { href: '/contact', label: 'Contact the team' }, { href: '/login', label: 'Sign in' }] }]} />
        </div>
      </div>
    </header>
  )
}
