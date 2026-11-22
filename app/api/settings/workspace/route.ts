// app/api/settings/workspace/route.ts — save one section of the workspace settings (Settings → Lead / Inventory / Report settings).
// Owners and admins only; validated by lib/settings/workspace.ts; audited with what changed.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { auditMember } from '@/lib/dal/org-audit'
import { getWorkspaceSettings, saveWorkspaceSection } from '@/lib/dal/workspace-settings'
import { normaliseSection } from '@/lib/settings/workspace'

const Schema = z.object({
  orgId: z.string().uuid(),
  section: z.enum(['leads', 'inventory', 'reports', 'notifications']),
  value: z.record(z.string(), z.unknown()),
})

export async function POST(request: NextRequest) {
  const parsed = Schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid settings' }, { status: 400 })
  const { orgId, section } = parsed.data
  const access = await authorizeOrgAccess(orgId, ['owner', 'admin'])
  if (!access.success) return access.response

  const { value, errors } = normaliseSection(section, parsed.data.value)
  if (Object.keys(errors).length) return NextResponse.json({ error: Object.values(errors)[0], fields: errors }, { status: 400 })
  const before = (await getWorkspaceSettings(orgId))[section]
  if (!(await saveWorkspaceSection(orgId, access.context.profile.id, section, value))) {
    return NextResponse.json({ error: 'Could not save the settings.' }, { status: 500 })
  }
  await auditMember(request, access.context, orgId, `settings.${section}_saved`, { type: 'organisation', id: orgId }, { before, after: value })
  return NextResponse.json({ ok: true, value })
}
