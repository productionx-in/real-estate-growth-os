// app/api/sales/site-visits/route.ts
import { NextResponse, type NextRequest } from 'next/server'
import { getSiteVisits, scheduleSiteVisit, updateSiteVisit } from '@/lib/dal/sales'
import { authorizeSalesRequest } from '@/lib/sales/auth'
import { SALES_WRITE_ROLES } from '@/lib/auth/permissions'
import type { SiteVisitStatus } from '@/lib/sales/types'
import { requireModule } from '@/lib/auth/entitlements'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const orgId = searchParams.get('orgId')
    const auth = await authorizeSalesRequest(orgId)
    if (!auth.success) return auth.response
    { const gate = await requireModule(auth.context.orgId, 'sales'); if (gate) return gate }

    const projectId = searchParams.get('projectId') || undefined
    const leadId = searchParams.get('leadId') || undefined
    const status = (searchParams.get('status') as SiteVisitStatus) || undefined

    const siteVisits = await getSiteVisits(auth.context.orgId, { projectId, leadId, status })
    return NextResponse.json({ data: siteVisits, count: siteVisits.length })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const auth = await authorizeSalesRequest(body.orgId, SALES_WRITE_ROLES)
    if (!auth.success) return auth.response
    { const gate = await requireModule(auth.context.orgId, 'sales'); if (gate) return gate }

    if (!body.projectId || !body.leadId || !body.scheduledAt) {
      return NextResponse.json(
        { error: 'Missing required fields: projectId, leadId, scheduledAt' },
        { status: 400 }
      )
    }

    const result = await scheduleSiteVisit({
      orgId: auth.context.orgId,
      projectId: body.projectId,
      leadId: body.leadId,
      assignedTo: body.assignedTo,
      scheduledAt: body.scheduledAt,
      notes: body.notes,
      visitorCount: body.visitorCount,
      cabRequired: body.cabRequired,
      cabDetails: body.cabDetails,
      actorId: auth.context.profile.id,
    })

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({ data: result.data }, { status: 201 })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const auth = await authorizeSalesRequest(body.orgId, SALES_WRITE_ROLES)
    if (!auth.success) return auth.response
    { const gate = await requireModule(auth.context.orgId, 'sales'); if (gate) return gate }

    if (!body.id) {
      return NextResponse.json({ error: 'Missing site visit id' }, { status: 400 })
    }

    const result = await updateSiteVisit(body.id, auth.context.orgId, {
      status: body.status,
      outcome: body.outcome,
      notes: body.notes,
      rating: body.rating,
      checkedInAt: body.checkedInAt,
      completedAt: body.completedAt,
      actorId: auth.context.profile.id,
    })

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({ data: result.data })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
