// app/api/projects/route.ts
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ProjectSchema } from '@/lib/validations/project'
import { createProject } from '@/lib/dal/projects'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const body = await request.json()
    const parsed = ProjectSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
    }

    const { data: profile } = await supabase
      .from('profiles').select('id').eq('auth_user_id', user.id).single()
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 403 })

    const { data: membership } = await supabase
      .from('org_members').select('org_id, role').eq('profile_id', profile.id).single()
    if (!membership) return NextResponse.json({ error: 'No organisation found' }, { status: 403 })

    if (!['owner', 'admin', 'manager'].includes(membership.role)) {
      return NextResponse.json({ error: 'Managers or above can create projects' }, { status: 403 })
    }

    const { project, error } = await createProject(membership.org_id, parsed.data)
    if (error || !project) return NextResponse.json({ error: error ?? 'Failed' }, { status: 500 })

    return NextResponse.json({ project }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
