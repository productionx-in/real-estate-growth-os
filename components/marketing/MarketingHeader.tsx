// components/marketing/MarketingHeader.tsx
import Link from 'next/link'
import { BrandMark } from './BrandMark'

const NAV = [
  { href: '/#how-it-works', label: 'How it works' },
  { href: '/#features', label: 'Features' },
  { href: '/migration', label: 'Migration' },
  { href: '/pricing', label: 'Pricing' },
]

export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-30 bg-white/85 backdrop-blur border-b border-[var(--border)]">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <Link href="/" aria-label="REGrow home"><BrandMark /></Link>
        <nav aria-label="Main" className="hidden md:flex items-center gap-7 text-[14px] text-[var(--foreground-muted)]">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="hover:text-[var(--foreground)] transition-colors">{n.label}</Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/login" className="px-3 py-2 text-[14px] font-medium text-[var(--foreground)] hover:text-[var(--brand)]">Sign in</Link>
          <Link href="/demo" className="px-4 py-2 text-[14px] font-semibold text-white bg-[var(--brand)] hover:bg-[var(--brand-hover)] rounded-lg shadow-sm transition-colors">
            Book a demo
          </Link>
        </div>
      </div>
    </header>
  )
}
