// app/api/leads/[leadId]/documents/route.ts — create a document for a lead from a template and get its share link.
// Managers and above, or the lead's salesperson (authorizeLeadWork); sales module on.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeLeadWork } from '@/lib/follow-ups/auth'
import { requireModule } from '@/lib/auth/entitlements'
import { createDocument, LINK_DAYS } from '@/lib/dal/documents'

const Schema = z.object({
  templateId: z.string().uuid(),
  unitId: z.string().uuid().nullable().optional(),
  title: z.string().trim().max(120).optional(),
  validDays: z.number().int().min(LINK_DAYS.min).max(LINK_DAYS.max).optional(),
})

export async function POST(request: NextRequest, { params }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await params
  const parsed = Schema.safeParse(await request.json().catch(() => null))
  if (!z.string().uuid().safeParse(leadId).success || !parsed.success) return NextResponse.json({ error: 'Invalid document' }, { status: 400 })
  const auth = await authorizeLeadWork(leadId)
  if (!auth.success) return auth.response
  { const gate = await requireModule(auth.context.orgId, 'sales'); if (gate) return gate }

  const result = await createDocument(auth.context.orgId, leadId, auth.context.profile.id, { ...parsed.data, unitId: parsed.data.unitId ?? null })
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ document: result.data }, { status: 201 })
}
