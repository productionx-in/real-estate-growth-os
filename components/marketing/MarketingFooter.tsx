// components/marketing/MarketingFooter.tsx — every public page linked, from the page map.
import Link from 'next/link'
import { COMPANY_NAME, COMPANY_URL, PRODUCT_DESCRIPTOR, PRODUCT_NAME } from '@/lib/brand'
import { PxMark } from '@/components/brand/Logo'
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
    <footer className="band-ink text-[#94a3b8]">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-12 grid gap-10 lg:grid-cols-[1.4fr_repeat(4,1fr)]">
        <div>
          <BrandMark size={32} />
          <p className="mt-3 text-[13px] max-w-xs leading-relaxed">
            {PRODUCT_NAME} is the real estate growth OS for real estate developers and channel partner agencies: leads, sales teams,
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
          <a href={COMPANY_URL} target="_blank" rel="noopener" className="inline-flex items-center gap-2 hover:text-[#e2e8f0]">
            <PxMark variant="dark" height={18} />
            <span>A {COMPANY_NAME} product · © {new Date().getFullYear()} {COMPANY_NAME}. All rights reserved.</span>
          </a>
          <span className="uppercase tracking-[0.18em] text-[11px]">{PRODUCT_DESCRIPTOR}</span>
        </div>
      </div>
    </footer>
  )
}
