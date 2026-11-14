// lib/automation/microsite.ts
// Data Access Layer for Project Microsites / Digital Showrooms (Stage 6A)

import { createServiceClient } from '@/lib/supabase/server'
import type { ProjectMicrosite, MicrositeTheme } from './types'

export async function getMicrositeBySlug(slug: string): Promise<ProjectMicrosite | null> {
  const service = createServiceClient()
  try {
    const { data } = await service
      .from('project_microsites')
      .select('*')
      .eq('slug', slug)
      .eq('is_published', true)
      .maybeSingle()

    return (data as unknown as ProjectMicrosite) || null
  } catch {
    return null
  }
}

export async function getMicrositeByProject(projectId: string): Promise<ProjectMicrosite | null> {
  const service = createServiceClient()
  try {
    const { data } = await service
      .from('project_microsites')
      .select('*')
      .eq('project_id', projectId)
      .maybeSingle()

    return (data as unknown as ProjectMicrosite) || null
  } catch {
    return null
  }
}

export async function upsertProjectMicrosite(params: {
  orgId: string
  projectId: string
  slug: string
  title: string
  tagline?: string | null
  description?: string | null
  heroImageUrl?: string | null
  virtualTourUrl?: string | null
  masterPlanUrl?: string | null
  brochureUrl?: string | null
  videoUrl?: string | null
  accentColor?: string
  theme?: MicrositeTheme
  features?: string[]
  faqs?: Array<{ question: string; answer: string }>
  isPublished?: boolean
}): Promise<{ success: boolean; data?: ProjectMicrosite; error?: string }> {
  const service = createServiceClient()

  try {
    const payload = {
      org_id: params.orgId,
      project_id: params.projectId,
      slug: params.slug.toLowerCase().trim(),
      title: params.title,
      tagline: params.tagline || null,
      description: params.description || null,
      hero_image_url: params.heroImageUrl || null,
      virtual_tour_url: params.virtualTourUrl || null,
      master_plan_url: params.masterPlanUrl || null,
      brochure_url: params.brochureUrl || null,
      video_url: params.videoUrl || null,
      accent_color: params.accentColor || '#4f46e5',
      theme: params.theme || 'modern',
      features: (params.features || []) as unknown as import('@/types/database').Json,
      faqs: (params.faqs || []) as unknown as import('@/types/database').Json,
      is_published: params.isPublished ?? false,
      published_at: params.isPublished ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }

    const { data, error } = await service
      .from('project_microsites')
      .upsert(payload, { onConflict: 'project_id' })
      .select('*')
      .single()

    if (error) return { success: false, error: error.message }
    return { success: true, data: data as unknown as ProjectMicrosite }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, error: msg }
  }
}
