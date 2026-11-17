// app/api/integrations/connections/[connectionId]/webhook-secret/route.ts
// Secure endpoint to generate, rotate, or invalidate a connection's webhook signing secret.
// Plaintext secret is returned ONCE to the authorized caller; encrypted vault ref is saved to database.

import { NextResponse, type NextRequest } from 'next/server'
import { authenticateCaller } from '@/lib/auth/tenant'
import { createServiceClient } from '@/lib/supabase/server'
import {
  generateWebhookSecretForConnection,
  invalidatePreviousWebhookSecret,
} from '@/lib/dal/integrations'
import { auditMember } from '@/lib/dal/org-audit'

interface RouteContext {
  params: Promise<{ connectionId: string }>
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const authResult = await authenticateCaller()
    if (!authResult.success) return authResult.response

    const { connectionId } = await params
    const service = createServiceClient()

    // Find connection to identify org
    const { data: conn } = await service
      .from('integration_connections')
      .select('id, org_id, provider')
      .eq('id', connectionId)
      .maybeSingle()

    if (!conn) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
    }

    // RBAC: Verify user is manager/admin/owner in this organisation
    const { data: membership } = await service
      .from('org_members')
      .select('role')
      .eq('status', 'active')
      .eq('org_id', conn.org_id)
      .eq('profile_id', authResult.auth.profile.id)
      .maybeSingle()

    if (!membership || !['owner', 'admin', 'manager'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'Forbidden. Only managers and administrators can manage webhook secrets.' },
        { status: 403 }
      )
    }

    let body: Record<string, unknown> = {}
    try {
      if (request.headers.get('content-type')?.includes('application/json')) {
        body = await request.json()
      }
    } catch {
      // Empty body is acceptable
    }

    if (body.action === 'invalidate_previous') {
      const invalidResult = await invalidatePreviousWebhookSecret(connectionId, conn.org_id)
      if (!invalidResult.success) {
        return NextResponse.json(
          { error: invalidResult.error ?? 'Failed to invalidate previous secret' },
          { status: 400 }
        )
      }
      await auditMember(request, authResult.auth, conn.org_id, 'integration.webhook_secret_invalidated', { type: 'integration', id: connectionId })
      return NextResponse.json({
        success: true,
        message: 'Previous webhook secret has been immediately invalidated and purged.',
      })
    }

    const immediateRevocation = Boolean(body.immediateRevocation)
    const gracePeriodMinutes = typeof body.gracePeriodMinutes === 'number' ? body.gracePeriodMinutes : 15

    const result = await generateWebhookSecretForConnection(connectionId, conn.org_id, {
      immediateRevocation,
      gracePeriodMinutes,
    })

    if (!result.secret || result.error) {
      return NextResponse.json(
        { error: result.error ?? 'Failed to generate webhook secret' },
        { status: 400 }
      )
    }
    // The secret itself is never written to the audit trail.
    await auditMember(request, authResult.auth, conn.org_id, 'integration.webhook_secret_rotated', { type: 'integration', id: connectionId }, {
      provider: conn.provider,
      immediate_revocation: immediateRevocation,
      grace_period_minutes: immediateRevocation ? 0 : gracePeriodMinutes,
    })

    return NextResponse.json({
      success: true,
      secret: result.secret,
      gracePeriodMinutes: immediateRevocation ? 0 : gracePeriodMinutes,
      message:
        'Webhook secret generated successfully. Save this secret securely; it will not be shown again in plaintext.',
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const authResult = await authenticateCaller()
    if (!authResult.success) return authResult.response

    const { connectionId } = await params
    const service = createServiceClient()

    const { data: conn } = await service
      .from('integration_connections')
      .select('id, org_id')
      .eq('id', connectionId)
      .maybeSingle()

    if (!conn) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
    }

    const { data: membership } = await service
      .from('org_members')
      .select('role')
      .eq('status', 'active')
      .eq('org_id', conn.org_id)
      .eq('profile_id', authResult.auth.profile.id)
      .maybeSingle()

    if (!membership || !['owner', 'admin', 'manager'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'Forbidden. Only managers and administrators can manage webhook secrets.' },
        { status: 403 }
      )
    }

    const result = await invalidatePreviousWebhookSecret(connectionId, conn.org_id)
    if (!result.success) {
      return NextResponse.json(
        { error: result.error ?? 'Failed to invalidate previous secret' },
        { status: 400 }
      )
    }
    await auditMember(request, authResult.auth, conn.org_id, 'integration.webhook_secret_invalidated', { type: 'integration', id: connectionId })

    return NextResponse.json({
      success: true,
      message: 'Previous webhook secret has been immediately invalidated and purged.',
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
