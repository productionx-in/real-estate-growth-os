// components/marketing/MarketingFooter.tsx
import Link from 'next/link'
import { COMPANY_NAME, PRODUCT_FULL_NAME } from '@/lib/brand'
import { BrandMark } from './BrandMark'

export function MarketingFooter() {
  return (
    <footer className="bg-[#0b1220] text-slate-400">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-12 grid gap-8 md:grid-cols-[2fr_1fr_1fr]">
        <div>
          <BrandMark inverted />
          <p className="mt-3 text-[13px] max-w-sm leading-relaxed">
            The sales operating system for real-estate developers and channel partner agencies: every enquiry captured, assigned in seconds and followed through to the site visit and booking.
          </p>
        </div>
        <div className="text-[13px] space-y-2">
          <p className="font-semibold text-slate-200">Product</p>
          <p><Link className="hover:text-white" href="/#how-it-works">How it works</Link></p>
          <p><Link className="hover:text-white" href="/pricing">Pricing</Link></p>
          <p><Link className="hover:text-white" href="/leakage-audit">Free lead-leakage audit</Link></p>
          <p><Link className="hover:text-white" href="/demo">Book a demo</Link></p>
        </div>
        <div className="text-[13px] space-y-2">
          <p className="font-semibold text-slate-200">Account</p>
          <p><Link className="hover:text-white" href="/login">Sign in</Link></p>
          <p className="pt-2 font-semibold text-inverse">Legal</p>
          <p><Link className="hover:text-inverse" href="/privacy">Privacy Policy</Link></p>
          <p><Link className="hover:text-inverse" href="/terms">Terms of Service</Link></p>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-5 text-[12px] flex flex-col sm:flex-row gap-2 justify-between">
          <span>© {new Date().getFullYear()} {COMPANY_NAME}. All rights reserved.</span>
          <span>{PRODUCT_FULL_NAME}</span>
        </div>
      </div>
    </footer>
  )
}
