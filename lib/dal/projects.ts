// lib/dal/projects.ts
import { createClient } from '@/lib/supabase/server'
import { slugify } from '@/lib/utils/slugify'
import type { ProjectFormValues } from '@/lib/validations/project'

export async function getProjectsByOrg(orgId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('projects')
    .select('id, name, slug, type, status, city, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
  return data ?? []
}

export async function createProject(orgId: string, values: ProjectFormValues) {
  const supabase = await createClient()
  const baseSlug = slugify(values.name)

  // Ensure slug unique within org
  let slug = baseSlug
  const { data: existing } = await supabase
    .from('projects')
    .select('id')
    .eq('org_id', orgId)
    .eq('slug', slug)
    .maybeSingle()

  if (existing) {
    slug = `${baseSlug}-${Math.random().toString(36).slice(2, 5)}`
  }

  const { data, error } = await supabase
    .from('projects')
    .insert({
      org_id: orgId,
      name: values.name,
      slug,
      type: values.type,
      status: values.status,
      city: values.city || null,
      location: values.location || null,
      description: values.description || null,
    })
    .select()
    .single()

  return { project: data, error: error?.message ?? null }
}
