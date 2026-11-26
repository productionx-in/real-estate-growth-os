// app/platform/people/page.tsx — find any customer's RE sign-in account by e-mail and control it: see which
// workspaces it belongs to, suspend or restore access per workspace, block or unblock sign-in, or delete an account
// that belongs to no workspace. Platform Owner and platform admin (account actions: Platform Owner only).
import type { Metadata } from 'next'
import Link from 'next/link'
import { getConsoleAccess } from '@/lib/auth/platform'
import { can } from '@/lib/platform/portal'
import { findAccount } from '@/lib/platform/people'
import { createServiceClient } from '@/lib/supabase/server'
import { Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from '@/components/ui'
import { PageHeader } from '@/components/platform/ConsoleUI'
import { PersonControls } from '@/components/platform/PeopleActions'

export const metadata: Metadata = { title: 'People' }
export const dynamic = 'force-dynamic'

const when = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(iso)) : 'never'

export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const access = await getConsoleAccess()
  if (access.state !== 'ok') return null
  if (!can(access.role, 'people')) return <Alert tone="warning">Only the Platform Owner and platform admins manage customer accounts.</Alert>
  const isSuper = access.role === 'super_admin'
  const email = ((await searchParams).email ?? '').trim()
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  const acct = valid ? await findAccount(email) : null

  // Member ids for the per-workspace controls.
  const memberIds: Record<string, string> = {}
  if (acct) {
    const db = createServiceClient()
    const { data: p } = await db.from('profiles').select('id').eq('auth_user_id', acct.userId).maybeSingle()
    if (p) {
      const { data: ms } = await db.from('org_members').select('id, org_id').eq('profile_id', p.id)
      for (const m of ms ?? []) memberIds[m.org_id] = m.id
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="People"
        description="Find anyone who uses RE by e-mail. Remove them from a workspace, deactivate their account, or permanently delete it. Every action needs a reason and is audited." />

      <form className="flex max-w-xl flex-wrap gap-2" role="search">
        <label htmlFor="people-email" className="sr-only">E-mail address</label>
        <Input id="people-email" name="email" type="email" defaultValue={email} placeholder="name@company.com" className="min-w-0 flex-1" required />
        <Button type="submit">Find</Button>
      </form>

      {email && !valid && <Alert tone="warning">Enter a full e-mail address.</Alert>}
      {valid && !acct && <Alert tone="info">No RE account uses {email}.</Alert>}

      {acct && (
        <Card>
          <CardHeader>
            <div className="min-w-0">
              <CardTitle className="truncate">{acct.name}</CardTitle>
              <CardDescription>{acct.email} · account since {when(acct.createdAt)} · last sign-in {when(acct.lastSignIn)}</CardDescription>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {acct.blocked ? <Badge tone="danger">Sign-in blocked</Badge> : <Badge tone="success">Can sign in</Badge>}
                {acct.staff && <Badge tone="brand">RE staff</Badge>}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-default p-3">
              <div>
                <p className="text-[13px] font-medium">Sign-in account</p>
                <p className="text-[12px] text-muted">
                  {isSuper ? 'Deactivate to stop them signing in (reversible), or permanently delete the account.' : 'Only the Platform Owner can block or delete accounts.'}
                </p>
              </div>
              <PersonControls name={acct.name} email={acct.email} userId={acct.userId} staff={acct.staff} blocked={acct.blocked} isSelf={acct.userId === access.userId}
                canAccount={isSuper} canMember={false} workspaces={acct.workspaces.map((w) => w.name)} />
            </div>

            <div>
              <p className="mb-2 text-[13px] font-medium">Workspaces</p>
              {acct.workspaces.length === 0 ? (
                <p className="text-[13px] text-muted">Belongs to no workspace.</p>
              ) : (
                <ul className="divide-y divide-default rounded-lg border border-default">
                  {acct.workspaces.map((w) => (
                    <li key={w.orgId} className="flex flex-wrap items-center justify-between gap-3 p-3">
                      <div className="min-w-0">
                        <Link href={`/platform/organisations/${w.orgId}`} className="text-[13px] font-medium hover:underline">{w.name}</Link>
                        <p className="text-[12px] text-muted">{w.role.replace('_', ' ')} · {w.status === 'active' ? 'access on' : `access off (${w.status})`}</p>
                      </div>
                      {!acct.staff && acct.userId !== access.userId && memberIds[w.orgId] && (
                        <PersonControls name={acct.name} email={acct.email} userId={acct.userId} staff={false} blocked={acct.blocked} isSelf={false}
                          canAccount={false} canMember orgId={w.orgId} memberId={memberIds[w.orgId]} memberStatus={w.status} />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
