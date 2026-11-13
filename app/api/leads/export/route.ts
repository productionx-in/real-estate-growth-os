// app/api/leads/export/route.ts
// Streams a formatted CSV export of leads.
// Access-controlled: owner, admin, manager, and sales_exec (RLS isolates sales_exec to assigned leads).
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Papa from 'papaparse'
import type { LeadStatus, LeadSource } from '@/types/database'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const orgSlug = searchParams.get('orgSlug')
    const status = searchParams.get('status')
    const source = searchParams.get('source')

    if (!orgSlug) {
      return NextResponse.json({ error: 'orgSlug query param is required' }, { status: 400 })
    }

    const supabase = await createClient()

    // 1. Auth check
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    // 2. Resolve org
    const { data: org } = await supabase
      .from('organisations')
      .select('id, name, slug')
      .eq('slug', orgSlug)
      .single()

    if (!org) {
      return NextResponse.json({ error: 'Organisation not found' }, { status: 404 })
    }

    // 3. Resolve user profile & role
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()

    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 403 })

    const { data: membership } = await supabase
      .from('org_members')
      .select('role')
      .eq('org_id', org.id)
      .eq('profile_id', profile.id)
      .single()

    if (!membership || membership.role === 'readonly') {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // 4. Query leads — RLS automatically restricts sales_exec to assigned leads
    let query = supabase
      .from('leads')
      .select(`
        id, name, phone, email, status, priority, source,
        budget_min, budget_max, notes, created_at,
        project:projects(name),
        assignee:profiles!leads_assigned_to_fkey(full_name)
      `)
      .eq('org_id', org.id)
      .order('created_at', { ascending: false })

    if (status) query = query.eq('status', status as LeadStatus)
    if (source) query = query.eq('source', source as LeadSource)

    const { data: leads, error: fetchError } = await query

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    // 5. Transform records for CSV export
    const exportRows = (leads ?? []).map((lead) => {
      const project = lead.project as { name: string } | null
      const assignee = lead.assignee as { full_name: string } | null

      return {
        Name: lead.name,
        Phone: lead.phone,
        Email: lead.email ?? '',
        Status: lead.status,
        Priority: lead.priority,
        Source: lead.source,
        Project: project?.name ?? '',
        'Assigned To': assignee?.full_name ?? 'Unassigned',
        'Budget Min': lead.budget_min ?? '',
        'Budget Max': lead.budget_max ?? '',
        Notes: lead.notes ?? '',
        'Created Date': lead.created_at ? new Date(lead.created_at).toISOString().split('T')[0] : '',
      }
    })

    const csvString = Papa.unparse(exportRows)
    const filename = `leads_${orgSlug}_${new Date().toISOString().split('T')[0]}.csv`

    return new NextResponse(csvString, {
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
