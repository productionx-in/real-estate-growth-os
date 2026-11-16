// app/api/leads/route.ts
// Secure Lead creation: Enforces authentication, tenant isolation, project scoping, and RBAC.
import { NextResponse, type NextRequest } from 'next/server'
import { LeadSchema } from '@/lib/validations/lead'
import { createLead } from '@/lib/dal/leads'
import { authenticateCaller } from '@/lib/auth/tenant'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const authResult = await authenticateCaller()
    if (!authResult.success) {
      return authResult.response
    }

    const { auth } = authResult
    const service = createServiceClient()

    const body = await request.json()
    const parsed = LeadSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    // Resolve target organisation
    const url = new URL(request.url)
    let requestedOrgId = (
      body.orgId ||
      body.org_id ||
      url.searchParams.get('orgId') ||
      url.searchParams.get('org_id')
    ) as string | undefined

    // Fallback 1: resolve by orgSlug from body or search parameters
    const requestedOrgSlug = (
      body.orgSlug ||
      body.org_slug ||
      url.searchParams.get('orgSlug') ||
      url.searchParams.get('org_slug')
    ) as string | undefined
    if (!requestedOrgId && requestedOrgSlug) {
      const { data: org } = await service
        .from('organisations')
        .select('id')
        .eq('slug', requestedOrgSlug)
        .maybeSingle()
      if (org) requestedOrgId = org.id
    }

    // Fallback 2: resolve by referer header (e.g. user submitting from /[orgSlug]/leads/new)
    if (!requestedOrgId) {
      const referer = request.headers.get('referer')
      if (referer) {
        try {
          const refPath = new URL(referer).pathname
          const match = refPath.match(/^\/([^/]+)\/leads/)
          if (match && match[1] && match[1] !== 'leads' && match[1] !== 'api') {
            const { data: org } = await service
              .from('organisations')
              .select('id')
              .eq('slug', match[1])
              .maybeSingle()
            if (org) requestedOrgId = org.id
          }
        } catch {
          // ignore invalid referer URL
        }
      }
    }

    let targetOrgId: string

    if (requestedOrgId) {
      const { data: membership } = await service
        .from('org_members')
        .select('role')
        .eq('status', 'active')
        .eq('org_id', requestedOrgId)
        .eq('profile_id', auth.profile.id)
        .maybeSingle()

      if (!membership || membership.role === 'readonly') {
        return NextResponse.json(
          { error: 'Insufficient permissions for the specified organisation' },
          { status: 403 }
        )
      }
      targetOrgId = requestedOrgId
    } else {
      const { data: memberships } = await service
        .from('org_members')
        .select('org_id, role')
        .eq('status', 'active')
        .eq('profile_id', auth.profile.id)

      if (!memberships || memberships.length === 0) {
        return NextResponse.json({ error: 'No organisation found' }, { status: 403 })
      }

      const activeMemberships = memberships.filter((m) => m.role !== 'readonly')

      if (activeMemberships.length === 0) {
        return NextResponse.json(
          { error: 'Insufficient permissions: readonly members cannot create leads' },
          { status: 403 }
        )
      }

      if (activeMemberships.length > 1) {
        return NextResponse.json(
          { error: 'User belongs to multiple organisations. Please specify orgId in the request.' },
          { status: 400 }
        )
      }

      targetOrgId = activeMemberships[0].org_id
    }

    // Cross-tenant scope verification: If project_id provided, verify it belongs to this org
    if (parsed.data.project_id) {
      const { data: project } = await service
        .from('projects')
        .select('id, org_id')
        .eq('id', parsed.data.project_id)
        .maybeSingle()

      if (!project || project.org_id !== targetOrgId) {
        return NextResponse.json(
          { error: 'Project does not exist in the target organisation' },
          { status: 400 }
        )
      }
    }

    const { lead, error } = await createLead(targetOrgId, parsed.data, auth.profile.id)

    if (error || !lead) {
      return NextResponse.json({ error: error ?? 'Failed to create lead' }, { status: 500 })
    }

    return NextResponse.json({ lead }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
