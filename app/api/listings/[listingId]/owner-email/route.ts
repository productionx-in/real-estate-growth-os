// app/api/listings/[listingId]/owner-email/route.ts — e-mail a property's owner about their listing (lib/listings/
// owner-email.ts). Only people who may see the owner (managers and above, the listing's agent, whoever added it) and
// may change the listing; only to the owner's address stored on the listing; at most once a day per message (the
// outbox key). The message is rendered at delivery from the listing as it is then. Audited without the address.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { auditMember } from '@/lib/dal/org-audit'
import { getListing, updateListing } from '@/lib/dal/listings'
import { requireAgency } from '@/lib/listings/access'
import { OWNER_EMAILS, ownerEmailBlocker, type OwnerEmailKind } from '@/lib/listings/owner-email'
import { sendEmailNow } from '@/lib/email/service'
import { createServiceClient } from '@/lib/supabase/server'

const Body = z.object({ orgId: z.string().uuid(), kind: z.enum(Object.keys(OWNER_EMAILS) as [OwnerEmailKind, ...OwnerEmailKind[]]) })

export async function POST(request: NextRequest, { params }: { params: Promise<{ listingId: string }> }) {
  const { listingId } = await params
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!z.string().uuid().safeParse(listingId).success || !parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const { orgId, kind } = parsed.data
  const access = await authorizeOrgAccess(orgId, ['owner', 'admin', 'manager', 'team_lead', 'sales_exec'])
  if (!access.success) return access.response
  const agency = await requireAgency(orgId); if (agency) return agency
  const viewer = { role: access.context.role, profileId: access.context.profile.id }
  const listing = await getListing(orgId, listingId, viewer)
  if (!listing) return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
  if (!listing.canEdit || !listing.owner) return NextResponse.json({ error: 'Only the listing’s agent or a manager can e-mail the owner.' }, { status: 403 })
  const blocker = ownerEmailBlocker(kind, listing)
  if (blocker) return NextResponse.json({ error: blocker }, { status: 400 })

  const day = new Date().toISOString().slice(0, 10)
  const result = await sendEmailNow(createServiceClient(), {
    orgId, category: 'sales', template: 'listing.owner', to: listing.owner.email!,
    payload: { listingId, kind, agentId: listing.assignedTo ?? viewer.profileId },
    idempotencyKey: `listing-owner:${listingId}:${kind}:${day}`,
  })
  if (result.outcome === 'failed') return NextResponse.json({ error: result.error ?? 'The e-mail could not be sent.' }, { status: 502 })
  await updateListing(orgId, listingId, { owner_emailed_at: new Date().toISOString(), owner_email_kind: kind })
  await auditMember(request, access.context, orgId, 'listing.owner_emailed', { type: 'listing', id: listingId }, { kind, outcome: result.outcome })
  const again = result.outcome === 'not_claimed'
  return NextResponse.json({ ok: true, outcome: result.outcome, message: again ? 'This message already went to the owner today.' : result.outcome === 'sent' ? 'Sent to the owner.' : 'Queued — it will go out shortly.' })
}
