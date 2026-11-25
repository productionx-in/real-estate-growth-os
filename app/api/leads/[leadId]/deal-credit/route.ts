// app/api/leads/[leadId]/deal-credit/route.ts — shared deal credit (20260098). GET: the split, what each person holds
// and the history, for anyone who can see the lead. PUT: change the split — owners, admins, managers, or the closer's
// own team leader (lib/sales/deal-credit.ts). The database checks the shares again and moves the credit; every change
// is in the workspace audit log and the split's history.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { auditMember } from '@/lib/dal/org-audit'
import { closerOf, getDealCredit, leadersOf, saveDealCredit } from '@/lib/dal/deal-credit'
import { canManageDealCredit, closerRemainder, normaliseShares } from '@/lib/sales/deal-credit'

const Body = z.object({ shares: z.array(z.unknown()).max(20), reason: z.string().max(300).optional() })

/** The lead as the signed-in person may see it (row-level security decides), or null. */
async function visibleLead(leadId: string) {
  const supabase = await createClient()
  const { data } = await supabase.from('leads').select('id, org_id, status').eq('id', leadId).maybeSingle()
  return data as { id: string; org_id: string; status: string } | null
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await params
  const lead = await visibleLead(leadId)
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  const access = await authorizeOrgAccess(lead.org_id)
  if (!access.success) return access.response
  const view = await getDealCredit(lead.org_id, leadId)
  const leaders = view.closer ? await leadersOf(lead.org_id, view.closer.id) : []
  return NextResponse.json({ ...view, booked: lead.status === 'booked', canManage: lead.status === 'booked' && !!view.closer && canManageDealCredit(access.context.role, access.context.profile.id, leaders) })
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await params
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const lead = await visibleLead(leadId)
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  const access = await authorizeOrgAccess(lead.org_id)
  if (!access.success) return access.response
  if (lead.status !== 'booked') return NextResponse.json({ error: 'Only a booked deal can be shared.' }, { status: 409 })
  const closer = await closerOf(lead.org_id, leadId)
  if (!closer) return NextResponse.json({ error: 'This deal has no closer on record yet.' }, { status: 409 })
  if (!canManageDealCredit(access.context.role, access.context.profile.id, await leadersOf(lead.org_id, closer))) {
    return NextResponse.json({ error: 'Only owners, admins, managers or the closer’s team leader can share a deal’s credit.' }, { status: 403 })
  }
  const { value, error } = normaliseShares(parsed.data.shares, closer)
  if (error) return NextResponse.json({ error }, { status: 400 })
  const reason = parsed.data.reason?.trim() || null
  const r = await saveDealCredit(lead.org_id, leadId, value, access.context.profile.id, reason)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
  if (r.changed) {
    await auditMember(request, access.context, lead.org_id, 'lead.credit_shared', { type: 'lead', id: leadId },
      { closer, closerPct: closerRemainder(value), shares: value.map((s) => `${s.profileId}:${s.sharePct}`).join(','), reason })
  }
  return NextResponse.json({ ok: true, changed: r.changed })
}
