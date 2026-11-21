// app/(dashboard)/[orgSlug]/documents/page.tsx — document templates (cost sheets, quotations, letters…).
// Managers and above edit; everyone else can read them. Documents are created from a lead's page.
import type { Metadata } from 'next'
import { PageShell } from '@/components/layout/PageShell'
import { TemplateEditor } from '@/components/documents/TemplateEditor'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { getBusinessProfile, listTemplates } from '@/lib/dal/documents'
import { missingForLetterhead } from '@/lib/documents/letterhead'

export const metadata: Metadata = { title: 'Document templates' }
export const dynamic = 'force-dynamic'

export default async function DocumentsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params
  const { org, isManager, isAdmin } = await getVerifiedWorkspace(orgSlug)
  const [templates, profile] = await Promise.all([listTemplates(org.id), getBusinessProfile(org.id)])
  return (
    <PageShell
      title="Document templates"
      description="Cost sheets, quotations and letters on your letterhead, filled in for each buyer and shared with a private link from the lead’s page."
    >
      <TemplateEditor
        orgId={org.id}
        orgName={org.name}
        orgType={org.type}
        profile={profile}
        missing={missingForLetterhead(profile)}
        settingsHref={isAdmin ? `/${orgSlug}/settings/business` : null}
        templates={templates}
        canEdit={isManager}
      />
    </PageShell>
  )
}
