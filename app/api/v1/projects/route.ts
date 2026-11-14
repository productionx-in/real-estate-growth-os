// app/api/v1/projects/route.ts
// Programmatic Developer REST API endpoint for retrieving projects.

import { NextResponse, type NextRequest } from 'next/server'
import { authenticateDeveloperApiKey } from '@/lib/integrations/api-keys/auth'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization') || request.headers.get('x-api-key')
    const auth = await authenticateDeveloperApiKey(authHeader)

    if (!auth.success || !auth.orgId) {
      return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: auth.statusCode || 401 })
    }

    const service = createServiceClient()
    const { data: projects, error } = await service
      .from('projects')
      .select('id, name, slug, category, status, rera_number, created_at, updated_at')
      .eq('org_id', auth.orgId)
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      data: projects || [],
      count: projects?.length || 0,
      orgId: auth.orgId,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
