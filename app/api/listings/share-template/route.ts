// app/api/listings/share-template/route.ts — the agency's listing share message (Settings → Listing share message).
// Owners and admins; only known fields are allowed in the template. Audited.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { auditMember } from '@/lib/dal/org-audit'
import { saveShareTemplate } from '@/lib/dal/listings'
import { checkTemplate } from '@/lib/listings/listing'
import { requireAgency } from '@/lib/listings/access'

const Schema = z.object({ orgId: z.string().uuid(), template: z.string().max(2000) })

export async function POST(request: NextRequest) {
  const parsed = Schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid template' }, { status: 400 })
  const access = await authorizeOrgAccess(parsed.data.orgId, ['owner', 'admin'])
  if (!access.success) return access.response
  const agency = await requireAgency(parsed.data.orgId); if (agency) return agency
  const { value, error } = checkTemplate(parsed.data.template)
  if (error) return NextResponse.json({ error }, { status: 400 })
  if (!(await saveShareTemplate(parsed.data.orgId, access.context.profile.id, value))) return NextResponse.json({ error: 'Could not save.' }, { status: 500 })
  await auditMember(request, access.context, parsed.data.orgId, 'settings.listing_share_saved', { type: 'organisation', id: parsed.data.orgId }, {})
  return NextResponse.json({ ok: true, template: value })
}
