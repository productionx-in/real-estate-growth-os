// app/api/performance/achievements/route.ts — a workspace's own achievements, and switching built-ins off or on.
// Owners and admins only. Unlocking is always the database's job (20260094), from real events.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { requireModule } from '@/lib/auth/entitlements'
import { auditMember } from '@/lib/dal/org-audit'
import { performanceDb } from '@/lib/dal/performance'
import { ACHIEVEMENT_METRICS, BADGE_ICONS, BUILTIN_ACHIEVEMENTS } from '@/lib/performance/rules'

const Schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('toggle'), orgId: z.string().uuid(), key: z.string().regex(/^[a-z0-9_]{2,40}$/), active: z.boolean() }),
  z.object({
    action: z.literal('save'), orgId: z.string().uuid(), key: z.string().regex(/^[a-z0-9_]{2,40}$/).optional(),
    title: z.string().trim().min(2).max(60), description: z.string().trim().max(200).default(''),
    metric: z.enum(ACHIEVEMENT_METRICS as unknown as [string, ...string[]]), threshold: z.number().positive().max(1e12),
    window: z.enum(['all', 'week', 'month']), xp: z.number().int().min(0).max(10000), icon: z.enum(BADGE_ICONS as unknown as [string, ...string[]]),
    rewardNote: z.string().trim().max(120).nullable().optional(),
  }),
])

export async function POST(request: NextRequest) {
  const parsed = Schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid achievement' }, { status: 400 })
  const a = parsed.data
  const access = await authorizeOrgAccess(a.orgId, ['owner', 'admin'])
  if (!access.success) return access.response
  { const gate = await requireModule(access.context.orgId, 'performance'); if (gate) return gate }
  const table = performanceDb().from('achievement_defs')
  if (a.action === 'toggle') {
    const builtin = BUILTIN_ACHIEVEMENTS.find((b) => b.key === a.key)
    // A built-in is switched off by a row with its key (active = false); switching it back on removes that row.
    const res = builtin
      ? (a.active ? await table.delete().eq('org_id', a.orgId).eq('key', a.key)
        : await table.upsert({ org_id: a.orgId, key: a.key, title: builtin.title, description: builtin.description, metric: builtin.metric, threshold: builtin.threshold, window_kind: builtin.window, xp: builtin.xp, icon: builtin.icon, active: false }, { onConflict: 'org_id,key' }))
      : await table.update({ active: a.active }).eq('org_id', a.orgId).eq('key', a.key)
    if (res.error) return NextResponse.json({ error: 'Could not save.' }, { status: 500 })
    await auditMember(request, access.context, a.orgId, 'performance.achievement_toggled', { type: 'achievement', id: a.key }, { active: a.active })
    return NextResponse.json({ ok: true })
  }
  const key = a.key ?? `c_${a.title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30) || 'custom'}`
  if (BUILTIN_ACHIEVEMENTS.some((b) => b.key === key)) return NextResponse.json({ error: 'That name is taken by a built-in achievement.' }, { status: 400 })
  const { error } = await table.upsert({ org_id: a.orgId, key, title: a.title, description: a.description, metric: a.metric, threshold: a.threshold, window_kind: a.window, xp: a.xp, icon: a.icon, reward_note: a.rewardNote ?? null, active: true }, { onConflict: 'org_id,key' })
  if (error) return NextResponse.json({ error: 'Could not save the achievement.' }, { status: 500 })
  await auditMember(request, access.context, a.orgId, 'performance.achievement_saved', { type: 'achievement', id: key }, { after: a })
  return NextResponse.json({ ok: true, key })
}
