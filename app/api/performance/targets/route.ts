// app/api/performance/targets/route.ts — create a target for a person, a team or everyone. Owners and admins only.
// Every change is also kept by the database (performance_target_history) and in the audit log.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { auditMember } from '@/lib/dal/org-audit'
import { performanceDb } from '@/lib/dal/performance'
import { PERIODS, TARGET_METRICS } from '@/lib/performance/rules'

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const Schema = z.object({
  orgId: z.string().uuid(),
  scope: z.enum(['member', 'team', 'everyone']),
  profileId: z.string().uuid().optional(),
  teamId: z.string().uuid().optional(),
  metric: z.enum(TARGET_METRICS as [string, ...string[]]),
  amount: z.number().positive().max(1e12),
  period: z.enum(Object.keys(PERIODS) as [string, ...string[]]),
  startsOn: day,
  endsOn: day.nullable().optional(),
}).refine((t) => (t.scope === 'member') === !!t.profileId && (t.scope === 'team') === !!t.teamId, 'Choose who the target is for.')
  .refine((t) => t.period !== 'custom' || !!t.endsOn, 'Custom dates need an end date.')
  .refine((t) => !t.endsOn || t.endsOn >= t.startsOn, 'The end date is before the start date.')
  .refine((t) => t.metric === 'revenue' || Number.isInteger(t.amount), 'Counts are whole numbers.')

export async function POST(request: NextRequest) {
  const parsed = Schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid target' }, { status: 400 })
  const t = parsed.data
  const access = await authorizeOrgAccess(t.orgId, ['owner', 'admin'])
  if (!access.success) return access.response
  const { data, error } = await performanceDb().from('performance_targets').insert({
    org_id: t.orgId, scope: t.scope, profile_id: t.profileId ?? null, team_id: t.teamId ?? null, metric: t.metric, amount: t.amount,
    period: t.period, starts_on: t.startsOn, ends_on: t.endsOn ?? null, created_by: access.context.profile.id, updated_by: access.context.profile.id,
  }).select('id').single()
  if (error) return NextResponse.json({ error: /not in this workspace/.test(error.message) ? 'That person or team is not in this workspace.' : 'Could not save the target.' }, { status: 400 })
  await auditMember(request, access.context, t.orgId, 'performance.target_created', { type: 'performance_target', id: data.id }, { after: t })
  return NextResponse.json({ ok: true, id: data.id })
}
