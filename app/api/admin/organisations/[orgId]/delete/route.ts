// app/api/admin/organisations/[orgId]/delete/route.ts — permanently delete a customer workspace (migrations
// 20260065/20260066). Platform Owner only, MFA-verified; the exact name and a reason are required. A workspace with
// working data (leads, projects, inventory…) is deleted only when the Owner also ticks "delete its data" — meant for
// test and duplicate workspaces. Money records (invoices, payments…) and partner registrations always block it.
// GET previews what the workspace holds, and answers 404 once it is gone (the dialog uses that to recover from a
// lost reply).
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authenticatePlatformAdmin } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/server'

const Body = z.object({ confirmName: z.string().trim().min(1), reason: z.string().trim().min(3, 'Give a reason').max(500), purgeData: z.boolean().optional().default(false) })
const DATA_TABLES = ['leads', 'projects', 'inventory_items', 'bookings', 'deals', 'site_visits', 'channel_partners', 'whatsapp_messages'] as const
const LOCKED_TABLES = ['org_subscription_invoices', 'org_subscription_payments', 'credit_notes', 'payment_attempts', 'payment_refunds',
  'payment_mandates', 'unapplied_payments', 'payment_disputes'] as const
const LABEL: Record<string, string> = {
  leads: 'leads', projects: 'projects', inventory_items: 'inventory units', bookings: 'bookings', deals: 'deals', site_visits: 'site visits',
  channel_partners: 'channel partners', whatsapp_messages: 'WhatsApp messages', org_subscription_invoices: 'invoices',
  org_subscription_payments: 'payments', credit_notes: 'credit notes', payment_attempts: 'payment attempts', payment_refunds: 'refunds',
  payment_mandates: 'payment mandates', unapplied_payments: 'unapplied payments', payment_disputes: 'disputes', deal_registrations: 'partner registrations',
}
const describe = (counts: Record<string, number>) => Object.entries(counts).map(([k, n]) => `${n} ${LABEL[k] ?? k}`).join(', ')
const isLocked = (k: string) => (LOCKED_TABLES as readonly string[]).includes(k) || k === 'deal_registrations'

type Params = { params: Promise<{ orgId: string }> }

export async function GET(_request: NextRequest, { params }: Params) {
  const a = await authenticatePlatformAdmin(['super_admin'], true)
  if (!a.success) return a.response
  const { orgId } = await params
  if (!z.string().uuid().safeParse(orgId).success) return NextResponse.json({ error: 'Invalid organisation id' }, { status: 400 })
  const db = createServiceClient()
  const { data: org } = await db.from('organisations').select('id').eq('id', orgId).maybeSingle()
  if (!org) return NextResponse.json({ error: 'This workspace no longer exists.', gone: true }, { status: 404 })
  const counts: Record<string, number> = {}
  await Promise.all([...DATA_TABLES, ...LOCKED_TABLES].map(async (t) => {
    const { count } = await db.from(t as never).select('*', { count: 'exact', head: true }).eq('org_id', orgId)
    if (count) counts[t] = count
  }))
  const { count: regs } = await db.from('deal_registrations' as never).select('*', { count: 'exact', head: true }).or(`developer_org_id.eq.${orgId},agency_org_id.eq.${orgId}`)
  if (regs) counts.deal_registrations = regs
  const data = Object.fromEntries(Object.entries(counts).filter(([k]) => !isLocked(k)))
  const locked = Object.fromEntries(Object.entries(counts).filter(([k]) => isLocked(k)))
  return NextResponse.json({ data, locked, dataText: describe(data), lockedText: describe(locked) })
}

export async function POST(request: NextRequest, { params }: Params) {
  const a = await authenticatePlatformAdmin(['super_admin'], true)
  if (!a.success) return a.response
  const { orgId } = await params
  if (!z.string().uuid().safeParse(orgId).success) return NextResponse.json({ error: 'Invalid organisation id' }, { status: 400 })
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Type the name and a reason' }, { status: 400 })
  const { data, error } = await createServiceClient().rpc('platform_delete_organisation' as never, {
    p_org: orgId, p_confirm_name: parsed.data.confirmName, p_reason: parsed.data.reason, p_actor_user: a.auth.user.id, p_purge_data: parsed.data.purgeData,
  } as never)
  if (error) {
    const msg = error.message.replace(/^delete: /, '')
    return NextResponse.json({ error: msg }, { status: /not found/.test(msg) ? 404 : /only an active/.test(msg) ? 403 : 400 })
  }
  const r = data as { deleted: boolean; blockers?: Record<string, number>; purgeable?: boolean; members_removed?: number }
  if (!r.deleted) {
    const blockers = r.blockers ?? {}
    const locked = Object.fromEntries(Object.entries(blockers).filter(([k]) => isLocked(k)))
    const error = r.purgeable
      ? `This workspace holds data (${describe(blockers)}). If it is a test or duplicate, tick “Also delete its data” to remove everything. Otherwise deactivate it — the data is kept.`
      : `This workspace has ${describe(locked)}, which must be kept, so it can’t be deleted. Deactivate it instead.`
    return NextResponse.json({ error, blockers, purgeable: Boolean(r.purgeable) }, { status: 409 })
  }
  return NextResponse.json({ ok: true, membersRemoved: r.members_removed ?? 0 })
}
