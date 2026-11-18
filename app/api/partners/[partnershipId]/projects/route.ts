// app/api/partners/[partnershipId]/projects/route.ts — PUT { orgId, projectId, visibility }: a developer's
// owner/admin shares one of its own projects with this partner, changes what the agency sees of its inventory,
// or stops sharing (visibility null). partner_share_project checks the project and partnership belong to them.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { requireModule } from '@/lib/auth/entitlements'
import { shareProject } from '@/lib/dal/partners'
import { ShareProject } from '@/lib/validations/partners'
import { parseJson, respond, serverError } from '@/lib/routing/http'

type Ctx = { params: Promise<{ partnershipId: string }> }

export async function PUT(request: NextRequest, { params }: Ctx) {
  try {
    const { partnershipId } = await params
    if (!z.string().uuid().safeParse(partnershipId).success) return NextResponse.json({ error: 'Partnership not found' }, { status: 404 })
    const input = await parseJson(request, ShareProject)
    if (!input.ok) return input.response
    const auth = await authorizeOrgAccess(input.data.orgId, ['owner', 'admin'])
    if (!auth.success) return auth.response
    { const gate = await requireModule(auth.context.orgId, 'sales'); if (gate) return gate }
    return respond(await shareProject(auth.context.orgId, auth.context.profile.id, partnershipId, input.data.projectId, input.data.visibility))
  } catch (err) {
    return serverError('share project', err)
  }
}
