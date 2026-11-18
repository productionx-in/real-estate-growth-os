// app/(dashboard)/create-org/page.tsx
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Building2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { CreateOrgForm } from '@/components/auth/CreateOrgForm'
import { PRODUCT_NAME } from '@/lib/brand'
import Link from 'next/link'
import { canCreateOrganisation } from '@/lib/workspace/create'

export const metadata: Metadata = { title: 'Create Workspace' }
export const dynamic = 'force-dynamic'

export default async function CreateOrgPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')
  // Only show the form to people the API will accept (POST /api/orgs checks again).
  const allowed = await canCreateOrganisation(user.id)

  return (
    <div className="min-h-screen bg-[var(--background)] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-xl">
        <div className="flex items-center justify-center gap-2.5 mb-6">
          <div className="w-10 h-10 rounded-xl bg-[var(--brand)] flex items-center justify-center shadow-xs">
            <Building2 className="w-6 h-6 text-brand-foreground" />
          </div>
          <span className="text-xl font-bold tracking-tight text-[var(--foreground)]">
            {PRODUCT_NAME}
          </span>
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-7 sm:p-9 shadow-sm">
          <div className="mb-6">
            <h1 className="text-lg font-bold text-[var(--foreground)]">
              Create a new organisation workspace
            </h1>
            <p className="text-xs text-[var(--foreground-muted)] mt-1">
              Create an organisation for your property development firm or channel partner brokerage.
            </p>
          </div>

          {allowed ? <CreateOrgForm /> : (
            <div className="space-y-3 text-[14px] leading-relaxed text-muted">
              <p>New organisation workspaces are set up by the {PRODUCT_NAME} team, so each one starts with the right plan and owner.</p>
              <p>A new workspace is a separate organisation with its own data, team and subscription.</p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Link href="/demo" className="inline-flex h-10 items-center rounded-lg bg-brand px-4 text-[14px] font-semibold text-brand-foreground hover:bg-brand-hover">Contact us</Link>
                <Link href="/select-org" className="inline-flex h-10 items-center rounded-lg border border-strong px-4 text-[14px] font-medium text-foreground hover:bg-surface-hover">Back to your workspaces</Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
