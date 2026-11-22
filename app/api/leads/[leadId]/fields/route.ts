// app/api/leads/[leadId]/fields/route.ts — save a lead's values for the workspace's own fields (Settings → Fields on
// leads). Whoever may work the lead (authorizeLeadWork); values checked against the workspace's definitions.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeLeadWork } from '@/lib/follow-ups/auth'
import { getWorkspaceSettings } from '@/lib/dal/workspace-settings'
import { saveLeadFieldValues } from '@/lib/dal/lead-fields'
import { checkValues } from '@/lib/settings/fields'

const Schema = z.object({ values: z.record(z.string().max(40), z.union([z.string().max(400), z.number(), z.boolean(), z.null()])) })

export async function PUT(request: NextRequest, { params }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await params
  const parsed = Schema.safeParse(await request.json().catch(() => null))
  if (!z.string().uuid().safeParse(leadId).success || !parsed.success) return NextResponse.json({ error: 'Invalid details' }, { status: 400 })
  const auth = await authorizeLeadWork(leadId)
  if (!auth.success) return auth.response
  const defs = (await getWorkspaceSettings(auth.work.orgId)).fields.lead
  const { patch, errors } = checkValues(defs, parsed.data.values)
  if (Object.keys(errors).length) return NextResponse.json({ error: Object.values(errors)[0], fields: errors }, { status: 400 })
  const labels = Object.fromEntries(defs.map((f) => [f.key, f.label]))
  const result = await saveLeadFieldValues(auth.work.orgId, leadId, auth.work.actorId, patch, labels)
  if (!result.ok) return NextResponse.json({ error: 'Could not save the details.' }, { status: 500 })
  return NextResponse.json({ ok: true, changed: result.changed.length })
}
