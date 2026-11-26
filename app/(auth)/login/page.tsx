// app/(auth)/login/page.tsx — one sign-in for every customer: developers, builders and channel partner agencies use
// the same form and land in their own workspace (what they see follows their workspace type, role and plan modules,
// set by RE in the console). RE staff use an unlisted address (/login?for=staff, or any /platform link)
// that looks different on purpose: a dark console card, so nobody mistakes one for the other. Hiding it is only tidiness: what anyone can open is always decided on the
// server by memberships (customers) or platform role plus an authenticator code (staff).
import { FullscreenLoader } from '@/components/ui/fullscreen-loader'
import { LINK_PROBLEM_MESSAGE, type LinkProblem } from '@/lib/auth/recovery'
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { ShieldCheck } from 'lucide-react'
import { LoginForm } from '@/components/auth/LoginForm'
import { audienceHome } from '@/lib/workspace/select'
import { AuthFrame } from '@/components/auth/AuthFrame'
import { CustomerSignIn } from '@/components/login/CustomerSignIn'

export const metadata: Metadata = { title: 'Sign In' }

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ for?: string; redirectTo?: string; error?: string; mode?: string }> }) {
  const sp = await searchParams
  const staff = sp.for === 'staff' || !!sp.redirectTo?.startsWith('/platform')
  const linkProblem = sp.error && sp.error in LINK_PROBLEM_MESSAGE ? LINK_PROBLEM_MESSAGE[sp.error as LinkProblem] : sp.error === 'auth_callback_failed' ? LINK_PROBLEM_MESSAGE.link_invalid : null
  // Staff sign in on /staff (the team page); "forgot password" stays here in the framed card.
  if (staff && sp.mode !== 'forgot') {
    const keep = new URLSearchParams()
    if (sp.redirectTo) keep.set('redirectTo', sp.redirectTo)
    redirect(`/staff${keep.size ? `?${keep}` : ''}`)
  }
  // Customers: the full RE sign-in page. Staff, and "forgot password", use the framed card below.
  if (!staff && sp.mode !== 'forgot') {
    return (
      <Suspense fallback={null}>
        <CustomerSignIn notice={linkProblem ? <p role="alert" className="rounded-lg border border-warning/30 bg-warning-bg px-3 py-2 text-[13px] text-foreground">{linkProblem}</p> : undefined} />
      </Suspense>
    )
  }
  return (
    <AuthFrame>
    <div className={staff ? 'theme-dark band-ink rounded-[28px] border border-[rgb(255_255_255/0.1)] p-6 shadow-xl sm:p-8' : 'ceramic !rounded-[28px] p-6 sm:p-9'} data-audience={staff ? 'staff' : 'customer'}>
      {staff ? (
        <div className="mb-6">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgb(255_255_255/0.15)] bg-[rgb(255_255_255/0.06)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-[#c7d2fe]">
            <ShieldCheck className="size-3.5" aria-hidden="true" /> Staff console
          </span>
          <h1 className="mt-3 text-[26px] font-extrabold tracking-tight text-[#fff]">RE team sign-in</h1>
          <p className="mt-1 text-sm text-[#94a3b8]">For Production X staff only. You will be asked for your authenticator code.</p>
        </div>
      ) : (
        <div className="mb-6">
          <h1 className="text-[26px] font-extrabold tracking-tight text-[var(--foreground)]">Sign in to RE</h1>
          <p className="mt-1 text-sm text-[var(--foreground-muted)]">Developers, builders and channel partner agencies — one sign-in, straight to your workspace.</p>
        </div>
      )}
      {sp.error && sp.error in LINK_PROBLEM_MESSAGE && (
        <p role="alert" className="mb-4 rounded-lg border border-warning/30 bg-warning-bg px-3 py-2 text-[13px] text-[var(--foreground)]">
          {staff ? 'That link has expired or was already used. Ask the Platform Owner for a new one.' : LINK_PROBLEM_MESSAGE[sp.error as LinkProblem]}
        </p>
      )}
      {sp.error === 'auth_callback_failed' && (
        <p role="alert" className="mb-4 rounded-lg border border-warning/30 bg-warning-bg px-3 py-2 text-[13px] text-[var(--foreground)]">{LINK_PROBLEM_MESSAGE.link_invalid}</p>
      )}

      <Suspense fallback={<FullscreenLoader label="Loading…" />}>
        <LoginForm defaultRedirect={staff ? audienceHome('staff') : '/select-org'} staff={staff} />
      </Suspense>
      {!staff && (
        <p className="mt-6 text-center text-[13px] text-[var(--foreground-muted)]">
          New to RE? <Link href="/demo" className="font-medium text-[var(--brand)] hover:underline">Book a demo</Link>
        </p>
      )}
    </div>
    </AuthFrame>
  )
}
