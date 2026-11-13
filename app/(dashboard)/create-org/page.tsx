// app/(dashboard)/create-org/page.tsx
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Building2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { CreateOrgForm } from '@/components/auth/CreateOrgForm'

export const metadata: Metadata = { title: 'Create Workspace' }
export const dynamic = 'force-dynamic'

export default async function CreateOrgPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return (
    <div className="min-h-screen bg-[var(--background)] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-xl">
        <div className="flex items-center justify-center gap-2.5 mb-6">
          <div className="w-10 h-10 rounded-xl bg-[var(--brand)] flex items-center justify-center shadow-xs">
            <Building2 className="w-6 h-6 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight text-[var(--foreground)]">
            Real Estate Growth OS
          </span>
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-7 sm:p-9 shadow-sm">
          <div className="mb-6">
            <h1 className="text-lg font-bold text-[var(--foreground)]">
              Set Up Your Real Estate Workspace
            </h1>
            <p className="text-xs text-[var(--foreground-muted)] mt-1">
              Create an organisation for your property development firm or channel partner brokerage.
            </p>
          </div>

          <CreateOrgForm />
        </div>
      </div>
    </div>
  )
}
