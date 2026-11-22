// app/api/team/targets/route.ts — set a team member's targets for a month (site visits, bookings, booking value).
// Owners, admins and managers; the member must belong to the workspace (checked here and by the database). Audited.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { auditMember } from '@/lib/dal/org-audit'
import { createServiceClient } from '@/lib/supabase/server'
import { saveTargets } from '@/lib/dal/team'
import { isMonthKey, normaliseTargets } from '@/lib/team/targets'

const num = z.union([z.number(), z.string().max(20), z.null()]).optional()
const Schema = z.object({
  orgId: z.string().uuid(),
  profileId: z.string().uuid(),
  month: z.string(),
  targets: z.object({ siteVisits: num, bookings: num, bookingValue: num }),
})

export async function POST(request: NextRequest) {
  const parsed = Schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success || !isMonthKey(parsed.data.month)) return NextResponse.json({ error: 'Invalid targets' }, { status: 400 })
  const { orgId, profileId, month } = parsed.data
  const access = await authorizeOrgAccess(orgId, ['owner', 'admin', 'manager'])
  if (!access.success) return access.response
  const { value, errors } = normaliseTargets(parsed.data.targets)
  if (Object.keys(errors).length) return NextResponse.json({ error: Object.values(errors)[0] }, { status: 400 })
  const { data: member } = await createServiceClient().from('org_members').select('id').eq('org_id', orgId).eq('profile_id', profileId).eq('status', 'active').maybeSingle()
  if (!member) return NextResponse.json({ error: 'This person is not an active member of the workspace.' }, { status: 404 })
  if (!(await saveTargets(orgId, profileId, month, value, access.context.profile.id))) return NextResponse.json({ error: 'Could not save the targets.' }, { status: 500 })
  await auditMember(request, access.context, orgId, 'member.targets_set', { type: 'profile', id: profileId }, { month, ...value })
  return NextResponse.json({ ok: true, targets: value })
}
