// app/api/v1/leads/route.ts
// Programmatic Developer REST API endpoint for ingesting and querying CRM leads.

import { NextResponse, type NextRequest } from 'next/server'
import { authenticateDeveloperApiKey } from '@/lib/integrations/api-keys/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { processInboundLead } from '@/lib/integrations/inbound'
import { dispatchOutboundWebhook } from '@/lib/integrations/outbound/dispatcher'
import { normalizePhone } from '@/lib/integrations/deduplication'

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization') || request.headers.get('x-api-key')
    const auth = await authenticateDeveloperApiKey(authHeader)

    if (!auth.success || !auth.orgId) {
      return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: auth.statusCode || 401 })
    }

    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100)

    const service = createServiceClient()
    let query = service
      .from('leads')
      .select('id, name, phone, email, status, priority, project_id, source, created_at')
      .eq('org_id', auth.orgId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (projectId) {
      query = query.eq('project_id', projectId)
    }

    const { data: leads, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      data: leads || [],
      count: leads?.length || 0,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization') || request.headers.get('x-api-key')
    const auth = await authenticateDeveloperApiKey(authHeader)

    if (!auth.success || !auth.orgId) {
      return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: auth.statusCode || 401 })
    }

    const body = await request.json()

    // Validate mandatory fields
    const name = (body.name || body.fullName || '').trim()
    const rawPhone = (body.phone || '').trim()

    if (!name || !rawPhone) {
      return NextResponse.json(
        { error: 'Missing required fields: name and phone are mandatory.' },
        { status: 400 }
      )
    }

    const phone = normalizePhone(rawPhone)

    // Ingest into central CRM pipeline
    const ingestResult = await processInboundLead(auth.orgId, {
      provider: 'developer_api',
      name,
      phone,
      email: body.email ? String(body.email).trim().toLowerCase() : null,
      notes: body.notes ? String(body.notes).trim() : 'Programmatic lead submitted via Developer API',
      formId: body.projectId ? String(body.projectId) : undefined,
      externalLeadId: body.externalId ? String(body.externalId) : undefined,
      customFields: body.customFields || {},
      sourceMetadata: {
        api_key_name: auth.keyName,
        ingested_via: 'developer_api_v1',
      },
    })

    // Dispatch outbound webhook event asynchronously if created
    if (ingestResult.success && !ingestResult.isDuplicate && ingestResult.leadId) {
      try {
        await dispatchOutboundWebhook({
          orgId: auth.orgId,
          eventType: 'lead.created',
          payload: {
            leadId: ingestResult.leadId,
            name,
            phone,
            email: body.email || null,
            projectId: ingestResult.projectId,
            source: 'developer_api',
            createdAt: new Date().toISOString(),
          },
        })
      } catch {
        // Non-blocking outbound webhook failure
      }
    }

    return NextResponse.json(
      {
        success: ingestResult.success,
        leadId: ingestResult.leadId || null,
        isDuplicate: ingestResult.isDuplicate,
        action: ingestResult.action,
        routingStatus: ingestResult.routingStatus,
      },
      { status: ingestResult.success ? 201 : 400 }
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
