// app/p/[projectSlug]/page.tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getMicrositeBySlug } from '@/lib/automation/microsite'
import { createServiceClient } from '@/lib/supabase/server'
import { DigitalShowroomView } from '@/components/microsite/DigitalShowroomView'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ projectSlug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { projectSlug } = await params
  const microsite = await getMicrositeBySlug(projectSlug)
  if (!microsite) return { title: 'Project Not Found' }
  return {
    title: `${microsite.title} | Official Digital Showroom`,
    description: microsite.tagline || microsite.description || undefined,
  }
}

export default async function PublicDigitalShowroomPage({ params }: PageProps) {
  const { projectSlug } = await params
  const microsite = await getMicrositeBySlug(projectSlug)

  if (!microsite) {
    notFound()
  }

  const service = createServiceClient()
  const { data: project } = await service
    .from('projects')
    .select('name, rera_number, organisation:organisations(name)')
    .eq('id', microsite.project_id)
    .single()

  const projectName = project?.name || microsite.title
  const orgData = project?.organisation as unknown as { name?: string } | null
  const developerName = orgData?.name || 'Authorized Developer'
  const reraId = project?.rera_number || null

  return (
    <DigitalShowroomView
      microsite={microsite}
      projectName={projectName}
      developerName={developerName}
      reraId={reraId}
    />
  )
}
