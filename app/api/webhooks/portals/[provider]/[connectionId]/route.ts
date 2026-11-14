// app/api/webhooks/portals/[provider]/[connectionId]/route.ts
// Connection-specific webhook receiver for Indian Property Portals (99acres, Magicbricks, Housing.com).

import { NextResponse, type NextRequest } from 'next/server'
import { processPortalWebhook } from '@/lib/integrations/portals/processor'
import type { PortalProvider } from '@/lib/integrations/portals/types'

interface RouteContext {
  params: Promise<{
    provider: string
    connectionId: string
  }>
}

function resolvePortalProvider(rawProvider: string): PortalProvider | null {
  const norm = rawProvider.toLowerCase().trim()
  if (norm === '99acres' || norm === 'property_portal_99acres') {
    return 'property_portal_99acres'
  }
  if (norm === 'magicbricks' || norm === 'property_portal_magicbricks') {
    return 'property_portal_magicbricks'
  }
  if (norm === 'housing' || norm === 'housing.com' || norm === 'property_portal_housing') {
    return 'property_portal_housing'
  }
  return null
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { provider: rawProvider, connectionId } = await params

    const provider = resolvePortalProvider(rawProvider)
    if (!provider) {
      return NextResponse.json(
        {
          error: `Unsupported portal provider '${rawProvider}'. Expected '99acres', 'magicbricks', or 'housing'.`,
        },
        { status: 400 }
      )
    }

    // Extract authorization key from standard headers
    const authHeader =
      request.headers.get('authorization') ||
      request.headers.get('x-api-key') ||
      request.headers.get('x-portal-api-key')

    // Parse payload (supports JSON and form-urlencoded)
    let rawPayload: Record<string, unknown> = {}
    const contentType = request.headers.get('content-type') || ''

    if (contentType.includes('application/json')) {
      rawPayload = await request.json()
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await request.formData()
      for (const [key, value] of formData.entries()) {
        rawPayload[key] = value
      }
    } else {
      // Fallback: attempt JSON parse
      try {
        rawPayload = await request.json()
      } catch {
        return NextResponse.json(
          { error: 'Invalid content type. Expected application/json or application/x-www-form-urlencoded.' },
          { status: 400 }
        )
      }
    }

    const result = await processPortalWebhook({
      provider,
      connectionId,
      rawPayload,
      authHeader,
    })

    if (!result.success && result.errorCode === 'unauthorized') {
      return NextResponse.json({ error: result.error }, { status: 401 })
    }

    if (!result.success && result.errorCode === 'connection_not_found') {
      return NextResponse.json({ error: result.error }, { status: 404 })
    }

    if (!result.success && result.errorCode === 'connection_inactive') {
      return NextResponse.json({ error: result.error }, { status: 403 })
    }

    return NextResponse.json(
      {
        success: true,
        status: result.processingStatus || 'processed',
        leadId: result.leadId || null,
        isDuplicate: Boolean(result.isDuplicate),
      },
      { status: 200 }
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
