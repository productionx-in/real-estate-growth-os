// app/api/settings/workspace/route.ts — save one section of the workspace settings (Settings → Lead / Inventory / Report settings, Fields on leads, Locations).
// Owners and admins only; validated by lib/settings/workspace.ts; audited with what changed.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { auditMember } from '@/lib/dal/org-audit'
import { getWorkspaceSettings, saveWorkspaceSection } from '@/lib/dal/workspace-settings'
import { normaliseSection } from '@/lib/settings/workspace'

const Schema = z.object({
  orgId: z.string().uuid(),
  section: z.enum(['security', 'leads', 'inventory', 'reports', 'lists', 'fields', 'notifications', 'visits', 'matching', 'whatsapp', 'alerts']),
  value: z.record(z.string(), z.unknown()),
})

export async function POST(request: NextRequest) {
  const parsed = Schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid settings' }, { status: 400 })
  const { orgId, section } = parsed.data
  const access = await authorizeOrgAccess(orgId, ['owner', 'admin'])
  if (!access.success) return access.response

  const current = await getWorkspaceSettings(orgId)
  const { value, errors } = normaliseSection(section, parsed.data.value, current)
  if (Object.keys(errors).length) return NextResponse.json({ error: Object.values(errors)[0], fields: errors }, { status: 400 })
  // Requiring two-step for everyone: the person switching it on must be using it, so they can't lock themselves out.
  if (section === 'security' && (value as { requireTwoStep: boolean }).requireTwoStep && !access.context.twoStep) {
    return NextResponse.json({ error: 'Turn on two-step verification for your own account first (You → Sign-in & security).' }, { status: 400 })
  }
  const before = current[section]
  if (!(await saveWorkspaceSection(orgId, access.context.profile.id, section, value))) {
    return NextResponse.json({ error: 'Could not save the settings.' }, { status: 500 })
  }
  await auditMember(request, access.context, orgId, `settings.${section}_saved`, { type: 'organisation', id: orgId }, { before, after: value })
  return NextResponse.json({ ok: true, value })
}
