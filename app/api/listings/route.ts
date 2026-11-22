// app/api/listings/route.ts — add a resale or rental listing (agencies). Anyone who sells (not viewers or
// post-sales); a sales executive's listing is theirs, managers may give it to another agent. Audited.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { auditMember } from '@/lib/dal/org-audit'
import { createListing } from '@/lib/dal/listings'
import { isManagement } from '@/lib/auth/permissions'
import { normaliseListing } from '@/lib/listings/listing'
import { requireAgency } from '@/lib/listings/access'

const Schema = z.object({ orgId: z.string().uuid(), listing: z.record(z.string(), z.unknown()), assignedTo: z.string().uuid().nullable().optional() })

export async function POST(request: NextRequest) {
  const parsed = Schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid listing' }, { status: 400 })
  const { orgId } = parsed.data
  const access = await authorizeOrgAccess(orgId, ['owner', 'admin', 'manager', 'team_lead', 'sales_exec'])
  if (!access.success) return access.response
  const agency = await requireAgency(orgId); if (agency) return agency
  const { row, errors } = normaliseListing(parsed.data.listing)
  if (Object.keys(errors).length) return NextResponse.json({ error: Object.values(errors)[0], fields: errors }, { status: 400 })
  const me = access.context.profile.id
  const assignee = isManagement(access.context.role) ? (parsed.data.assignedTo ?? me) : me
  const r = await createListing(orgId, me, row, assignee)
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: 400 })
  await auditMember(request, access.context, orgId, 'listing.created', { type: 'listing', id: r.id }, { title: row.title, kind: row.kind })
  return NextResponse.json({ ok: true, id: r.id })
}
