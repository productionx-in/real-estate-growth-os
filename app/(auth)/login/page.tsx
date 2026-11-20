// app/(auth)/login/page.tsx — one sign-in for everyone. The public page offers two entry points: developers and
// builders, and channel partner agencies. REGrow staff use an unlisted address (/login?for=staff, or any /platform link)
// that is never shown or linked publicly. Hiding it is only tidiness: what anyone can open is always decided on the
// server by memberships (customers) or platform role plus an authenticator code (staff).
import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { Building2, Handshake, ShieldCheck } from 'lucide-react'
import { LoginForm } from '@/components/auth/LoginForm'
import { PUBLIC_AUDIENCES, audienceHome, parseAudience, type SignInAudience } from '@/lib/workspace/select'

export const metadata: Metadata = { title: 'Sign In' }

const ICON = { developer: Building2, agency: Handshake, staff: ShieldCheck } as const
const HEADING: Record<SignInAudience, { title: string; sub: string }> = {
  developer: { title: 'Sign in to your developer workspace', sub: 'Leads, sales teams, projects, inventory and partner agencies.' },
  agency: { title: 'Sign in to your agency workspace', sub: 'Your buyers, your team and the developers you work with.' },
  staff: { title: 'REGrow team sign-in', sub: 'Internal console. You will be asked for your authenticator code.' },
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ for?: string; redirectTo?: string; error?: string }> }) {
  const sp = await searchParams
  const audience: SignInAudience = sp.redirectTo?.startsWith('/platform') ? 'staff' : parseAudience(sp.for)
  const keep = sp.redirectTo ? `&redirectTo=${encodeURIComponent(sp.redirectTo)}` : ''
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6 sm:p-8 shadow-sm">
      {audience !== 'staff' && (
      <nav aria-label="I am signing in as" className="mb-6 grid grid-cols-2 gap-1.5 rounded-xl bg-[var(--surface-hover)] p-1">
        {PUBLIC_AUDIENCES.map((a) => {
          const Icon = ICON[a.id]
          const active = a.id === audience
          return (
            <Link key={a.id} href={`/login?for=${a.id}${keep}`} aria-current={active ? 'page' : undefined} title={a.hint}
              className={`flex flex-col items-center gap-1 rounded-lg px-2 py-2 text-center text-[12px] font-medium leading-tight transition-colors ${active ? 'bg-[var(--surface)] text-[var(--brand)] shadow-sm' : 'text-[var(--foreground-muted)] hover:text-[var(--foreground)]'}`}>
              <Icon className="size-4" aria-hidden="true" />
              {a.label}
            </Link>
          )
        })}
      </nav>
      )}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[var(--foreground)]">{HEADING[audience].title}</h1>
        <p className="mt-1 text-sm text-[var(--foreground-muted)]">{HEADING[audience].sub}</p>
      </div>
      {sp.error === 'link_invalid' && (
        <p role="alert" className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--surface-hover)] px-3 py-2 text-[13px] text-[var(--foreground)]">
          That link has expired or was already used. Ask the person who sent it for a new one.
        </p>
      )}

      <Suspense fallback={<div>Loading login...</div>}>
        <LoginForm defaultRedirect={audienceHome(audience)} />
      </Suspense>
      {audience !== 'staff' && (
        <p className="mt-6 text-center text-[13px] text-[var(--foreground-muted)]">
          New to REGrow? <Link href="/demo" className="font-medium text-[var(--brand)] hover:underline">Book a demo</Link>
        </p>
      )}
    </div>
  )
}
