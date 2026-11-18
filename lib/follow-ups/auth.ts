// lib/follow-ups/auth.ts
// Who may work a lead (log outcomes, contact, schedule follow-ups): see canWorkLead in lib/auth/permissions.ts —
// managers any lead, a team lead their team's, a sales executive their own, post-sales booked customers.
// Viewers never.
import { NextResponse } from 'next/server'
import { authorizeLeadAccess, type LeadAuthContext } from '@/lib/auth/tenant'
import { SALES_WRITE_ROLES, canWorkLead } from '@/lib/auth/permissions'
import type { LeadWorkContext } from '@/lib/dal/follow-ups'
import type { LeadStatus } from '@/types/database'

export async function authorizeLeadWork(leadId: string): Promise<
  | { success: true; work: LeadWorkContext; context: LeadAuthContext }
  | { success: false; response: NextResponse }
> {
  const auth = await authorizeLeadAccess(leadId, [...SALES_WRITE_ROLES])
  if (!auth.success) return auth
  const { context } = auth
  // Own leads for a sales executive, the team's for a team lead, booked customers for post-sales, all for managers.
  if (!canWorkLead(context.viewer, context.lead)) {
    return { success: false, response: NextResponse.json({ error: 'You can only work leads assigned to you or your team' }, { status: 403 }) }
  }
  return {
    success: true,
    context,
    work: { orgId: context.orgId, leadId: context.lead.id, actorId: context.profile.id, status: context.lead.status as LeadStatus },
  }
}
