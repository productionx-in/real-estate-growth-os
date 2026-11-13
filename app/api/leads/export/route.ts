// app/api/leads/export/route.ts
// Streams a formatted CSV export of leads.
// Access-controlled: owner, admin, manager can export all leads; sales_exec can only export assigned leads.
import { NextResponse, type NextRequest } from 'next/server'
import Papa from 'papaparse'
import { authenticateCaller } from '@/lib/auth/tenant'
import { createServiceClient } from '@/lib/supabase/server'
import type { LeadStatus, LeadSource, MemberRole } from '@/types/database'

interface LeadExportRecord {
  id: string
  name: string
  phone: string
  email: string | null
  status: string
  priority: string
  source: string
  project: { name: string } | null
  assignee: { full_name: string } | null
  budget_min: number | null
  budget_max: number | null
  notes: string | null
  created_at: string
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const orgSlug = searchParams.get('orgSlug')
    const status = searchParams.get('status')
    const source = searchParams.get('source')

    if (!orgSlug) {
      return NextResponse.json({ error: 'orgSlug query param is required' }, { status: 400 })
    }

    // 1. Auth check
    const authResult = await authenticateCaller()
    if (!authResult.success) {
      return authResult.response
    }

    const { auth } = authResult
    const service = createServiceClient()

    // 2. Resolve org
    const { data: org } = await service
      .from('organisations')
      .select('id, name, slug')
      .eq('slug', orgSlug)
      .maybeSingle()

    if (!org) {
      return NextResponse.json({ error: 'Organisation not found' }, { status: 404 })
    }

    // 3. Resolve user profile & role in this org
    const { data: membership } = await service
      .from('org_members')
      .select('role')
      .eq('org_id', org.id)
      .eq('profile_id', auth.profile.id)
      .maybeSingle()

    if (!membership || membership.role === 'readonly') {
      return NextResponse.json(
        { error: 'Forbidden. Insufficient permissions to export leads.' },
        { status: 403 }
      )
    }

    const role = membership.role as MemberRole

    // 4. Query leads — sales_exec is strictly constrained to assigned leads
    let query = service
      .from('leads')
      .select(`
        id, name, phone, email, status, priority, source,
        budget_min, budget_max, notes, created_at,
        project:projects(name),
        assignee:profiles!leads_assigned_to_fkey(full_name)
      `)
      .eq('org_id', org.id)
      .order('created_at', { ascending: false })

    if (role === 'sales_exec') {
      query = query.eq('assigned_to', auth.profile.id)
    }

    if (status) query = query.eq('status', status as LeadStatus)
    if (source) query = query.eq('source', source as LeadSource)

    const { data: leads, error: fetchError } = await query

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    const rows = ((leads ?? []) as unknown as LeadExportRecord[]).map((lead) => ({
      'Lead ID': lead.id,
      Name: lead.name,
      Phone: lead.phone,
      Email: lead.email ?? '',
      Status: lead.status,
      Priority: lead.priority,
      Source: lead.source,
      Project: lead.project?.name ?? '',
      'Assigned To': lead.assignee?.full_name ?? 'Unassigned',
      'Min Budget': lead.budget_min ?? '',
      'Max Budget': lead.budget_max ?? '',
      Notes: lead.notes ?? '',
      'Created At': lead.created_at,
    }))

    const csv = Papa.unparse(rows)
    const filename = `${orgSlug}-leads-${new Date().toISOString().split('T')[0]}.csv`

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
