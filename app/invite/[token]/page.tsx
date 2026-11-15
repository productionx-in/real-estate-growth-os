// app/invite/[token]/page.tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import { Building2, AlertTriangle, ArrowLeft } from 'lucide-react'
import { validateInvitationToken } from '@/lib/dal/invitations'
import { AcceptInviteForm } from '@/components/auth/AcceptInviteForm'

export const metadata: Metadata = { title: 'Accept Workspace Invitation' }
export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ token: string }>
}

export default async function InvitePage({ params }: PageProps) {
  const { token } = await params
  const invitation = await validateInvitationToken(token)

  return (
    <div className="min-h-screen bg-[var(--background)] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex items-center justify-center gap-2.5 mb-6">
          <div className="w-10 h-10 rounded-xl bg-[var(--brand)] flex items-center justify-center shadow-xs">
            <Building2 className="w-6 h-6 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight text-[var(--foreground)]">
            Real Estate Growth OS
          </span>
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-7 sm:p-9 shadow-sm">
          {invitation ? (
            <>
              <div className="mb-5">
                <h1 className="text-lg font-bold text-[var(--foreground)]">
                  Join {invitation.orgName}
                </h1>
                <p className="text-xs text-[var(--foreground-muted)] mt-1">
                  Activate your workspace account to access leads, deals, and projects.
                </p>
              </div>

              <AcceptInviteForm invitation={invitation} token={token} />
            </>
          ) : (
            <div className="text-center py-4 space-y-4">
              <div className="w-12 h-12 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 mx-auto">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h2 className="text-[16px] font-bold text-[var(--foreground)]">
                  Invitation Expired or Invalid
                </h2>
                <p className="text-[12px] text-[var(--foreground-muted)] max-w-sm mx-auto leading-relaxed">
                  This invitation link is invalid, has already been accepted, or has expired. Please contact your organisation administrator to request a new invitation.
                </p>
              </div>

              <div className="pt-2">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--brand)] hover:underline"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Return to Sign In</span>
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
