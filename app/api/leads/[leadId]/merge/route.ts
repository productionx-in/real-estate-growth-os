// app/api/leads/[leadId]/merge/route.ts — merge a duplicate into this lead (the main record). Owners, admins and
// managers only. Both leads must be in the caller's organisation; nothing is deleted (merge_leads, migration
// 20260057): the duplicate is kept as a link, its history moves here, and the merge is in the audit log.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeLeadAccess } from '@/lib/auth/tenant'
import { MANAGEMENT_ROLES } from '@/lib/auth/permissions'
import { createServiceClient } from '@/lib/supabase/server'

type Ctx = { params: Promise<{ leadId: string }> }
const Body = z.object({ sourceLeadId: z.string().uuid() })

export async function POST(request: NextRequest, { params }: Ctx) {
  const { leadId } = await params
  if (!z.string().uuid().safeParse(leadId).success) return NextResponse.json({ error: 'Invalid lead' }, { status: 400 })
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Pick the duplicate to merge.' }, { status: 400 })
  if (parsed.data.sourceLeadId === leadId) return NextResponse.json({ error: 'Pick a different lead.' }, { status: 400 })

  const auth = await authorizeLeadAccess(leadId, [...MANAGEMENT_ROLES])
  if (!auth.success) return auth.response
  const { context } = auth
  const db = createServiceClient()
  // The duplicate must belong to the same organisation (a lead elsewhere is simply "not found").
  const { data: source } = await db.from('leads').select('id').eq('id', parsed.data.sourceLeadId).eq('org_id', context.orgId).maybeSingle()
  if (!source) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

  const { data, error } = await db.rpc('merge_leads', { p_org: context.orgId, p_target: leadId, p_source: source.id, p_actor_profile: context.profile.id })
  if (error) {
    const m = error.message.match(/merge: (.+)$/)
    return NextResponse.json({ error: m ? m[1].charAt(0).toUpperCase() + m[1].slice(1) + '.' : 'Could not merge the leads.' }, { status: m ? 409 : 500 })
  }
  return NextResponse.json(data)
}
