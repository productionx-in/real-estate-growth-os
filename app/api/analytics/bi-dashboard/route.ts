// app/api/analytics/bi-dashboard/route.ts
import { NextResponse, type NextRequest } from 'next/server'
import { authorizeSalesRequest } from '@/lib/sales/auth'
import { getExecutiveBiAnalytics } from '@/lib/dal/analytics'
import { requireModule } from '@/lib/auth/entitlements'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const orgId = searchParams.get('orgId')
    const auth = await authorizeSalesRequest(orgId)
    if (!auth.success) return auth.response
    { const gate = await requireModule(auth.context.orgId, 'analytics'); if (gate) return gate }

    const projectId = searchParams.get('projectId') || undefined
    const analytics = await getExecutiveBiAnalytics(auth.context.orgId, projectId)

    return NextResponse.json({ data: analytics })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
