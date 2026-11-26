// app/api/leads/[leadId]/documents/preview/route.ts — the filled-in text before creating, and any fields with no value.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeLeadWork } from '@/lib/follow-ups/auth'
import { requireModule } from '@/lib/auth/entitlements'
import { previewDocument } from '@/lib/dal/documents'

const Schema = z.object({ templateId: z.string().uuid(), unitId: z.string().uuid().nullable().optional() })

export async function POST(request: NextRequest, { params }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await params
  const parsed = Schema.safeParse(await request.json().catch(() => null))
  if (!z.string().uuid().safeParse(leadId).success || !parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const auth = await authorizeLeadWork(leadId)
  if (!auth.success) return auth.response
  { const gate = await requireModule(auth.context.orgId, 'documents'); if (gate) return gate }
  const preview = await previewDocument(auth.context.orgId, leadId, parsed.data.templateId, parsed.data.unitId ?? null)
  if (!preview) return NextResponse.json({ error: 'Template or unit not found.' }, { status: 404 })
  return NextResponse.json(preview)
}
