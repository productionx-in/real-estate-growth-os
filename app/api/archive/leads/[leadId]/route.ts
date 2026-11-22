// app/api/archive/leads/[leadId]/route.ts — restore an archived lead (POST) or erase it now (DELETE). Owners and
// admins; audited. Erasing is permanent: the lead and everything that hangs off it are removed.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { auditMember } from '@/lib/dal/org-audit'
import { eraseArchivedLead, restoreLead } from '@/lib/dal/archive'

async function handle(request: NextRequest, leadId: string, orgId: string | null, action: 'restore' | 'erase') {
  if (!z.string().uuid().safeParse(leadId).success || !z.string().uuid().safeParse(orgId).success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const access = await authorizeOrgAccess(orgId!, ['owner', 'admin'])
  if (!access.success) return access.response
  const r = action === 'restore' ? await restoreLead(orgId!, leadId) : await eraseArchivedLead(orgId!, leadId)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
  await auditMember(request, access.context, orgId!, action === 'restore' ? 'lead.restored' : 'lead.erased', { type: 'lead', id: leadId }, {})
  return NextResponse.json({ ok: true })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ leadId: string }> }) {
  const body = await request.json().catch(() => ({}))
  return handle(request, (await params).leadId, typeof body?.orgId === 'string' ? body.orgId : null, 'restore')
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ leadId: string }> }) {
  return handle(request, (await params).leadId, request.nextUrl.searchParams.get('orgId'), 'erase')
}
