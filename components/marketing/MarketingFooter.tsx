// components/marketing/MarketingFooter.tsx — every public page linked, from the page map.
import Link from 'next/link'
import { COMPANY_NAME, PRODUCT_DESCRIPTOR, PRODUCT_NAME } from '@/lib/brand'
import { pagesIn } from '@/lib/marketing/site-pages'
import { BrandMark } from './BrandMark'

const link = 'hover:text-inverse'

export function MarketingFooter() {
  const cols = [
    { title: 'Product', links: pagesIn('product').map((p) => ({ href: p.path, label: p.label })) },
    { title: 'Solutions', links: pagesIn('solutions').map((p) => ({ href: p.path, label: p.label })) },
    { title: 'Resources', links: [...pagesIn('resources').map((p) => ({ href: p.path, label: p.label.replace(/^Guide: (.)/, (_, c: string) => c.toUpperCase()) })), { href: '/leakage-audit', label: 'Free lead-leakage audit' }] },
    { title: 'Company', links: [{ href: '/pricing', label: 'Pricing' }, { href: '/demo', label: 'Book a demo' }, { href: '/contact', label: 'Contact' }, { href: '/login', label: 'Sign in' }, { href: '/privacy', label: 'Privacy Policy' }, { href: '/terms', label: 'Terms of Service' }, { href: '/refund-policy', label: 'Refund & Cancellation' }] },
  ]
  return (
    <footer className="bg-[#0b1220] text-slate-400">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-12 grid gap-10 lg:grid-cols-[1.4fr_repeat(4,1fr)]">
        <div>
          <BrandMark inverted />
          <p className="mt-3 text-[13px] max-w-xs leading-relaxed">
            {PRODUCT_NAME} is the {PRODUCT_DESCRIPTOR.toLowerCase()} for real estate developers and channel partner agencies: leads, sales teams,
            projects and inventory, site visits, bookings and partner workflows in one platform.
          </p>
        </div>
        {cols.map((c) => (
          <nav key={c.title} aria-label={c.title} className="text-[13px]">
            <p className="font-semibold text-inverse">{c.title}</p>
            <ul className="mt-3 space-y-2">
              {c.links.map((l) => <li key={l.href}><Link className={link} href={l.href}>{l.label}</Link></li>)}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-5 text-[12px] flex flex-col sm:flex-row gap-2 justify-between">
          <span>© {new Date().getFullYear()} {COMPANY_NAME}. All rights reserved.</span>
          <span>{PRODUCT_NAME} by {COMPANY_NAME}</span>
        </div>
      </div>
    </footer>
  )
}
