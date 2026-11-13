// app/api/inventory/route.ts
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { InventoryItemSchema } from '@/lib/validations/inventory'
import { createInventoryItem, getInventoryByProject } from '@/lib/dal/inventory'
import type { InventoryStatus, ProjectCategory } from '@/types/database'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }

    const filters = {
      status: (searchParams.get('status') as InventoryStatus) || undefined,
      category: (searchParams.get('category') as ProjectCategory) || undefined,
      bhk: searchParams.get('bhk') || undefined,
      search: searchParams.get('search') || undefined,
      tower: searchParams.get('tower') || undefined,
    }

    const items = await getInventoryByProject(projectId, filters)
    return NextResponse.json({ items })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // 1. Auth check
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    // 2. Validate body
    const body = await request.json()
    const parsed = InventoryItemSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    // 3. User profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()

    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 403 })

    // 4. Verify project ownership & manager permissions
    const { data: project } = await supabase
      .from('projects')
      .select('id, org_id')
      .eq('id', parsed.data.project_id)
      .single()

    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    const { data: membership } = await supabase
      .from('org_members')
      .select('role')
      .eq('org_id', project.org_id)
      .eq('profile_id', profile.id)
      .single()

    if (!membership || !['owner', 'admin', 'manager'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'Only managers, admins, and owners can add inventory' },
        { status: 403 }
      )
    }

    const { item, error } = await createInventoryItem(
      project.org_id,
      parsed.data
    )

    if (error || !item) {
      return NextResponse.json({ error: error ?? 'Failed to create inventory' }, { status: 500 })
    }

    return NextResponse.json({ item }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
