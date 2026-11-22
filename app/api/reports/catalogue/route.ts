// app/api/reports/catalogue/route.ts — a report of the catalogue as CSV. Owners, admins, managers and read-only members
// (roles that see every lead), Analytics module on. Cells that could start a formula in a spreadsheet are escaped.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { requireModule } from '@/lib/auth/entitlements'
import { CATALOGUE_PERIODS, getCatalogue, memberNames } from '@/lib/dal/report-catalogue'
import { catalogueCsv } from '@/lib/reports/csv'

const Q = z.object({ orgId: z.string().uuid(), report: z.enum(['funnel', 'sources', 'team', 'leads']), period: z.enum(Object.keys(CATALOGUE_PERIODS) as [keyof typeof CATALOGUE_PERIODS]) })

export async function GET(request: NextRequest) {
  const q = Q.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!q.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const { orgId, report, period } = q.data
  const access = await authorizeOrgAccess(orgId, ['owner', 'admin', 'manager', 'readonly'])
  if (!access.success) return access.response
  const m = await requireModule(orgId, 'analytics'); if (m) return m
  const [c, names] = await Promise.all([getCatalogue(orgId, period), report === 'team' ? memberNames(orgId) : Promise.resolve(new Map<string, string>())])
  return new NextResponse(catalogueCsv(report, c, names), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="regrow-${report}-${period}.csv"`, 'Cache-Control': 'no-store' },
  })
}
