// app/api/listings/[listingId]/route.ts — change or delete a listing. Changing: managers and above, the listing's
// agent, or whoever added it. Deleting: owners and admins (closing or withdrawing keeps the record). Audited.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { auditMember } from '@/lib/dal/org-audit'
import { canEditListing, deleteListing, listingAccessRow, updateListing } from '@/lib/dal/listings'
import { isManagement } from '@/lib/auth/permissions'
import { LISTING_STATUSES, normaliseListing } from '@/lib/listings/listing'
import { requireAgency } from '@/lib/listings/access'

const Patch = z.object({
  orgId: z.string().uuid(),
  listing: z.record(z.string(), z.unknown()).optional(),
  status: z.enum(Object.keys(LISTING_STATUSES) as [string, ...string[]]).optional(),
  assignedTo: z.string().uuid().optional(),
})

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ listingId: string }> }) {
  const { listingId } = await params
  const parsed = Patch.safeParse(await request.json().catch(() => null))
  if (!z.string().uuid().safeParse(listingId).success || !parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const { orgId } = parsed.data
  const access = await authorizeOrgAccess(orgId, ['owner', 'admin', 'manager', 'team_lead', 'sales_exec'])
  if (!access.success) return access.response
  const agency = await requireAgency(orgId); if (agency) return agency
  const current = await listingAccessRow(orgId, listingId)
  if (!current) return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
  const viewer = { role: access.context.role, profileId: access.context.profile.id }
  if (!canEditListing(viewer, current)) return NextResponse.json({ error: 'Only the listing’s agent or a manager can change it.' }, { status: 403 })

  let patch: Record<string, unknown> = {}
  if (parsed.data.listing) {
    const { row, errors } = normaliseListing(parsed.data.listing)
    if (Object.keys(errors).length) return NextResponse.json({ error: Object.values(errors)[0], fields: errors }, { status: 400 })
    patch = row
    // Editing the details never changes the status (that has its own control).
    if (!('status' in parsed.data.listing)) delete patch.status
  }
  if (parsed.data.status) patch.status = parsed.data.status
  if (parsed.data.assignedTo) {
    if (!isManagement(access.context.role)) return NextResponse.json({ error: 'Only a manager can hand a listing to another agent.' }, { status: 403 })
    patch.assigned_to = parsed.data.assignedTo
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 })
  if (!(await updateListing(orgId, listingId, patch))) return NextResponse.json({ error: 'Could not save the listing.' }, { status: 400 })
  await auditMember(request, access.context, orgId, 'listing.updated', { type: 'listing', id: listingId }, { fields: Object.keys(patch).filter((k) => !k.startsWith('owner_')).concat(Object.keys(patch).some((k) => k.startsWith('owner_')) ? ['owner details'] : []) })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ listingId: string }> }) {
  const { listingId } = await params
  const orgId = request.nextUrl.searchParams.get('orgId') ?? ''
  if (!z.string().uuid().safeParse(listingId).success || !z.string().uuid().safeParse(orgId).success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const access = await authorizeOrgAccess(orgId, ['owner', 'admin'])
  if (!access.success) return access.response
  const agency = await requireAgency(orgId); if (agency) return agency
  if (!(await deleteListing(orgId, listingId))) return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
  await auditMember(request, access.context, orgId, 'listing.deleted', { type: 'listing', id: listingId }, {})
  return NextResponse.json({ ok: true })
}
