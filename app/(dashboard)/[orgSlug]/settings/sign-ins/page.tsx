// app/(dashboard)/[orgSlug]/settings/sign-ins/page.tsx — Your team → Sign-in activity (20260090): when each person
// signed in, from which device, roughly from where, and whether they used two-step verification. Owners and admins.
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ShieldCheck } from 'lucide-react'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { listSignIns } from '@/lib/dal/sign-in-activity'
import { SettingsCard, SettingsHeader } from '@/components/settings/SettingsSection'
import { Badge } from '@/components/ui'
import { EmptyState } from '@/components/shared/EmptyState'

export const metadata: Metadata = { title: 'Sign-in activity · Settings' }
export const dynamic = 'force-dynamic'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const when = (iso: string) => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(new Date(iso))

export default async function SignInActivityPage({ params, searchParams }: { params: Promise<{ orgSlug: string }>; searchParams: Promise<{ person?: string }> }) {
  const { orgSlug } = await params
  const { org, isAdmin } = await getVerifiedWorkspace(orgSlug)
  if (!isAdmin) redirect(`/${orgSlug}/settings`)
  const person = (await searchParams).person
  const { people, rows } = await listSignIns(org.id, { profileId: person && UUID.test(person) ? person : null })
  const base = `/${orgSlug}/settings/sign-ins`
  const now = Date.now()
  const active = (r: (typeof rows)[number]) => !r.endedAt && now - new Date(r.lastSeenAt ?? r.signedInAt).getTime() < 7 * 86_400_000

  return (
    <div className="max-w-4xl space-y-4">
      <SettingsHeader title="Sign-in activity" scope="org" description="When your team signed in during the last 90 days, and from which device. Something unexpected? Ask the person to change their password and sign out everywhere (Sign-in & security), or deactivate them in Team." />
      <nav aria-label="Person" className="flex flex-wrap gap-2">
        <Link href={base} aria-current={!person ? 'page' : undefined} className={`rounded-full border px-3 py-1.5 text-[13px] ${!person ? 'border-brand bg-brand-light text-brand' : 'border-default text-muted hover:bg-surface-hover'}`}>Everyone</Link>
        {people.map((p) => (
          <Link key={p.profileId} href={`${base}?person=${p.profileId}`} aria-current={person === p.profileId ? 'page' : undefined}
            className={`rounded-full border px-3 py-1.5 text-[13px] ${person === p.profileId ? 'border-brand bg-brand-light text-brand' : 'border-default text-muted hover:bg-surface-hover'}`}>
            {p.name}{p.active ? '' : ' (removed)'}
          </Link>
        ))}
      </nav>
      <SettingsCard title={`${rows.length} ${rows.length === 1 ? 'sign-in' : 'sign-ins'}`}>
        {rows.length === 0 ? (
          <EmptyState icon={ShieldCheck} title="No sign-ins recorded yet" description="Sign-ins are recorded from now on and kept for 180 days." />
        ) : (
          <div className="-mx-4 overflow-x-auto">
            <table className="data-table w-full min-w-[640px] text-[13px]">
              <thead className="text-left text-[12px] text-muted">
                <tr><th className="px-4 py-2 font-medium">Person</th><th className="px-4 py-2 font-medium">Signed in</th><th className="px-4 py-2 font-medium">Device</th><th className="px-4 py-2 font-medium">Address</th><th className="px-4 py-2 font-medium">Status</th></tr>
              </thead>
              <tbody className="divide-y divide-default">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-2 font-medium">{r.name}</td>
                    <td className="px-4 py-2 tabular-nums">{when(r.signedInAt)}</td>
                    <td className="px-4 py-2">{r.device}{r.secondStep && <Badge tone="success" className="ml-2">2-step</Badge>}</td>
                    <td className="px-4 py-2 tabular-nums text-muted">{r.ip}</td>
                    <td className="px-4 py-2 text-muted">{r.endedAt ? `Signed out ${when(r.endedAt)}` : active(r) ? <span className="text-success">Signed in</span> : 'Inactive'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SettingsCard>
    </div>
  )
}
