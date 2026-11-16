// app/api/buyers/[buyerId]/documents/[documentId]/access/route.ts
// Secure Document Access & Audit Logging API
import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { authorizeSalesRequest } from '@/lib/sales/auth'

export const dynamic = 'force-dynamic'

interface RouteParams {
  params: Promise<{ buyerId: string; documentId: string }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { buyerId, documentId } = await params
    const { searchParams } = new URL(request.url)
    const orgId = searchParams.get('orgId')

    const auth = await authorizeSalesRequest(orgId)
    if (!auth.success) return auth.response

    const service = createServiceClient()

    // Fetch document metadata and verify tenant boundary
    const { data: doc, error: docErr } = await service
      .from('buyer_documents')
      .select('*')
      .eq('id', documentId)
      .eq('buyer_id', buyerId)
      .eq('org_id', auth.context.orgId)
      .maybeSingle()

    if (docErr || !doc) {
      return NextResponse.json(
        { error: 'Document not found or access denied for this organisation' },
        { status: 404 }
      )
    }

    // Generate short-lived signed access URL or token (e.g. 15 minutes / 900 seconds)
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()
    const authorizedUrl = `/api/storage/proxy?key=${encodeURIComponent(doc.file_key)}&token=${Buffer.from(
      JSON.stringify({ docId: doc.id, orgId: auth.context.orgId, exp: expiresAt })
    ).toString('base64url')}`

    // Audit log for document viewing / download
    await (service.from('buyer_audit_logs' as any) as any).insert({
      org_id: auth.context.orgId,
      buyer_id: buyerId,
      actor_id: auth.context.profile.id,
      action: 'document_accessed',
      details: {
        document_id: (doc as any).id,
        title: (doc as any).title,
        document_type: (doc as any).document_type,
        accessed_at: new Date().toISOString(),
      },
    })

    return NextResponse.json({
      success: true,
      document: {
        id: doc.id,
        title: doc.title,
        fileName: doc.file_name,
        mimeType: doc.mime_type,
        status: doc.status,
      },
      authorizedUrl,
      expiresAt,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
