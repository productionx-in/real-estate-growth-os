// app/api/settings/business-profile/route.ts — the company's details used on documents (letterhead, signatory, bank
// account for payments). Owners and admins only; validated twice (here and by the table's CHECKs, 20260071); audited.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { auditMember } from '@/lib/dal/org-audit'
import { saveBusinessProfile } from '@/lib/dal/documents'
import { EMPTY_PROFILE, normaliseProfile, type BusinessProfile } from '@/lib/documents/letterhead'

const field = z.string().max(600).nullable().optional()
const Schema = z.object({
  orgId: z.string().uuid(),
  profile: z.object(Object.fromEntries(Object.keys(EMPTY_PROFILE).map((k) => [k, field])) as Record<keyof BusinessProfile, typeof field>),
})

export async function POST(request: NextRequest) {
  const parsed = Schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid business details' }, { status: 400 })
  const access = await authorizeOrgAccess(parsed.data.orgId, ['owner', 'admin'])
  if (!access.success) return access.response

  const { profile, errors } = normaliseProfile(parsed.data.profile)
  if (Object.keys(errors).length) return NextResponse.json({ error: 'Some details need fixing.', fields: errors }, { status: 400 })
  if (!(await saveBusinessProfile(parsed.data.orgId, access.context.profile.id, profile))) {
    return NextResponse.json({ error: 'Could not save the business details.' }, { status: 500 })
  }
  // Which fields changed is enough for the audit trail; the values (bank account, PAN) stay out of it.
  const filled = (Object.keys(profile) as (keyof BusinessProfile)[]).filter((k) => profile[k] !== null)
  await auditMember(request, access.context, parsed.data.orgId, 'org.business_profile_saved', { type: 'organisation', id: parsed.data.orgId }, { fields_filled: filled })
  return NextResponse.json({ ok: true })
}
