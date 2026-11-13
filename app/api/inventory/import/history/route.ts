// app/api/inventory/import/history/route.ts
// Secure endpoint to fetch project import history with tenant isolation
import { NextResponse, type NextRequest } from 'next/server'
import { authorizeProjectAccess } from '@/lib/auth/tenant'
import { getProjectImportHistory } from '@/lib/dal/import'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }

    const authResult = await authorizeProjectAccess(projectId)
    if (!authResult.success) {
      return authResult.response
    }

    const history = await getProjectImportHistory(projectId, authResult.context.orgId)
    return NextResponse.json({ history })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
