// lib/follow-ups/auth.ts
// Who may work a lead (log outcomes, contact, schedule follow-ups): owners, admins and managers of the lead's
// organisation, and the sales executive it is assigned to. Read-only members and other executives may not.
import { NextResponse } from 'next/server'
import { authorizeLeadAccess, type LeadAuthContext } from '@/lib/auth/tenant'
import { SALES_WRITE_ROLES } from '@/lib/auth/permissions'
import type { LeadWorkContext } from '@/lib/dal/follow-ups'
import type { LeadStatus } from '@/types/database'

export async function authorizeLeadWork(leadId: string): Promise<
  | { success: true; work: LeadWorkContext; context: LeadAuthContext }
  | { success: false; response: NextResponse }
> {
  const auth = await authorizeLeadAccess(leadId, [...SALES_WRITE_ROLES])
  if (!auth.success) return auth
  const { context } = auth
  if (context.role === 'sales_exec' && context.lead.assigned_to !== context.profile.id) {
    return { success: false, response: NextResponse.json({ error: 'You can only work leads assigned to you' }, { status: 403 }) }
  }
  return {
    success: true,
    context,
    work: { orgId: context.orgId, leadId: context.lead.id, actorId: context.profile.id, status: context.lead.status as LeadStatus },
  }
}
