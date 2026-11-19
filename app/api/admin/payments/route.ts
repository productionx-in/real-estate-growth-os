// app/api/admin/payments/route.ts — Platform Admin payments operations. Every action needs an MFA-verified staff
// session; the database functions check the role again and write the platform audit log themselves.
//   Platform Owner (super_admin): gateway status, primary gateway, verified outages, webhook re-processing, GST particulars
//   Finance admin + Platform Owner: refund requests and decisions (never your own), reconciliation, exceptions
//   Auditor: read-only overview
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authenticatePlatformAdmin, logPlatformAction } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/server'
import { PAYMENT_OPERATORS, PAYMENT_STAFF, paymentsOverview } from '@/lib/payments/admin'
import { envResolver, type Db } from '@/lib/payments/registry'
import { checkHealth, executeRefund, processEvent, reconcile } from '@/lib/payments/service'

const provider = z.enum(['razorpay', 'cashfree'])
const environment = z.enum(['test', 'live'])
const note = z.string().trim().min(5).max(500)
const Action = z.discriminatedUnion('action', [
  z.object({ action: z.literal('gateway_status'), provider, environment, status: z.enum(['disabled', 'sandbox_validated', 'enabled', 'draining', 'suspended']), note }),
  z.object({ action: z.literal('set_primary'), provider, environment, note }),
  z.object({ action: z.literal('refund_request'), paymentId: z.string().uuid().optional(), unappliedId: z.string().uuid().optional(), amountPaise: z.number().int().positive(), reason: note }),
  z.object({ action: z.literal('refund_decide'), refundId: z.string().uuid(), decision: z.enum(['approved', 'rejected']), note: z.string().trim().max(500).optional() }),
  z.object({ action: z.literal('refund_execute'), refundId: z.string().uuid() }),
  z.object({ action: z.literal('outage_record'), provider, environment, startedAt: z.string().datetime(), endedAt: z.string().datetime(), evidence: z.string().trim().min(10).max(1000) }),
  z.object({ action: z.literal('reconcile'), provider, days: z.number().int().min(1).max(31).default(3) }),
  z.object({ action: z.literal('resolve_item'), itemId: z.string().uuid(), note }),
  z.object({ action: z.literal('webhook_reprocess'), eventId: z.string().uuid() }),
  z.object({ action: z.literal('health_check') }),
  // Supplier GST particulars, from the accountant. Empty strings clear a value; nothing is assumed.
  z.object({
    action: z.literal('update_gst'),
    legalName: z.string().trim().max(200),
    gstin: z.string().trim().toUpperCase().regex(/^$|^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, 'A GSTIN has 15 characters: state code, PAN, entity number, Z, check character'),
    stateCode: z.string().trim().regex(/^$|^[0-9]{2}$/, 'The state code has 2 digits'),
    sacCode: z.string().trim().regex(/^$|^99[0-9]{4}$/, 'A SAC code for services has 6 digits starting with 99'),
  }),
])

const OWNER_ONLY = new Set(['gateway_status', 'set_primary', 'outage_record', 'webhook_reprocess', 'update_gst'])
const friendly = (m: string) => m.replace(/^.*?(billing|payments): /, '').replace(/^./, (c) => c.toUpperCase())

export async function GET() {
  const auth = await authenticatePlatformAdmin([...PAYMENT_STAFF], true)
  if (!auth.success) return auth.response
  return NextResponse.json(await paymentsOverview(createServiceClient() as unknown as Db, envResolver().environment))
}

