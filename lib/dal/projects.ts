// lib/dal/projects.ts
import { createServiceClient } from '@/lib/supabase/server'
import { slugify } from '@/lib/utils/slugify'
import type { ProjectFormValues } from '@/lib/validations/project'
import type { Database } from '@/types/database'

type ProjectUpdate = Database['public']['Tables']['projects']['Update']

export async function getProjectsByOrg(orgId: string) {
  const service = createServiceClient()
  const { data } = await service
    .from('projects')
    .select('id, name, slug, code, category, type, status, city, location, rera_number, total_units_count, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
  return data ?? []
}

export async function getProjectById(projectId: string) {
  const service = createServiceClient()
  const { data } = await service
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .maybeSingle()
  return data
}

export async function createProject(orgId: string, values: ProjectFormValues) {
  const service = createServiceClient()
  const baseSlug = slugify(values.name)

  // Ensure slug unique within org
  let slug = baseSlug
  const { data: existing } = await service
    .from('projects')
    .select('id')
    .eq('org_id', orgId)
    .eq('slug', slug)
    .maybeSingle()

  if (existing) {
    slug = `${baseSlug}-${Math.random().toString(36).slice(2, 5)}`
  }

  const generatedCode = values.code?.trim() || `${slug.slice(0, 4).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`

  const { data, error } = await service
    .from('projects')
    .insert({
      org_id: orgId,
      name: values.name,
      slug,
      code: generatedCode,
      category: values.category,
      type: values.type,
      status: values.status,
      city: values.city || null,
      location: values.location || null,
      description: values.description || null,
      rera_number: values.rera_number || null,
      total_area_value: values.total_area_value || null,
      total_area_unit: values.total_area_unit || 'acres',
      total_units_count: values.total_units_count ?? 0,
      approval_authority: values.approval_authority || null,
      launch_date: values.launch_date || null,
      completion_date: values.completion_date || null,
    })
    .select()
    .single()

  return { project: data, error: error?.message ?? null }
}

export async function updateProject(projectId: string, values: Partial<ProjectFormValues>) {
  const service = createServiceClient()

  const payload: ProjectUpdate = {}
  if (values.name !== undefined) payload.name = values.name
  if (values.code !== undefined) payload.code = values.code
  if (values.category !== undefined) payload.category = values.category
  if (values.type !== undefined) payload.type = values.type
  if (values.status !== undefined) payload.status = values.status
  if (values.city !== undefined) payload.city = values.city || null
  if (values.location !== undefined) payload.location = values.location || null
  if (values.description !== undefined) payload.description = values.description || null
  if (values.rera_number !== undefined) payload.rera_number = values.rera_number || null
  if (values.total_area_value !== undefined) payload.total_area_value = values.total_area_value || null
  if (values.total_area_unit !== undefined) payload.total_area_unit = values.total_area_unit || 'acres'
  if (values.total_units_count !== undefined) payload.total_units_count = values.total_units_count ?? 0
  if (values.approval_authority !== undefined) payload.approval_authority = values.approval_authority || null
  if (values.launch_date !== undefined) payload.launch_date = values.launch_date || null
  if (values.completion_date !== undefined) payload.completion_date = values.completion_date || null

  const { data, error } = await service
    .from('projects')
    .update(payload)
    .eq('id', projectId)
    .select()
    .single()

  return { project: data, error: error?.message ?? null }
}
