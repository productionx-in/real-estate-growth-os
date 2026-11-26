// app/api/performance/settings/route.ts — save the workspace's performance settings (points, follow-up cap, levels,
// daily missions, leaderboard visibility, on/off). Owners and admins only; audited with what changed.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { requireModule } from '@/lib/auth/entitlements'
import { auditMember } from '@/lib/dal/org-audit'
import { getGamification, saveGamification } from '@/lib/dal/performance'
import { normaliseGamification } from '@/lib/performance/rules'

const Schema = z.object({ orgId: z.string().uuid(), value: z.record(z.string(), z.unknown()) })

export async function POST(request: NextRequest) {
  const parsed = Schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid settings' }, { status: 400 })
  const access = await authorizeOrgAccess(parsed.data.orgId, ['owner', 'admin'])
  if (!access.success) return access.response
  { const gate = await requireModule(access.context.orgId, 'performance'); if (gate) return gate }
  const { value, errors } = normaliseGamification(parsed.data.value)
  if (Object.keys(errors).length) return NextResponse.json({ error: Object.values(errors)[0], fields: errors }, { status: 400 })
  const before = await getGamification(parsed.data.orgId)
  if (!(await saveGamification(parsed.data.orgId, access.context.profile.id, value))) return NextResponse.json({ error: 'Could not save the settings.' }, { status: 500 })
  await auditMember(request, access.context, parsed.data.orgId, 'performance.settings_saved', { type: 'organisation', id: parsed.data.orgId }, { before, after: value })
  return NextResponse.json({ ok: true, value })
}
