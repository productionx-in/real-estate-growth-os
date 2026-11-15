'use client'
// components/auth/AcceptInviteForm.tsx
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldCheck, UserCheck, ArrowRight, Loader2, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { ValidatedInvitation } from '@/lib/dal/invitations'

interface AcceptInviteFormProps {
  invitation: ValidatedInvitation
  token: string
}

const ROLE_LABELS: Record<string, string> = {
  owner: 'Organisation Owner',
  admin: 'Administrator',
  manager: 'Sales Manager',
  sales_exec: 'Sales Executive',
  readonly: 'Read Only Auditor',
}

export function AcceptInviteForm({ invitation, token }: AcceptInviteFormProps) {
  const router = useRouter()
  const supabase = createClient()

  const [currentUser, setCurrentUser] = useState<{ id: string; email?: string } | null>(null)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function checkSession() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          setCurrentUser({ id: user.id, email: user.email })
        }
      } catch {
        // Not logged in
      } finally {
        setCheckingAuth(false)
      }
    }
    checkSession()
  }, [supabase])

  // Accept as currently authenticated user
  async function handleAcceptLoggedIn() {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/invitations/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to accept invitation')
        setLoading(false)
        return
      }

      router.push(`/${data.orgSlug}`)
      router.refresh()
    } catch {
      setError('Network error. Failed to accept invitation.')
      setLoading(false)
    }
  }

  // Create new account & accept invitation
  async function handleCreateAndAccept(e: React.FormEvent) {
    e.preventDefault()
    if (!fullName.trim() || password.length < 8) return

    setLoading(true)
    setError(null)

    try {
      // 1. Sign up user via Supabase
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: invitation.email,
        password,
        options: {
          data: { full_name: fullName.trim() },
        },
      })

      if (signUpError) {
        // If user already exists, suggest logging in
        if (signUpError.message.toLowerCase().includes('already registered')) {
          setError('An account with this email already exists. Please sign in below to accept.')
          setLoading(false)
          return
        }
        throw signUpError
      }

      if (!authData.user) {
        throw new Error('User creation failed.')
      }

      // 2. Accept invitation
      const res = await fetch('/api/invitations/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to join organisation')
      }

      router.push(`/${data.orgSlug}`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  if (checkingAuth) {
    return (
      <div className="p-8 text-center text-[var(--foreground-muted)] text-[13px] flex items-center justify-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-[var(--brand)]" />
        <span>Verifying invitation credentials…</span>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Invitation Context Banner */}
      <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200 text-[13px] space-y-2">
        <div className="flex items-center gap-2 font-semibold text-blue-900">
          <ShieldCheck className="w-4 h-4 text-[var(--brand)]" />
          <span>Verified Organisation Invitation</span>
        </div>
        <div className="text-[12px] text-blue-800 space-y-1">
          <p>
            <strong>{invitation.inviterName}</strong> has invited you to join <strong>{invitation.orgName}</strong> as a <strong>{ROLE_LABELS[invitation.role] ?? invitation.role}</strong>.
          </p>
          <p className="text-[11px] text-blue-700">
            Work email: <span className="font-mono font-medium">{invitation.email}</span>
          </p>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-[var(--danger-bg)] border border-red-100 text-[12px] text-[var(--danger)] flex items-start gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {currentUser ? (
        <div className="space-y-4 pt-2">
          <div className="p-3 rounded-lg bg-gray-50 border border-[var(--border)] text-[12px] text-[var(--foreground-muted)]">
            Signed in as <strong className="text-[var(--foreground)]">{currentUser.email}</strong>
          </div>

          <button
            type="button"
            onClick={handleAcceptLoggedIn}
            disabled={loading}
            className="w-full py-2.5 px-4 text-[13px] font-semibold text-white bg-[var(--brand)] rounded-md hover:bg-[var(--brand-hover)] transition-colors flex items-center justify-center gap-2 disabled:opacity-60 shadow-2xs"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
            <span>Accept Invitation &amp; Enter Workspace</span>
          </button>
        </div>
      ) : (
        <form onSubmit={handleCreateAndAccept} className="space-y-4 pt-1">
          <div>
            <label className="block text-[12px] font-medium text-[var(--foreground)] mb-1">
              Your Full Name <span className="text-[var(--danger)]">*</span>
            </label>
            <input
              type="text"
              required
              value={fullName}
              disabled={loading}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Aditya Sharma"
              className="w-full px-3 py-2 text-[13px] bg-[var(--surface)] border border-[var(--border)] rounded-md outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-blue-100 transition-colors"
            />
          </div>

          <div>
            <label className="block text-[12px] font-medium text-[var(--foreground)] mb-1">
              Work Email
            </label>
            <input
              type="email"
              readOnly
              value={invitation.email}
              className="w-full px-3 py-2 text-[13px] bg-gray-50 border border-[var(--border)] rounded-md text-[var(--foreground-muted)] font-mono cursor-not-allowed"
            />
            <p className="text-[11px] text-[var(--foreground-subtle)] mt-1">
              This invitation is locked to this email address.
            </p>
          </div>

          <div>
            <label className="block text-[12px] font-medium text-[var(--foreground)] mb-1">
              Set Password <span className="text-[var(--danger)]">*</span>
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              disabled={loading}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              className="w-full px-3 py-2 text-[13px] bg-[var(--surface)] border border-[var(--border)] rounded-md outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-blue-100 transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !fullName.trim() || password.length < 8}
            className="w-full py-2.5 px-4 text-[13px] font-semibold text-white bg-[var(--brand)] rounded-md hover:bg-[var(--brand-hover)] transition-colors flex items-center justify-center gap-2 disabled:opacity-60 shadow-2xs mt-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
            <span>Set Password &amp; Join {invitation.orgName}</span>
          </button>
        </form>
      )}
    </div>
  )
}
