// app/api/integrations/website/route.ts
// The website connection behind the capture script and the hosted enquiry form: read its status, or save
// its allowed domains and switch it on/off. Owners, admins and managers; integrations module on; audited.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { requireModule } from '@/lib/auth/entitlements'
import { auditMember } from '@/lib/dal/org-audit'
import { getWebsiteStatus, saveWebsiteSettings } from '@/lib/dal/website-capture'
import { MAX_DOMAINS, parseDomainList } from '@/lib/integrations/website/domains'

const MANAGERS = ['owner', 'admin', 'manager'] as const

const SaveSchema = z.object({
  orgId: z.string().uuid(),
  domains: z.array(z.string().max(300)).max(100),
  enabled: z.boolean(),
})

export async function GET(request: NextRequest) {
  const orgId = z.string().uuid().safeParse(new URL(request.url).searchParams.get('orgId'))
  if (!orgId.success) return NextResponse.json({ error: 'orgId is required' }, { status: 400 })
  const access = await authorizeOrgAccess(orgId.data, [...MANAGERS])
  if (!access.success) return access.response
  { const gate = await requireModule(orgId.data, 'integrations'); if (gate) return gate }
  return NextResponse.json({ website: await getWebsiteStatus(orgId.data) })
}

export async function POST(request: NextRequest) {
  const parsed = SaveSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid website settings' }, { status: 400 })
  const { orgId, enabled } = parsed.data

  const access = await authorizeOrgAccess(orgId, [...MANAGERS])
  if (!access.success) return access.response
  { const gate = await requireModule(orgId, 'integrations'); if (gate) return gate }

  const { domains, invalid } = parseDomainList(parsed.data.domains)
  if (invalid.length) {
    return NextResponse.json({ error: `Not a website domain: ${invalid.slice(0, 3).join(', ')}. Use a form like example.com or *.example.com.` }, { status: 400 })
  }
  if (domains.length > MAX_DOMAINS) {
    return NextResponse.json({ error: `List up to ${MAX_DOMAINS} domains.` }, { status: 400 })
  }

  const result = await saveWebsiteSettings(orgId, access.context.profile.id, { domains, enabled })
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status })
  await auditMember(request, access.context, orgId, 'integration.website_updated',
    { type: 'integration', id: result.data.connectionId }, { domains, enabled })
  return NextResponse.json({ website: result.data })
}
