// app/api/push/subscription/route.ts
// GET: VAPID public key + whether this device is subscribed. PUT: save this device's push subscription for the
// signed-in user. DELETE: remove it. The profile id always comes from the session, never from the request.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authenticateCaller } from '@/lib/auth/tenant'
import { createServiceClient } from '@/lib/supabase/server'
import { vapidPublicKey } from '@/lib/notifications/push'

const SubscriptionSchema = z.object({
  endpoint: z.string().url().startsWith('https://').max(2048),
  keys: z.object({ p256dh: z.string().min(1).max(256), auth: z.string().min(1).max(64) }),
})

export async function GET(request: NextRequest) {
  const auth = await authenticateCaller()
  if (!auth.success) return auth.response
  const endpoint = request.nextUrl.searchParams.get('endpoint')
  let subscribed = false
  if (endpoint) {
    const { data } = await createServiceClient().from('push_subscriptions').select('id')
      .eq('endpoint', endpoint).eq('profile_id', auth.auth.profile.id).maybeSingle()
    subscribed = !!data
  }
  return NextResponse.json({ data: { publicKey: vapidPublicKey(), subscribed } })
}

export async function PUT(request: NextRequest) {
  const auth = await authenticateCaller()
  if (!auth.success) return auth.response
  if (!vapidPublicKey()) return NextResponse.json({ error: 'Phone alerts are not configured' }, { status: 503 })
  const parsed = SubscriptionSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 })
  const { endpoint, keys } = parsed.data
  const { error } = await createServiceClient().from('push_subscriptions').upsert({
    profile_id: auth.auth.profile.id, endpoint, p256dh: keys.p256dh, auth: keys.auth,
    user_agent: request.headers.get('user-agent')?.slice(0, 300) ?? null, failure_count: 0,
  }, { onConflict: 'endpoint' })
  if (error) {
    console.error('[push] save subscription failed:', error)
    return NextResponse.json({ error: 'Could not save subscription' }, { status: 500 })
  }
  return NextResponse.json({ data: { subscribed: true } })
}

export async function DELETE(request: NextRequest) {
  const auth = await authenticateCaller()
  if (!auth.success) return auth.response
  const parsed = z.object({ endpoint: z.string().max(2048) }).safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  await createServiceClient().from('push_subscriptions').delete()
    .eq('endpoint', parsed.data.endpoint).eq('profile_id', auth.auth.profile.id)
  return NextResponse.json({ data: { subscribed: false } })
}
