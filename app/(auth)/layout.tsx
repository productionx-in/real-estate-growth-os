// app/(auth)/layout.tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PRODUCT_NAME } from '@/lib/brand'
import { SupportBubble } from '@/components/support/SupportBubble'

export const metadata: Metadata = {
  title: 'Sign In',
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen bg-[var(--background)] flex items-center justify-center p-4 pt-16">
      <Link href="/" className="absolute left-4 top-4 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium text-[var(--foreground-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] sm:left-6 sm:top-6">
        <ArrowLeft className="size-4" aria-hidden="true" /> Back to home
      </Link>
      <div className="w-full max-w-md">
        {/* Brand mark */}
        <div className="mb-8 text-center">
          <Link href="/" className="inline-flex items-center gap-2.5" aria-label={`${PRODUCT_NAME} home`}>
            <div className="w-8 h-8 rounded-lg bg-[var(--brand)] flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 1L14 5V11L8 15L2 11V5L8 1Z" fill="white" fillOpacity="0.9" />
              </svg>
            </div>
            <span className="text-[15px] font-semibold text-[var(--foreground)] tracking-tight">
              {PRODUCT_NAME}
            </span>
          </Link>
        </div>
        {children}
      </div>
      <SupportBubble context="auth" />
    </div>
  )
}
