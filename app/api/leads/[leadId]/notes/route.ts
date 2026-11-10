// app/api/leads/[leadId]/notes/route.ts
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { addLeadNote } from '@/lib/dal/leads'

const NoteSchema = z.object({
  note: z.string().min(1).max(2000),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  try {
    const { leadId } = await params
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const body = await request.json()
    const parsed = NoteSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Note is required' }, { status: 400 })

    // Fetch lead to verify org
    const { data: lead } = await supabase
      .from('leads')
      .select('org_id')
      .eq('id', leadId)
      .single()

    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

    // Caller profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()

    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 403 })

    const { data: membership } = await supabase
      .from('org_members')
      .select('role')
      .eq('org_id', lead.org_id)
      .eq('profile_id', profile.id)
      .single()

    if (!membership || membership.role === 'readonly') {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const { error } = await addLeadNote(leadId, parsed.data.note, profile.id)
    if (error) return NextResponse.json({ error }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
