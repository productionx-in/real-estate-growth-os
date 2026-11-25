// app/api/settings/sales/route.ts — Settings → Sales structure: whether the owner also sells, and team structure.
// Owners and admins only. The database enforces "owner sells" on every assignment (member_can_take_leads, 20260096).
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { auditMember } from '@/lib/dal/org-audit'
import { getSalesStructure, saveSalesStructure } from '@/lib/dal/sales-structure'

const Schema = z.object({ orgId: z.string().uuid(), ownerSells: z.boolean(), teamsEnabled: z.boolean() })

export async function PUT(request: NextRequest) {
  const parsed = Schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid settings' }, { status: 400 })
  const { orgId, ownerSells, teamsEnabled } = parsed.data
  const access = await authorizeOrgAccess(orgId, ['owner', 'admin'])
  if (!access.success) return access.response
  const before = await getSalesStructure(orgId)
  if (!(await saveSalesStructure(orgId, access.context.profile.id, { ownerSells, teamsEnabled }))) {
    return NextResponse.json({ error: 'Could not save the settings.' }, { status: 500 })
  }
  await auditMember(request, access.context, orgId, 'settings.sales_saved', { type: 'organisation', id: orgId }, { before, after: { ownerSells, teamsEnabled } })
  return NextResponse.json({ ok: true })
}