export async function POST(request: NextRequest) {
  const parsed = Action.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request', issues: parsed.error.issues.map((i) => i.message) }, { status: 400 })
  const a = parsed.data
  const auth = await authenticatePlatformAdmin(OWNER_ONLY.has(a.action) ? ['super_admin'] : [...PAYMENT_OPERATORS], true)
  if (!auth.success) return auth.response
  const actor = auth.auth.user.id, role = auth.auth.platformUser.role
  const db = createServiceClient() as unknown as Db
  const resolver = envResolver()
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await db.rpc(fn, args)
    if (error) throw Object.assign(new Error(friendly(error.message)), { status: /permitted|requester/.test(error.message) ? 403 : 409 })
    return data
  }
  try {
    switch (a.action) {
      case 'gateway_status':
        return NextResponse.json(await rpc('payment_gateway_set_status', { p_actor: actor, p_provider: a.provider, p_env: a.environment, p_status: a.status, p_note: a.note }))
      case 'set_primary':
        return NextResponse.json(await rpc('payment_gateway_set_primary', { p_actor: actor, p_provider: a.provider, p_env: a.environment, p_note: a.note }))
      case 'refund_request': {
        const id = await rpc('payment_refund_request', { p_actor: actor, p_payment: a.paymentId ?? null, p_unapplied: a.unappliedId ?? null, p_amount: a.amountPaise, p_reason: a.reason })
        return NextResponse.json({ id })
      }
      case 'refund_decide': {
        const r = (await rpc('payment_refund_decide', { p_actor: actor, p_refund: a.refundId, p_decision: a.decision, p_note: a.note ?? null })) as { status: string }
        // Fully approved: send it to the provider that took the payment straight away.
        if (r.status === 'approved') {
          const ex = await executeRefund(db, resolver, a.refundId)
          return NextResponse.json({ status: ex.success ? ex.data.status : 'approved', warning: ex.success ? undefined : ex.error })
        }
        return NextResponse.json(r)
      }
      case 'refund_execute': {
        const ex = await executeRefund(db, resolver, a.refundId)
        await logPlatformAction({ actorUserId: actor, actorRole: role, action: 'payments.refund_executed', targetEntityType: 'payment_refunds', targetEntityId: a.refundId, metadata: { result: ex.success ? ex.data.status : ex.error } })
        return ex.success ? NextResponse.json(ex.data) : NextResponse.json({ error: ex.error }, { status: ex.status })
      }
      case 'outage_record':
        return NextResponse.json(await rpc('payment_outage_record', { p_actor: actor, p_provider: a.provider, p_env: a.environment, p_started: a.startedAt, p_ended: a.endedAt, p_evidence: a.evidence }))
      case 'reconcile': {
        const adapter = resolver.get(a.provider)
        if (!adapter) return NextResponse.json({ error: `${a.provider} is not configured in this environment.` }, { status: 503 })
        const to = new Date(), from = new Date(to.getTime() - a.days * 86_400_000)
        const r = await reconcile(db, adapter, from, to, actor)
        await logPlatformAction({ actorUserId: actor, actorRole: role, action: 'payments.reconciliation_run', targetEntityType: 'payment_reconciliation_runs', targetEntityId: r.success ? r.data.runId : actor, metadata: { provider: a.provider, days: a.days, result: r.success ? r.data : r.error } })
        return r.success ? NextResponse.json(r.data) : NextResponse.json({ error: r.error }, { status: r.status })
      }
      case 'resolve_item': {
        const { error } = await db.from('payment_reconciliation_items').update({ status: 'resolved', resolution_note: a.note, resolved_by: actor, resolved_at: new Date().toISOString() }).eq('id', a.itemId).eq('status', 'open')
        if (error) return NextResponse.json({ error: 'Could not resolve the item.' }, { status: 500 })
        await logPlatformAction({ actorUserId: actor, actorRole: role, action: 'payments.reconciliation_resolved', targetEntityType: 'payment_reconciliation_items', targetEntityId: a.itemId, metadata: { note: a.note } })
        return NextResponse.json({ status: 'resolved' })
      }
      case 'webhook_reprocess': {
        const { data: ev } = await db.from('payment_webhook_events').select('id, provider, environment, payload, signature_valid, outcome').eq('id', a.eventId).maybeSingle()
        if (!ev || !ev.signature_valid || !ev.payload) return NextResponse.json({ error: 'Only stored, signed events can be re-processed.' }, { status: 409 })
        if (ev.outcome === 'processed') return NextResponse.json({ error: 'This event was already processed.' }, { status: 409 })
        const adapter = resolver.get(ev.provider, ev.environment)
        if (!adapter) return NextResponse.json({ error: `${ev.provider} is not configured.` }, { status: 503 })
        const parsed = adapter.parseWebhook(JSON.stringify(ev.payload), new Headers())
        const out = await processEvent(db, adapter, parsed.event)
        await db.rpc('payment_webhook_outcome', { p_event: ev.id, p_outcome: out.outcome, p_detail: out.detail })
        await logPlatformAction({ actorUserId: actor, actorRole: role, action: 'payments.webhook_reprocessed', targetEntityType: 'payment_webhook_events', targetEntityId: ev.id, metadata: out })
        return NextResponse.json(out)
      }
      case 'health_check':
        return NextResponse.json({ results: await checkHealth(db, resolver) })
      case 'update_gst':
        return NextResponse.json(await rpc('billing_settings_update_gst', { p_actor: actor, p_legal_name: a.legalName, p_gstin: a.gstin, p_state: a.stateCode, p_sac: a.sacCode }))
    }
  } catch (e) {
    const err = e as Error & { status?: number }
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 })
  }
}
