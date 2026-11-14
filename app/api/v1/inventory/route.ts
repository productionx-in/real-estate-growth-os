// app/api/v1/inventory/route.ts
// Programmatic Developer REST API endpoint for retrieving inventory units.

import { NextResponse, type NextRequest } from 'next/server'
import { authenticateDeveloperApiKey } from '@/lib/integrations/api-keys/auth'
import { createServiceClient } from '@/lib/supabase/server'
import type { InventoryStatus } from '@/types/database'

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization') || request.headers.get('x-api-key')
    const auth = await authenticateDeveloperApiKey(authHeader)

    if (!auth.success || !auth.orgId) {
      return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: auth.statusCode || 401 })
    }

    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    const status = searchParams.get('status')
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200)

    const service = createServiceClient()
    let query = service
      .from('inventory_items')
      .select('id, unit_number, category, status, floor_number, base_price, total_price, super_built_up_area, project_id, created_at')
      .eq('org_id', auth.orgId)
      .limit(limit)

    if (projectId) {
      query = query.eq('project_id', projectId)
    }
    if (status) {
      query = query.eq('status', status as InventoryStatus)
    }

    const { data: units, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      data: units || [],
      count: units?.length || 0,
      orgId: auth.orgId,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
