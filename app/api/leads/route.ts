// app/api/leads/route.ts
// POST: create a new lead
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { LeadSchema } from '@/lib/validations/lead'
import { createLead } from '@/lib/dal/leads'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const body = await request.json()
    const parsed = LeadSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
    }

    // Resolve caller profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()

    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 403 })

    // Resolve org from JWT claims (single-org per user)
    const { data: membership } = await supabase
      .from('org_members')
      .select('org_id, role')
      .eq('profile_id', profile.id)
      .single()

    if (!membership) return NextResponse.json({ error: 'No organisation found' }, { status: 403 })

    // Only non-readonly can create
    if (membership.role === 'readonly') {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const { lead, error } = await createLead(membership.org_id, parsed.data, profile.id)

    if (error || !lead) {
      return NextResponse.json({ error: error ?? 'Failed to create lead' }, { status: 500 })
    }

    return NextResponse.json({ lead }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
