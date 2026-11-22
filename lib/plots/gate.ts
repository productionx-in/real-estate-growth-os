// lib/plots/gate.ts — the one check every Interactive Plot Map write route runs, in this order: the caller is an
// owner, admin or manager of the workspace; the Inventory module is on; the project's add-on is active.
import { NextResponse } from 'next/server'
import { authorizeOrgAccess, type TenantContext } from '@/lib/auth/tenant'
import { requireModule } from '@/lib/auth/entitlements'
import { requireProjectAddon } from '@/lib/plots/addons'

export async function gatePlotMapWrite(orgId: string, projectId: () => Promise<string | null>): Promise<{ response: NextResponse } | { context: TenantContext; projectId: string }> {
  const access = await authorizeOrgAccess(orgId, ['owner', 'admin', 'manager'])
  if (!access.success) return { response: access.response }
  const m = await requireModule(orgId, 'inventory'); if (m) return { response: m }
  const pid = await projectId()
  if (!pid) return { response: NextResponse.json({ error: 'Not found.' }, { status: 404 }) }
  const a = await requireProjectAddon(orgId, pid, 'plot_maps'); if (a) return { response: a }
  return { context: access.context, projectId: pid }
}
