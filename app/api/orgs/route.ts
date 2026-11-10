// app/api/orgs/route.ts
// Creates a new organisation and assigns the creator as owner.
// Uses service role to bypass RLS (the user has no org yet, so RLS would block insert).
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/server'
import { slugify } from '@/lib/utils/slugify'
import { z } from 'zod'

const CreateOrgSchema = z.object({
  name: z.string().min(2).max(100),
  slug: z.string().min(2).max(60).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers and hyphens'),
  type: z.enum(['developer', 'channel_partner']),
})

export async function POST(request: NextRequest) {
  try {
    // Authenticate the requesting user
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = CreateOrgSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { name, type } = parsed.data
    const baseSlug = slugify(name)

    // Use service role for the actual inserts (user has no org claims yet)
    const service = createServiceClient()

    // Check slug uniqueness — append random suffix on collision
    let slug = baseSlug
    const { data: existing } = await service
      .from('organisations')
      .select('id')
      .eq('slug', slug)
      .single()

    if (existing) {
      const suffix = Math.random().toString(36).slice(2, 6)
      slug = `${baseSlug}-${suffix}`
    }

    // Create the organisation
    const { data: org, error: orgError } = await service
      .from('organisations')
      .insert({ name, slug, type })
      .select()
      .single()

    if (orgError || !org) {
      return NextResponse.json({ error: 'Failed to create organisation' }, { status: 500 })
    }

    // Find or confirm the user's profile (created by DB trigger)
    const { data: profile } = await service
      .from('profiles')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 500 })
    }

    // Create owner membership
    const { error: memberError } = await service.from('org_members').insert({
      org_id: org.id,
      profile_id: profile.id,
      role: 'owner',
    })

    if (memberError) {
      return NextResponse.json({ error: 'Failed to create membership' }, { status: 500 })
    }

    return NextResponse.json({ org }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
