// app/api/integrations/domains/[domainId]/route.ts — check a domain's DNS records now (POST) or remove it (DELETE)
// (20260103). Owners, admins and managers; the lookup runs on the server.
import { NextResponse, type NextRequest } from 'next/server'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { requireModule } from '@/lib/auth/entitlements'
import { auditMember } from '@/lib/dal/org-audit'
import { checkDomainNow, removeDomain } from '@/lib/dal/domains'

const MANAGERS = ['owner', 'admin', 'manager'] as const
const ids = (request: NextRequest, domainId: string) => {
  const orgId = request.nextUrl.searchParams.get('orgId') ?? ''
  return /^[0-9a-f-]{36}$/i.test(orgId) && /^[0-9a-f-]{36}$/i.test(domainId) ? orgId : null
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ domainId: string }> }) {
  const { domainId } = await params
  const orgId = ids(request, domainId)
  if (!orgId) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const access = await authorizeOrgAccess(orgId, [...MANAGERS])
  if (!access.success) return access.response
  { const gate = await requireModule(orgId, 'integrations'); if (gate) return gate }
  const r = await checkDomainNow(orgId, domainId)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
  if (r.domain.status === 'verified' && r.domain.verifiedAt && Date.now() - Date.parse(r.domain.verifiedAt) < 60_000) {
    await auditMember(request, access.context, orgId, 'integration.domain_verified', { type: 'domain', id: domainId }, { purpose: r.domain.purpose, domain: r.domain.domain })
  }
  return NextResponse.json({ ok: true, domain: r.domain, problems: r.problems })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ domainId: string }> }) {
  const { domainId } = await params
  const orgId = ids(request, domainId)
  if (!orgId) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const access = await authorizeOrgAccess(orgId, [...MANAGERS])
  if (!access.success) return access.response
  { const gate = await requireModule(orgId, 'integrations'); if (gate) return gate }
  if (!(await removeDomain(orgId, domainId))) return NextResponse.json({ error: 'Domain not found.' }, { status: 404 })
  await auditMember(request, access.context, orgId, 'integration.domain_removed', { type: 'domain', id: domainId })
  return NextResponse.json({ ok: true })
}
