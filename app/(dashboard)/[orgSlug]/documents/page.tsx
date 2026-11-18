// app/(dashboard)/[orgSlug]/documents/page.tsx — document templates (cost sheets, quotations, letters).
// Managers and above edit; everyone else can read them. Documents are created from a lead's page.
import type { Metadata } from 'next'
import { PageShell } from '@/components/layout/PageShell'
import { TemplateEditor } from '@/components/documents/TemplateEditor'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { listTemplates } from '@/lib/dal/documents'

export const metadata: Metadata = { title: 'Document templates' }
export const dynamic = 'force-dynamic'

export default async function DocumentsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params
  const { org, isManager } = await getVerifiedWorkspace(orgSlug)
  const templates = await listTemplates(org.id)
  return (
    <PageShell
      title="Document templates"
      description="Cost sheets, quotations and letters, filled in for each buyer and shared with a private link from the lead’s page."
    >
      <TemplateEditor orgId={org.id} templates={templates} canEdit={isManager} />
    </PageShell>
  )
}
