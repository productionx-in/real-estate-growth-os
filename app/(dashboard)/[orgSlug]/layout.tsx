// app/(dashboard)/[orgSlug]/layout.tsx
// Org-scoped workspace shell: validates org membership and wraps workspace with Sidebar + Header
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { Sidebar } from '@/components/layout/Sidebar'
import { Header } from '@/components/layout/Header'

interface OrgLayoutProps {
  children: React.ReactNode
  params: Promise<{ orgSlug: string }>
}

export default async function OrgLayout({ children, params }: OrgLayoutProps) {
  const { orgSlug } = await params
  const { org } = await getVerifiedWorkspace(orgSlug)

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--background)]">
      <Sidebar orgName={org.name} orgSlug={org.slug} />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}
