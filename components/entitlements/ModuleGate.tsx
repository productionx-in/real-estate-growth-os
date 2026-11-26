// Server component: renders the module's pages only when it is switched on for this workspace.
// The API routes refuse on their own (requireModule); this gives people a clear page instead of errors.
import { Lock } from 'lucide-react'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { getModules, MODULES, type ModuleKey } from '@/lib/auth/entitlements'
import { Card, EmptyState } from '@/components/ui'

export async function ModuleGate({ orgSlug, module, children }: { orgSlug: string; module: ModuleKey; children: React.ReactNode }) {
  const { org } = await getVerifiedWorkspace(orgSlug)
  const modules = await getModules(org.id)
  if (modules[module]) return <>{children}</>
  return (
    <div className="p-4 md:p-6">
      <Card className="mx-auto max-w-xl">
        <EmptyState icon={Lock} title={`${MODULES[module]} isn’t included in this workspace`}
          description="Your data is kept. To add this module, contact your RE by PX account manager." />
      </Card>
    </div>
  )
}
