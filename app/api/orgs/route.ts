// app/api/orgs/route.ts
// Creates a new organisation, assigns the creator as owner, and seeds optional starter data.
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/server'
import { slugify } from '@/lib/utils/slugify'
import { seedWorkspaceDemoData } from '@/lib/demo/seed'
import { z } from 'zod'

const CreateOrgSchema = z.object({
  name: z.string().min(2).max(100),
  slug: z.string().min(2).max(60).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers and hyphens').optional(),
  type: z.enum(['developer', 'channel_partner']),
  city: z.string().optional(),
  seedDemoData: z.boolean().optional().default(true),
})

export async function POST(request: NextRequest) {
  try {
    // Authenticate the requesting user
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised. Please log in first.' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = CreateOrgSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { name, type, seedDemoData } = parsed.data
    const baseSlug = parsed.data.slug || slugify(name)

    // Use service role for workspace bootstrap
    const service = createServiceClient()

    // Check slug uniqueness — append random suffix on collision
    let slug = baseSlug
    const { data: existing } = await service
      .from('organisations')
      .select('id')
      .eq('slug', slug)
      .maybeSingle()

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
      console.error('Error creating organisation:', orgError)
      return NextResponse.json({ error: orgError?.message ?? 'Failed to create organisation' }, { status: 500 })
    }

    // Ensure user profile exists
    let { data: profile } = await service
      .from('profiles')
      .select('id')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (!profile) {
      const fullName =
        (user.user_metadata?.full_name as string) ||
        user.email?.split('@')[0] ||
        'Workspace Owner'

      const { data: newProfile, error: profileErr } = await service
        .from('profiles')
        .insert({
          auth_user_id: user.id,
          full_name: fullName,
        })
        .select('id')
        .single()

      if (profileErr) {
        console.error('Error creating profile:', profileErr)
      }
      profile = newProfile
    }

    // Create owner membership
    if (profile) {
      const { error: memberError } = await service.from('org_members').insert({
        org_id: org.id,
        profile_id: profile.id,
        role: 'owner',
      })

      if (memberError) {
        console.error('Failed to create membership:', memberError)
        return NextResponse.json({ error: 'Failed to assign workspace owner' }, { status: 500 })
      }
    }

    // Seed starter demo data so workspace is never empty
    if (seedDemoData !== false) {
      await seedWorkspaceDemoData(org.id, profile?.id)
    }

    return NextResponse.json({ org }, { status: 201 })
  } catch (err) {
    console.error('Error in POST /api/orgs:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
