import { ModuleGate } from '@/components/entitlements/ModuleGate'

export default async function Layout({ children, params }: { children: React.ReactNode; params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params
  return <ModuleGate orgSlug={orgSlug} module="integrations">{children}</ModuleGate>
}
