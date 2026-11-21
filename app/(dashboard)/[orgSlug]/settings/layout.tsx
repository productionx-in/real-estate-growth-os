// app/(dashboard)/[orgSlug]/settings/layout.tsx — the settings area: a sidebar of the groups this person's role can
// see (lib/settings/catalog.ts) beside the page. Each page still checks access itself.
import { SettingsNav } from '@/components/settings/SettingsNav'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { settingsFor } from '@/lib/settings/catalog'
import type { MemberRole } from '@/types/database'

export default async function SettingsLayout({ children, params }: { children: React.ReactNode; params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params
  const { role } = await getVerifiedWorkspace(orgSlug)
  return (
    <div className="grid gap-6 p-4 md:p-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="lg:sticky lg:top-4 lg:h-fit lg:border-r lg:border-default lg:pr-4">
        <SettingsNav orgSlug={orgSlug} groups={settingsFor(role as MemberRole)} />
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  )
}
