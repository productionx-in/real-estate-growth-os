// app/api/integrations/whatsapp/embedded-signup/route.ts — connect a workspace's own WhatsApp Business number
// through RE’s central Meta app (Embedded Signup). Managers, admins and owners of the workspace only.
// GET  → whether signup is available here and the public ids the Facebook JS SDK needs (no secret).
// POST → finish the signup: exchange the code, subscribe webhooks, register the number, store the token encrypted.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { requireModule } from '@/lib/auth/entitlements'
import { createServiceClient } from '@/lib/supabase/server'
import { auditMember } from '@/lib/dal/org-audit'
import { encryptCredential } from '@/lib/integrations/crypto'
import { embeddedSignupConfig } from '@/lib/integrations/readiness'
import { checkSignupInput, completeEmbeddedSignup, EmbeddedSignupError } from '@/lib/integrations/whatsapp/embedded-signup'
import { MAX_WHATSAPP_NUMBERS, phoneNumberIdOf, wabaIdOf } from '@/lib/integrations/whatsapp/numbers'
import type { Json } from '@/types/database'

const ROLES = ['owner', 'admin', 'manager'] as const

export async function GET(request: NextRequest) {
  const orgId = request.nextUrl.searchParams.get('orgId') ?? ''
  if (!z.string().uuid().safeParse(orgId).success) return NextResponse.json({ error: 'Invalid workspace' }, { status: 400 })
  const access = await authorizeOrgAccess(orgId, [...ROLES])
  if (!access.success) return access.response
  { const gate = await requireModule(orgId, 'integrations'); if (gate) return gate }
  const c = embeddedSignupConfig()
  return NextResponse.json(c.available ? c : { available: false, appId: null, configId: null, apiVersion: c.apiVersion })
}

const Body = z.object({
  orgId: z.string().uuid(),
  code: z.string(),
  wabaId: z.string(),
  phoneNumberId: z.string(),
  pin: z.string(),
})

export async function POST(request: NextRequest) {
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const { orgId, ...input } = parsed.data
  const access = await authorizeOrgAccess(orgId, [...ROLES])
  if (!access.success) return access.response
  { const gate = await requireModule(orgId, 'integrations'); if (gate) return gate }

  const problem = checkSignupInput(input)
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })

  const cfg = embeddedSignupConfig()
  const appSecret = process.env.META_APP_SECRET
  if (!cfg.available || !cfg.appId || !appSecret) {
    return NextResponse.json({ error: 'WhatsApp sign-up is not available yet. RE is finishing its Meta app set-up.' }, { status: 503 })
  }

  const service = createServiceClient()
  // One WhatsApp account or number belongs to one workspace: the central webhook routes by these ids.
  const { data: others } = await service
    .from('integration_connections')
    .select('id, org_id, metadata')
    .eq('provider', 'whatsapp_cloud')
    .eq('status', 'connected')
    .neq('org_id', orgId)
  const taken = (others ?? []).some((c) => {
    const m = (c.metadata ?? {}) as Record<string, unknown>
    return m.wabaId === input.wabaId || phoneNumberIdOf(m) === input.phoneNumberId
  })
  if (taken) return NextResponse.json({ error: 'This WhatsApp number is already connected to another RE workspace.' }, { status: 409 })

  let result
  try {
    result = await completeEmbeddedSignup(input, { appId: cfg.appId, appSecret, apiVersion: cfg.apiVersion })
  } catch (e) {
    const message = e instanceof EmbeddedSignupError ? e.message : 'Could not reach Meta. Please try again.'
    return NextResponse.json({ error: message }, { status: 502 })
  }

  const now = new Date().toISOString()
  const row = {
    org_id: orgId,
    provider: 'whatsapp_cloud' as const,
    name: result.phone.verifiedName ? `WhatsApp · ${result.phone.verifiedName}` : 'WhatsApp Business',
    external_account_id: input.wabaId,
    status: 'connected' as const,
    connected_by: access.context.profile.id,
    credential_ref: encryptCredential(result.accessToken),
    last_sync_at: now,
    last_error: result.warning,
    metadata: {
      connectedVia: 'embedded_signup',
      wabaId: input.wabaId,
      selectedPhoneNumberId: input.phoneNumberId,
      displayPhoneNumber: result.phone.displayPhoneNumber,
      verifiedName: result.phone.verifiedName,
      qualityRating: result.phone.qualityRating,
      registeredForSending: result.registered,
      authorized_at: now,
    } as unknown as Json,
  }

  // A workspace can connect several numbers (lib/integrations/whatsapp/numbers.ts). Connecting the same number again
  // refreshes its connection (keeping its conversations and history); a new number becomes a new connection.
  const { data: mine } = await service
    .from('integration_connections')
    .select('id, metadata, status, external_account_id')
    .eq('org_id', orgId)
    .eq('provider', 'whatsapp_cloud')
    .order('created_at', { ascending: true })
  const own = (mine ?? []).map((c) => ({ ...c, metadata: (c.metadata ?? {}) as Record<string, unknown> }))
  const existing = own.find((c) => phoneNumberIdOf(c.metadata) === input.phoneNumberId)
    // A connection from before several numbers were possible, on the same business account but with no number stored.
    ?? own.find((c) => !phoneNumberIdOf(c.metadata) && wabaIdOf(c.metadata, c.external_account_id) === input.wabaId)
  if (!existing && own.filter((c) => c.status === 'connected').length >= MAX_WHATSAPP_NUMBERS) {
    return NextResponse.json({ error: `A workspace can connect up to ${MAX_WHATSAPP_NUMBERS} WhatsApp numbers. Disconnect one you no longer use first.` }, { status: 409 })
  }
  const write = existing
    ? await service.from('integration_connections').update(row).eq('id', existing.id).eq('org_id', orgId).select('id').single()
    : await service.from('integration_connections').insert(row).select('id').single()
  if (write.error || !write.data) return NextResponse.json({ error: 'Could not save the connection.' }, { status: 500 })

  await auditMember(request, access.context, orgId, 'integration.connected', { type: 'integration', id: write.data.id }, {
    provider: 'whatsapp_cloud', via: 'embedded_signup', number: result.phone.displayPhoneNumber, registered: result.registered,
  })
  return NextResponse.json({ ok: true, connectionId: write.data.id, phone: result.phone, warning: result.warning })
}
