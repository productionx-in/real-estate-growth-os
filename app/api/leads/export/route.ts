// app/api/leads/export/route.ts
// Streams a formatted CSV export of leads.
// Access-controlled: owner, admin, manager can export all leads; sales_exec can only export assigned leads.
import { getWorkspaceSettings } from '@/lib/dal/workspace-settings'
import { displayValue } from '@/lib/settings/fields'
import { CSV_FORMULA } from '@/lib/utils/csv'
import { NextResponse, type NextRequest } from 'next/server'
import Papa from 'papaparse'
import { authenticateCaller } from '@/lib/auth/tenant'
import { createServiceClient } from '@/lib/supabase/server'
import type { MemberRole } from '@/types/database'
import { applyLeadFilters, parseLeadSearch } from '@/lib/leads/view-filters'
import { auditMember } from '@/lib/dal/org-audit'
import { resolveLeadViewer } from '@/lib/dal/viewer'
import { leadScopeOf } from '@/lib/auth/permissions'

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
    // The same filters as the leads page, so the file matches what the user is looking at.
    const { filters } = parseLeadSearch(Object.fromEntries(searchParams.entries()))

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
      .eq('status', 'active')
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
        budget_min, budget_max, notes, created_at, closed_reason, field_values,
        project:projects(name),
        assignee:profiles!leads_assigned_to_fkey(full_name)
      `)
      .eq('org_id', org.id)
      .order('created_at', { ascending: false })

    // A sales executive is always limited to their own leads, whatever the filters say.
    query = applyLeadFilters(query, filters, await resolveLeadViewer(org.id, role, auth.profile.id), new Date())

    const { data: leads, error: fetchError } = await query

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    // The workspace's own fields (Settings → Fields on leads) become extra columns, removed ones included.
    const fieldDefs = (await getWorkspaceSettings(org.id)).fields.lead
    const BASE = ['Lead ID', 'Name', 'Phone', 'Email', 'Status', 'Priority', 'Source', 'Project', 'Assigned To', 'Min Budget', 'Max Budget', 'Notes', 'Closed Reason', 'Created At']
    const columnFor = (label: string) => (BASE.some((b) => b.toLowerCase() === label.toLowerCase()) ? `${label} (field)` : label)
    const rows = ((leads ?? []) as unknown as (LeadExportRecord & { closed_reason?: string | null; field_values?: Record<string, unknown> | null })[]).map((lead) => ({
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
      'Closed Reason': lead.closed_reason ?? '',
      'Created At': lead.created_at,
      ...Object.fromEntries(fieldDefs.map((f) => [columnFor(f.label), displayValue(f, lead.field_values?.[f.key])])),
    }))

    // Exports take customer contact data out of REGrow, so every one is recorded.
    await auditMember(request, auth, org.id, 'lead.exported', { type: 'lead_export' }, {
      rows: rows.length,
      filters,
      scope: leadScopeOf(role) === 'all' ? 'organisation' : leadScopeOf(role),
    })

    // A cell that would start a spreadsheet formula (=, @, or + / - not followed by a plain number such as a phone)
    // is prefixed with ' so it is never run: names and custom fields come from forms and webhooks.
    const csv = Papa.unparse(rows, { escapeFormulae: CSV_FORMULA })
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
