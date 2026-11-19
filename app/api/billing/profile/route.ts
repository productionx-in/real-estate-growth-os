// app/api/billing/profile/route.ts — the customer's registered business details printed on its invoices (legal name,
// GSTIN, state, address). Owners and admins only; recorded in the organisation's audit log. The database checks the
// GSTIN format and that its first two digits match the state code (migration 20260062). Applies to invoices issued
// from now on; issued invoices keep the details they were issued with.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeBillingAccess } from '@/lib/billing/access'
import { createServiceClient } from '@/lib/supabase/server'
import { recordOrgAudit, requestOrigin } from '@/lib/dal/org-audit'

const BillingProfile = z.object({
  orgId: z.string().uuid(),
  legalName: z.string().trim().min(2, 'Enter the registered business name').max(200),
  gstin: z.string().trim().toUpperCase().regex(/^$|^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, 'A GSTIN has 15 characters, e.g. 27ABCDE1234F1Z5'),
  stateCode: z.string().trim().regex(/^$|^[0-9]{2}$/, 'The state code has 2 digits'),
  billingAddress: z.string().trim().max(500),
}).refine((v) => !v.gstin || !v.stateCode || v.gstin.slice(0, 2) === v.stateCode, { message: 'The GSTIN’s first two digits must be the state code', path: ['gstin'] })

export async function PUT(request: NextRequest) {
  const parsed = BillingProfile.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
  const b = parsed.data
  const access = await authorizeBillingAccess(b.orgId)
  if (!access.success) return access.response
  const stateCode = b.stateCode || (b.gstin ? b.gstin.slice(0, 2) : '')
  const row = { org_id: b.orgId, legal_name: b.legalName, gstin: b.gstin || null, state_code: stateCode || null, billing_address: b.billingAddress || null, updated_by: access.context.user.id, updated_at: new Date().toISOString() }
  const db = createServiceClient() as unknown as { from: (t: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any
  const { error } = await db.from('org_billing_profiles').upsert(row, { onConflict: 'org_id' })
  if (error) {
    const friendly = /billing: (.*)/.exec(error.message)?.[1] ?? 'Could not save the billing details.'
    return NextResponse.json({ error: friendly.replace(/^./, (c) => c.toUpperCase()) }, { status: error.code === '23514' ? 400 : 500 })
  }
  await recordOrgAudit({
    orgId: b.orgId, actorUserId: access.context.user.id, actorProfileId: access.context.profile.id, action: 'billing.profile_updated',
    targetType: 'org_billing_profiles', targetId: b.orgId, metadata: { has_gstin: !!row.gstin, state_code: row.state_code }, ...requestOrigin(request),
  })
  return NextResponse.json({ status: 'saved', stateCode: row.state_code })
}
