// app/(dashboard)/[orgSlug]/settings/page.tsx — the settings hub: one card per group, with its most-used pages.
// Everyone sees "You"; company, team and lead settings appear for the roles that manage them (lib/settings/catalog).
import type { Metadata } from 'next'
import Link from 'next/link'
import { Building2, ChevronRight, ClipboardList, Home, Plug, UserRound, Users } from 'lucide-react'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { settingsFor } from '@/lib/settings/catalog'
import { SettingsHeader } from '@/components/settings/SettingsSection'
import type { MemberRole } from '@/types/database'

export const metadata: Metadata = { title: 'Settings' }
export const dynamic = 'force-dynamic'

const ICONS: Record<string, typeof UserRound> = { you: UserRound, company: Building2, team: Users, leads: ClipboardList, properties: Home, apps: Plug }

export default async function SettingsHub({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params
  const { role, org } = await getVerifiedWorkspace(orgSlug)
  const groups = settingsFor(role as MemberRole)
  return (
    <div>
      <SettingsHeader title="Settings" scope="you" description={`Set up ${org.name}, your team and how leads, deals and messages work. Use the search on the left to jump to anything.`} />
      <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {groups.map((g) => {
          const Icon = ICONS[g.key] ?? Building2
          return (
            <li key={g.key} className="rounded-xl border border-default bg-surface p-4 shadow-2xs">
              <div className="mb-2 flex gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-light text-brand"><Icon aria-hidden className="size-4" /></span>
                <div>
                  <h2 className="text-[14px] font-semibold text-foreground">{g.title}</h2>
                  <p className="text-[12px] text-muted">{g.description}</p>
                </div>
              </div>
              <ul className="divide-y divide-[var(--border)]">
                {g.pages.map((p) => (
                  <li key={p.key}>
                    <Link href={`/${orgSlug}${p.path}`} className="flex min-h-11 items-center gap-2 rounded-md px-1 text-[13px] text-foreground hover:bg-surface-hover">
                      <span className="flex-1">{p.label}</span>
                      <ChevronRight aria-hidden className="size-4 text-subtle" />
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
