// app/api/buyers/[buyerId]/documents/route.ts
// Buyer KYC & Transaction Documents API
import { NextResponse, type NextRequest } from 'next/server'
import { uploadBuyerDocument, verifyBuyerDocument } from '@/lib/dal/buyers'
import { authorizeSalesRequest } from '@/lib/sales/auth'
import { uploadDocumentSchema, verifyDocumentSchema } from '@/lib/validations/buyers'

export const dynamic = 'force-dynamic'

interface RouteParams {
  params: Promise<{ buyerId: string }>
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { buyerId } = await params
    const body = await request.json()

    const auth = await authorizeSalesRequest(body.orgId)
    if (!auth.success) return auth.response

    if (auth.context.role === 'readonly') {
      return NextResponse.json({ error: 'Readonly users cannot upload documents' }, { status: 403 })
    }

    const parsed = uploadDocumentSchema.safeParse({ ...body, buyerId })
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const result = await uploadBuyerDocument({
      orgId: auth.context.orgId,
      buyerId,
      bookingId: parsed.data.bookingId || null,
      documentType: parsed.data.documentType,
      title: parsed.data.title,
      fileKey: parsed.data.fileKey,
      fileName: parsed.data.fileName,
      fileSizeBytes: parsed.data.fileSizeBytes || null,
      mimeType: parsed.data.mimeType,
      actorId: auth.context.profile.id,
    })

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({ data: result.data }, { status: 201 })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const body = await request.json()
    const auth = await authorizeSalesRequest(body.orgId)
    if (!auth.success) return auth.response

    // Verification requires manager or admin
    if (auth.context.role !== 'owner' && auth.context.role !== 'admin' && auth.context.role !== 'manager') {
      return NextResponse.json(
        { error: 'Forbidden. Document verification requires Manager or Admin authority.' },
        { status: 403 }
      )
    }

    const parsed = verifyDocumentSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const result = await verifyBuyerDocument({
      orgId: auth.context.orgId,
      documentId: parsed.data.documentId,
      status: parsed.data.status,
      notes: parsed.data.notes || null,
      actorId: auth.context.profile.id,
    })

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({ data: result.data })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
