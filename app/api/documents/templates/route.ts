// app/api/documents/templates/route.ts — create or edit a document template (owners, admins, managers; sales module).
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { requireModule } from '@/lib/auth/entitlements'
import { auditMember } from '@/lib/dal/org-audit'
import { saveTemplate, TEMPLATE_KINDS } from '@/lib/dal/documents'

const Schema = z.object({
  orgId: z.string().uuid(),
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, 'Give the template a name.').max(80),
  kind: z.enum(Object.keys(TEMPLATE_KINDS) as [keyof typeof TEMPLATE_KINDS, ...(keyof typeof TEMPLATE_KINDS)[]]),
  body: z.string().trim().min(1, 'Write the template.').max(20000, 'Keep the template under 20,000 characters.'),
  letterhead: z.boolean().optional(),
})

export async function POST(request: NextRequest) {
  const parsed = Schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid template' }, { status: 400 })
  const { orgId, ...input } = parsed.data
  const access = await authorizeOrgAccess(orgId, ['owner', 'admin', 'manager'])
  if (!access.success) return access.response
  { const gate = await requireModule(orgId, 'documents'); if (gate) return gate }

  const result = await saveTemplate(orgId, access.context.profile.id, input)
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status })
  await auditMember(request, access.context, orgId, 'document.template_saved', { type: 'document_template', id: result.data.id }, { name: input.name, created: !input.id })
  return NextResponse.json({ id: result.data.id }, { status: input.id ? 200 : 201 })
}
