// app/(auth)/layout.tsx — sign-in, reset and invitation pages on the 3D sign-in board (components/auth/SignInBoard.tsx):
// the sign-in card and, on wide screens, a floating stack of what's inside RE, tilting together with the pointer.
import { PxMark, ReLogo } from '@/components/brand/Logo'
import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { SupportBubble } from '@/components/support/SupportBubble'
import { SignInBoard } from '@/components/auth/SignInBoard'

export const metadata: Metadata = {
  title: 'Sign In',
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-x-clip bg-[var(--background)]">
      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center px-4 pt-4 sm:px-6 sm:pt-6">
        <Link href="/" className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-[var(--foreground-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]">
          <ArrowLeft className="size-4" aria-hidden="true" /> Back to home
        </Link>
      </header>
      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 items-center px-4 py-8 sm:px-6">
        <SignInBoard>
          <Link href="/" aria-label="RE home" className="mx-auto mb-5 block w-fit rounded-[14px] shadow-[0_10px_24px_-6px_rgba(67,56,202,0.52)] transition-transform duration-300 hover:scale-105">
            <ReLogo size={48} />
          </Link>
          {children}
        </SignInBoard>
      </main>
      <footer className="relative z-10 flex items-center justify-center gap-1.5 pb-6 text-[12px] text-[var(--foreground-subtle)]">
        <PxMark variant="ink" height={14} className="opacity-60" /> by Production X
      </footer>
      <SupportBubble context="auth" />
    </div>
  )
}
