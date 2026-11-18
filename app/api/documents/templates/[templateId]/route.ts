// app/api/documents/templates/[templateId]/route.ts — remove a template (documents already shared keep working).
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { requireModule } from '@/lib/auth/entitlements'
import { auditMember } from '@/lib/dal/org-audit'
import { archiveTemplate } from '@/lib/dal/documents'

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await params
  const orgId = z.string().uuid().safeParse(new URL(request.url).searchParams.get('orgId'))
  if (!orgId.success || !z.string().uuid().safeParse(templateId).success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const access = await authorizeOrgAccess(orgId.data, ['owner', 'admin', 'manager'])
  if (!access.success) return access.response
  { const gate = await requireModule(orgId.data, 'sales'); if (gate) return gate }
  if (!(await archiveTemplate(orgId.data, templateId))) return NextResponse.json({ error: 'Template not found.' }, { status: 404 })
  await auditMember(request, access.context, orgId.data, 'document.template_removed', { type: 'document_template', id: templateId })
  return NextResponse.json({ ok: true })
}
