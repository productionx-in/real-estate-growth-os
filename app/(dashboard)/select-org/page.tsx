// app/(dashboard)/select-org/page.tsx — after sign-in: open the user's workspace, or let them choose one.
// One account can belong to several organisations; each is a separate tenant with its own team, data and
// subscription. Memberships are read on the server for the signed-in user only; the chosen workspace is checked
// again by every page and API (getVerifiedWorkspace / authorizeOrgAccess).
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, Building2, Handshake, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { PRODUCT_NAME } from '@/lib/brand'
import { ROLE_LABELS } from '@/lib/auth/permissions'
import { ORG_TYPE_HINT, ORG_TYPE_LABEL, resolveWorkspaceDestination, type OrgType, type WorkspaceChoice } from '@/lib/workspace/select'
import { canCreateOrganisation } from '@/lib/workspace/create'
import { Badge } from '@/components/ui'
import { SignOutButton } from '@/components/auth/SignOutButton'

export const metadata: Metadata = { title: 'Choose a workspace' }
export const dynamic = 'force-dynamic'

interface MembershipRow { role: string | null; organisation: { id: string; name: string; slug: string; type: string } | null }

export default async function SelectOrgPage({ searchParams }: { searchParams: Promise<{ redirectTo?: string; next?: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const sp = await searchParams

  // Find or create the profile for the signed-in user (RLS applies; no elevated access).
  let { data: profile } = await supabase.from('profiles').select('id').eq('auth_user_id', user.id).maybeSingle()
  if (!profile) {
    const fullName = (user.user_metadata?.full_name as string) || user.email?.split('@')[0] || 'User'
    const { data: created } = await supabase.from('profiles').insert({ auth_user_id: user.id, full_name: fullName }).select('id').single()
    profile = created
  }

  const memberships = profile
    ? ((await supabase.from('org_members')
        .select('role, organisation:organisations(id, name, slug, type)')
        .eq('profile_id', profile.id)
        .eq('status', 'active')
        .order('joined_at', { ascending: true })).data ?? []) as unknown as MembershipRow[]
    : []
  const workspaces: WorkspaceChoice[] = memberships
    .filter((m) => m.organisation?.slug)
    .map((m) => ({ slug: m.organisation!.slug, name: m.organisation!.name, type: m.organisation!.type as OrgType, role: m.role ?? 'readonly' }))

  const decision = resolveWorkspaceDestination(workspaces, sp.redirectTo ?? sp.next)
  if (decision.kind === 'redirect') redirect(decision.to)
  const canCreate = await canCreateOrganisation(user.id)

  return (
    <div className="flex min-h-screen flex-col justify-center bg-background px-4 py-12">
      <div className="mx-auto w-full max-w-lg">
        <div className="mb-6 flex items-center justify-center gap-2">
          <div className="flex size-9 items-center justify-center rounded-xl bg-brand text-brand-foreground"><Building2 aria-hidden className="size-5" /></div>
          <span className="text-lg font-bold text-foreground">{PRODUCT_NAME}</span>
        </div>
        <div className="rounded-2xl border border-default bg-surface p-6 shadow-sm sm:p-7">
          {decision.kind === 'none' ? (
            <>
              <h1 className="text-[17px] font-semibold text-foreground">You are not in a workspace yet</h1>
              <p className="mt-2 text-[14px] leading-relaxed text-muted">
                You are signed in as <strong className="text-foreground">{user.email}</strong>, but this account is not a member of any
                organisation. If your company already uses {PRODUCT_NAME}, ask its owner or an administrator to invite this email address.
                If you were invited, open the link in the invitation email.
              </p>
              <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                <Link href="/demo" className="inline-flex h-10 items-center justify-center rounded-lg bg-brand px-4 text-[14px] font-semibold text-brand-foreground hover:bg-brand-hover">Talk to us about a workspace</Link>
                <SignOutButton label="Sign in with another account"
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-strong px-4 text-[14px] font-medium text-foreground hover:bg-surface-hover" />
              </div>
            </>
          ) : (
            <>
              <h1 className="text-[17px] font-semibold text-foreground">Choose a workspace</h1>
              <p className="mt-1.5 text-[14px] leading-relaxed text-muted">
                Your account belongs to {workspaces.length} organisations. Each one is separate — its own team, data and subscription.
                Select the workspace you want to work in; you can switch at any time from the menu.
              </p>
              <ul className="mt-5 space-y-2.5">
                {workspaces.map((w) => (
                  <li key={w.slug}>
                    <Link href={`/${w.slug}`}
                      className="group flex items-center justify-between gap-3 rounded-xl border border-default bg-surface-muted p-3.5 transition-colors hover:border-brand hover:bg-surface-hover">
                      <span className="flex min-w-0 items-start gap-3">
                        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface text-subtle">
                          {w.type === 'channel_partner' ? <Handshake aria-hidden className="size-4" /> : <Building2 aria-hidden className="size-4" />}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-[14px] font-semibold text-foreground group-hover:text-brand">{w.name}</span>
                          <span className="mt-1 flex flex-wrap items-center gap-1.5">
                            <Badge tone={w.type === 'channel_partner' ? 'info' : 'brand'}>{ORG_TYPE_LABEL[w.type]}</Badge>
                            <Badge>{ROLE_LABELS[w.role as keyof typeof ROLE_LABELS] ?? w.role}</Badge>
                          </span>
                          <span className="mt-1 block text-[12px] text-muted">{ORG_TYPE_HINT[w.type]}</span>
                        </span>
                      </span>
                      <ArrowRight aria-hidden className="size-4 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}

          <div className="mt-6 border-t border-default pt-4">
            {canCreate ? (
              <>
                <Link href="/create-org" className="flex w-full items-center justify-center gap-2 rounded-lg border border-brand/30 bg-brand-light/50 px-4 py-2.5 text-[13px] font-semibold text-brand hover:bg-brand-light">
                  <Plus aria-hidden className="size-4" /> Create a new organisation workspace
                </Link>
                <p className="mt-2 text-center text-[12px] text-muted">A new workspace is a separate organisation with its own data, team and subscription.</p>
              </>
            ) : (
              <p className="text-center text-[12px] text-muted">
                Need a workspace for another business? It is a separate organisation with its own subscription —{' '}
                <Link href="/demo" className="font-medium text-brand hover:underline">contact us</Link>.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
