// app/api/leads/[leadId]/documents/[documentId]/route.ts — turn off a document's share link.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeLeadWork } from '@/lib/follow-ups/auth'
import { requireModule } from '@/lib/auth/entitlements'
import { revokeDocument } from '@/lib/dal/documents'

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ leadId: string; documentId: string }> }) {
  const { leadId, documentId } = await params
  if (!z.string().uuid().safeParse(leadId).success || !z.string().uuid().safeParse(documentId).success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
  const auth = await authorizeLeadWork(leadId)
  if (!auth.success) return auth.response
  { const gate = await requireModule(auth.context.orgId, 'sales'); if (gate) return gate }
  if (!(await revokeDocument(auth.context.orgId, leadId, documentId))) return NextResponse.json({ error: 'Document not found.' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
