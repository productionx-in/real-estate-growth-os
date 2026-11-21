// app/api/admin/organisations/[orgId]/delete/route.ts — permanently delete a customer workspace that holds no
// business data (migration 20260065). Platform Owner only, MFA-verified; the exact name and a reason are required;
// the database refuses anything with leads, projects, inventory, bookings, invoices or payments and says what.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authenticatePlatformAdmin } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/server'

const Body = z.object({ confirmName: z.string().trim().min(1), reason: z.string().trim().min(3, 'Give a reason').max(500) })
const LABEL: Record<string, string> = {
  leads: 'leads', projects: 'projects', inventory_items: 'inventory units', bookings: 'bookings', deals: 'deals', site_visits: 'site visits',
  channel_partners: 'channel partners', whatsapp_messages: 'WhatsApp messages', org_subscription_invoices: 'invoices',
  org_subscription_payments: 'payments', credit_notes: 'credit notes', payment_attempts: 'payment attempts', payment_refunds: 'refunds',
  payment_mandates: 'payment mandates', unapplied_payments: 'unapplied payments', payment_disputes: 'disputes', deal_registrations: 'partner registrations',
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  const a = await authenticatePlatformAdmin(['super_admin'], true)
  if (!a.success) return a.response
  const { orgId } = await params
  if (!z.string().uuid().safeParse(orgId).success) return NextResponse.json({ error: 'Invalid organisation id' }, { status: 400 })
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Type the name and a reason' }, { status: 400 })
  const { data, error } = await createServiceClient().rpc('platform_delete_organisation' as never, {
    p_org: orgId, p_confirm_name: parsed.data.confirmName, p_reason: parsed.data.reason, p_actor_user: a.auth.user.id,
  } as never)
  if (error) {
    const msg = error.message.replace(/^delete: /, '')
    return NextResponse.json({ error: msg }, { status: /not found/.test(msg) ? 404 : /only an active/.test(msg) ? 403 : 400 })
  }
  const r = data as { deleted: boolean; blockers?: Record<string, number>; members_removed?: number }
  if (!r.deleted) {
    const list = Object.entries(r.blockers ?? {}).map(([k, n]) => `${n} ${LABEL[k] ?? k}`).join(', ')
    return NextResponse.json({ error: `This workspace holds business data (${list}), so it can’t be deleted. Deactivate it instead — the data is kept.`, blockers: r.blockers }, { status: 409 })
  }
  return NextResponse.json({ ok: true, membersRemoved: r.members_removed ?? 0 })
}
