// app/(auth)/layout.tsx
import { Logo, PxMark } from '@/components/brand/Logo'
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
          <Link href="/" className="inline-flex items-center" aria-label={`${PRODUCT_NAME} home`}>
            <Logo size={48} className="shadow-[0_6px_16px_-4px_rgba(67,56,202,0.4)] rounded-[12px]" />
          </Link>
        </div>
        {children}
        <p className="mt-6 flex items-center justify-center gap-1.5 text-[12px] text-[var(--foreground-subtle)]">
          <PxMark variant="ink" height={14} className="opacity-60" /> by Production X
        </p>
      </div>
      <SupportBubble context="auth" />
    </div>
  )
}
