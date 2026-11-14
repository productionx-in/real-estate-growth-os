// app/api/automation/attribution/route.ts
import { NextResponse, type NextRequest } from 'next/server'
import { authorizeSalesRequest } from '@/lib/sales/auth'
import { calculateAttribution } from '@/lib/automation/attribution'
import { createServiceClient } from '@/lib/supabase/server'
import type { LeadTouchpoint, AttributionModel } from '@/lib/automation/types'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const orgId = searchParams.get('orgId')
    const auth = await authorizeSalesRequest(orgId)
    if (!auth.success) return auth.response

    const leadId = searchParams.get('leadId')
    const projectId = searchParams.get('projectId')
    const model = (searchParams.get('model') as AttributionModel) || 'linear'
    const conversionValue = Number(searchParams.get('conversionValue') || 10000000)

    const service = createServiceClient()
    let query = service.from('lead_touchpoints').select('*').eq('org_id', auth.context.orgId)

    if (leadId) query = query.eq('lead_id', leadId)
    if (projectId) query = query.eq('project_id', projectId)

    const { data: touchpoints } = await query.order('occurred_at', { ascending: true })

    const typedTouchpoints = (touchpoints || []) as unknown as LeadTouchpoint[]
    const results = calculateAttribution(typedTouchpoints, conversionValue, model)

    return NextResponse.json({
      model,
      conversionValue,
      touchpointsCount: typedTouchpoints.length,
      attribution: results,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const auth = await authorizeSalesRequest(body.orgId)
    if (!auth.success) return auth.response

    if (!body.leadId || !body.channel || !body.touchpointType) {
      return NextResponse.json(
        { error: 'Missing required fields: leadId, channel, touchpointType' },
        { status: 400 }
      )
    }

    const service = createServiceClient()
    const { data: tp, error } = await service
      .from('lead_touchpoints')
      .insert({
        org_id: auth.context.orgId,
        lead_id: body.leadId,
        project_id: body.projectId || null,
        channel: body.channel,
        touchpoint_type: body.touchpointType,
        campaign_name: body.campaignName || null,
        campaign_id: body.campaignId || null,
        ad_name: body.adName || null,
        utm_source: body.utmSource || null,
        utm_medium: body.utmMedium || null,
        utm_campaign: body.utmCampaign || null,
        referrer_url: body.referrerUrl || null,
        landing_page: body.landingPage || null,
        channel_partner_id: body.channelPartnerId || null,
        metadata: (body.metadata || {}) as unknown as import('@/types/database').Json,
      })
      .select('*')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ data: tp }, { status: 201 })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
