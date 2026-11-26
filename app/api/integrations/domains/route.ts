// app/api/integrations/domains/route.ts — a workspace's website and e-mail domains (20260103). GET lists them with the
// DNS records to add; POST adds one. Owners, admins and managers (as for the rest of Integrations).
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { requireModule } from '@/lib/auth/entitlements'
import { auditMember } from '@/lib/dal/org-audit'
import { addDomain, listDomains } from '@/lib/dal/domains'
import { cleanDomain } from '@/lib/integrations/dns-verify'

const MANAGERS = ['owner', 'admin', 'manager'] as const
const Body = z.object({ orgId: z.string().uuid(), purpose: z.enum(['website', 'email']), domain: z.string().min(3).max(260), sendAs: z.string().max(64).optional() })

export async function GET(request: NextRequest) {
  const orgId = request.nextUrl.searchParams.get('orgId') ?? ''
  if (!/^[0-9a-f-]{36}$/i.test(orgId)) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const access = await authorizeOrgAccess(orgId, [...MANAGERS])
  if (!access.success) return access.response
  { const gate = await requireModule(orgId, 'integrations'); if (gate) return gate }
  return NextResponse.json({ domains: await listDomains(orgId) })
}

export async function POST(request: NextRequest) {
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const { orgId, purpose } = parsed.data
  const access = await authorizeOrgAccess(orgId, [...MANAGERS])
  if (!access.success) return access.response
  { const gate = await requireModule(orgId, 'integrations'); if (gate) return gate }
  const domain = cleanDomain(parsed.data.domain)
  if (!domain) return NextResponse.json({ error: 'Enter your domain, like “yourcompany.com”.' }, { status: 400 })
  let sendAs: string | null = null
  if (purpose === 'email') {
    sendAs = (parsed.data.sendAs ?? 'hello').trim().toLowerCase()
    if (!/^[a-z0-9]([a-z0-9._-]{0,62}[a-z0-9])?$/.test(sendAs)) return NextResponse.json({ error: 'The address before the @ can use letters, numbers, dots and dashes.' }, { status: 400 })
  }
  const r = await addDomain(orgId, purpose, domain, sendAs, access.context.profile.id)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
  await auditMember(request, access.context, orgId, 'integration.domain_added', { type: 'domain', id: r.domain.id }, { purpose, domain, sendAs })
  return NextResponse.json({ ok: true, domain: r.domain }, { status: 201 })
}
