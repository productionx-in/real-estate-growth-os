// app/(dashboard)/[orgSlug]/settings/roles/page.tsx — Your team → Roles & permissions: what each role can do, read
// straight from the rules the server enforces (lib/auth/capabilities.ts). Managers and above. Read-only: custom
// roles come later.
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Check, Minus, X } from 'lucide-react'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { SettingsCard, SettingsHeader } from '@/components/settings/SettingsSection'
import { CAPABILITIES, type Cell } from '@/lib/auth/capabilities'
import { MEMBER_ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS } from '@/lib/auth/permissions'

export const metadata: Metadata = { title: 'Roles & permissions · Settings' }
export const dynamic = 'force-dynamic'

function Mark({ cell }: { cell: Cell }) {
  if (cell.level === 'no') return <span className="inline-flex items-center gap-1 text-subtle"><X aria-hidden className="size-3.5" /><span className="sr-only">No</span></span>
  return (
    <span className={`inline-flex items-center gap-1 ${cell.level === 'yes' ? 'text-success' : 'text-warning'}`}>
      {cell.level === 'yes' ? <Check aria-hidden className="size-3.5" /> : <Minus aria-hidden className="size-3.5" />}
      <span className={cell.note ? 'text-[11px] text-foreground' : 'sr-only'}>{cell.note ?? (cell.level === 'yes' ? 'Yes' : 'Partly')}</span>
    </span>
  )
}

export default async function RolesPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params
  const { isManager, isAdmin } = await getVerifiedWorkspace(orgSlug)
  if (!isManager && !isAdmin) redirect(`/${orgSlug}/settings`)
  const groups = [...new Set(CAPABILITIES.map((c) => c.group))]
  return (
    <div className="max-w-6xl space-y-4">
      <SettingsHeader title="Roles & permissions" scope="org" description="What each role can do in REGrow. These are the rules the server enforces." />
      <SettingsCard title="Roles" description={isAdmin ? 'Change someone’s role from Team members.' : 'Owners and admins change roles from Team members.'}>
        <ul className="grid gap-2 sm:grid-cols-2">
          {MEMBER_ROLES.map((r) => <li key={r} className="text-[13px]"><span className="font-semibold text-foreground">{ROLE_LABELS[r]}</span> <span className="text-muted">— {ROLE_DESCRIPTIONS[r]}</span></li>)}
        </ul>
        {isAdmin && <p className="mt-3 text-[13px]"><Link href={`/${orgSlug}/team`} className="font-medium text-brand underline">Go to Team members</Link></p>}
      </SettingsCard>
      <div className="overflow-x-auto rounded-xl border border-default bg-surface">
        <table className="w-full min-w-[880px] text-[13px]">
          <caption className="sr-only">What each role can do</caption>
          <thead className="bg-surface-muted text-left text-[11px] font-semibold uppercase tracking-wide text-subtle">
            <tr><th scope="col" className="px-4 py-2.5">Can…</th>{MEMBER_ROLES.map((r) => <th key={r} scope="col" className="px-3 py-2.5">{ROLE_LABELS[r]}</th>)}</tr>
          </thead>
          {groups.map((g) => (
            <tbody key={g} className="divide-y divide-[var(--border)]">
              <tr><th colSpan={MEMBER_ROLES.length + 1} scope="colgroup" className="bg-surface-hover px-4 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted">{g}</th></tr>
              {CAPABILITIES.filter((c) => c.group === g).map((c) => (
                <tr key={c.label}>
                  <th scope="row" className="px-4 py-2.5 text-left font-normal text-foreground">{c.label}</th>
                  {MEMBER_ROLES.map((r) => <td key={r} className="px-3 py-2.5"><Mark cell={c.cells[r]} /></td>)}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
      <p className="text-[12px] text-muted">Need a role that isn’t here? Custom roles are on the way — tell us what you need from Help &amp; support.</p>
    </div>
  )
}
